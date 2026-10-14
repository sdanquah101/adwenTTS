import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

/** Stand-in for the Python worker: returns a tiny WAV for any request. */
const fakeWorker = Fastify();
fakeWorker.get("/v1/voices", async () => [{ id: "0123456789ab", name: "Kofi" }]);
fakeWorker.post<{ Body: { text: string; voice_id?: string } }>("/v1/tts", async (req, reply) => {
  if (req.body.voice_id === "ffffffffffff")
    return reply.code(404).send({ detail: "voice not found" });
  return reply
    .header("content-type", "audio/wav")
    .header("content-disposition", 'attachment; filename="speech.wav"')
    .header("x-audio-duration-seconds", "1.5")
    .send(Buffer.from("RIFF....WAVEfmt " + req.body.text));
});

let withWorker: ReturnType<typeof buildApp>;
const withoutWorker = buildApp({ env: loadEnv({ NODE_ENV: "test" }) });

beforeAll(async () => {
  await fakeWorker.listen({ host: "127.0.0.1", port: 0 });
  const address = fakeWorker.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  withWorker = buildApp({
    env: loadEnv({
      NODE_ENV: "test",
      INFERENCE_URL: `http://127.0.0.1:${port}`,
      INFERENCE_API_KEY: "worker-key",
    }),
  });
  await Promise.all([withWorker.ready(), withoutWorker.ready()]);
});

afterAll(async () => {
  await Promise.all([withWorker.close(), withoutWorker.close(), fakeWorker.close()]);
});

describe("POST /v1/text-to-speech", () => {
  it("is 503 when no worker is configured", async () => {
    const res = await withoutWorker.inject({
      method: "POST",
      url: "/v1/text-to-speech",
      payload: { text: "hi" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("inference_unavailable");
  });

  it("rejects invalid bodies before calling the worker", async () => {
    const res = await withWorker.inject({
      method: "POST",
      url: "/v1/text-to-speech",
      payload: { text: "", format: "ogg" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
  });

  it("streams audio and headers back from the worker", async () => {
    const res = await withWorker.inject({
      method: "POST",
      url: "/v1/text-to-speech",
      payload: { text: "Akwaaba", voice_id: "0123456789ab", format: "wav" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/wav");
    expect(res.headers["content-disposition"]).toContain("speech.wav");
    expect(res.headers["x-audio-duration-seconds"]).toBe("1.5");
    expect(res.rawPayload.toString()).toContain("Akwaaba");
  });

  it("returns the worker's JSON when response is json", async () => {
    const res = await withWorker.inject({
      method: "POST",
      url: "/v1/text-to-speech",
      payload: { text: "Akwaaba", voice: "Kofi", response: "json" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ audio_url: "https://w/v1/audio/x.wav", duration_seconds: 1.5 });
  });

  it("passes through worker 404s", async () => {
    const res = await withWorker.inject({
      method: "POST",
      url: "/v1/text-to-speech",
      payload: { text: "hi", voice_id: "ffffffffffff" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("inference_error");
  });
});

describe("GET /v1/voices", () => {
  it("proxies the voice list", async () => {
    const res = await withWorker.inject({ method: "GET", url: "/v1/voices" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: "0123456789ab", name: "Kofi" }]);
  });
});
