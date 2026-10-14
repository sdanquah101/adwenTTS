import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({});
    expect(env).toEqual({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      PORT: 3000,
      LOG_LEVEL: "info",
    });
  });

  it("coerces PORT to a number", () => {
    expect(loadEnv({ PORT: "8080" }).PORT).toBe(8080);
  });

  it("rejects invalid values with a readable error", () => {
    let error: unknown;
    try {
      loadEnv({ PORT: "not-a-port", NODE_ENV: "staging" });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/^Invalid environment configuration:/);
    expect(message).toMatch(/PORT/);
    expect(message).toMatch(/NODE_ENV/);
  });
});
