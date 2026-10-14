import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

export interface TtsRoutesOptions {
  /** Base URL of the Python inference worker, e.g. http://localhost:8000. Undefined disables TTS. */
  inferenceUrl: string | undefined;
}

const TtsBody = z.object({
  text: z.string().min(1).max(5000),
  voice_id: z
    .string()
    .regex(/^[0-9a-f]{12}$/)
    .optional(),
  format: z.enum(["wav", "mp3", "flac"]).default("wav"),
  exaggeration: z.number().min(0).max(2).optional(),
  cfg_weight: z.number().min(0).max(1).optional(),
  temperature: z.number().min(0.05).max(2).optional(),
  seed: z.number().int().min(0).optional(),
});

/** Thin proxy in front of the inference worker so clients only ever talk to this API. */
export const ttsRoutes: FastifyPluginAsync<TtsRoutesOptions> = async (app, { inferenceUrl }) => {
  const upstream = (path: string): URL | null =>
    inferenceUrl ? new URL(path, inferenceUrl) : null;

  app.get("/v1/voices", async (_req, reply) => {
    const url = upstream("/v1/voices");
    if (!url) return reply.code(503).send(unavailable());
    const res = await fetch(url);
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (!res.ok) {
      const detail = await res.text();
      const status =
        res.status === 404 || res.status === 400 || res.status === 413 ? res.status : 502;
      return reply
        .code(status)
        .send({ error: "inference_error", upstream_status: res.status, detail });
    }

    reply.header("content-type", res.headers.get("content-type") ?? "application/octet-stream");
    for (const name of ["content-disposition", "x-audio-duration-seconds", "x-synthesis-seconds"]) {
      const value = res.headers.get(name);
      if (value) reply.header(name, value);
    }
    return reply.send(res.body ? Readable.fromWeb(res.body as WebReadableStream) : Buffer.alloc(0));
  });
};

function unavailable() {
  return {
    error: "inference_unavailable",
    message: "INFERENCE_URL is not configured; start the worker and set INFERENCE_URL",
  };
}
