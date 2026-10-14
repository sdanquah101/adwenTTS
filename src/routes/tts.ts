import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { z } from "zod";

export interface TtsRoutesOptions {
  /** Base URL of the Python inference worker, e.g. http://localhost:8000. Undefined disables TTS. */
  inferenceUrl: string | undefined;
  /** Bearer key the worker expects, forwarded on every upstream call. */
  inferenceApiKey: string | undefined;
}

const TtsBody = z.object({
  text: z.string().min(1).max(5000),
  voice: z.string().min(1).max(80).optional(),
  voice_id: z
    .string()
    .regex(/^[0-9a-f]{12}$/)
    .optional(),
  format: z.enum(["wav", "mp3", "flac"]).default("wav"),
  response: z.enum(["audio", "json"]).default("audio"),
  exaggeration: z.number().min(0).max(2).optional(),
  cfg_weight: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0.05).max(2).optional(),
  seed: z.number().int().min(0).optional(),
});

/** Thin proxy in front of the inference worker so clients only ever talk to this API. */
export const ttsRoutes: FastifyPluginAsync<TtsRoutesOptions> = async (
  app,
  { inferenceUrl, inferenceApiKey },
) => {
  const upstream = (path: string): URL | null =>
    inferenceUrl ? new URL(path, inferenceUrl) : null;
  const headers = (extra: Record<string, string> = {}): Record<string, string> =>
    inferenceApiKey ? { ...extra, authorization: `Bearer ${inferenceApiKey}` } : extra;

  app.get("/v1/voices", async (_req, reply) => {
    const url = upstream("/v1/voices");
    if (!url) return reply.code(503).send(unavailable());
    const res = await fetch(url, { headers: headers() });
    return reply.code(res.status).send(await res.json());
  });

  app.post("/v1/text-to-speech", async (req, reply) => {
    const url = upstream("/v1/tts");
    if (!url) return reply.code(503).send(unavailable());

    const parsed = TtsBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    }

    const res = await fetch(url, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const detail = await res.text();
      const passthrough = [400, 401, 404, 413];
      const status = passthrough.includes(res.status) ? res.status : 502;
      return reply
        .code(status)
        .send({ error: "inference_error", upstream_status: res.status, detail });
    }

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (contentType.startsWith("application/json")) {
      return reply.send(await res.json());
    }
    return streamAudio(reply, res);
  });
};

function streamAudio(reply: FastifyReply, res: Response): FastifyReply {
  reply.header("content-type", res.headers.get("content-type") ?? "application/octet-stream");
  for (const name of ["content-disposition", "x-audio-duration-seconds", "x-synthesis-seconds"]) {
    const value = res.headers.get(name);
    if (value) reply.header(name, value);
  }
  return reply.send(res.body ? Readable.fromWeb(res.body as WebReadableStream) : Buffer.alloc(0));
}

function unavailable() {
  return {
    error: "inference_unavailable",
    message: "INFERENCE_URL is not configured; start the worker and set INFERENCE_URL",
  };
}
