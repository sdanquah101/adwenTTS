import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/config/env.js";

const app = buildApp({ env: loadEnv({ NODE_ENV: "test" }) });

beforeAll(() => app.ready());
afterAll(() => app.close());

describe("GET /health", () => {
  it("reports ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    expect(typeof res.json().uptime).toBe("number");
  });
});

describe("GET /ready", () => {
  it("reports ready", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });
});

describe("unknown route", () => {
  it("returns 404 JSON", async () => {
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
  });
});
