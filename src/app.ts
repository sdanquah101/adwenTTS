import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import type { Env } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { ttsRoutes } from "./routes/tts.js";

type LoggerOption = NonNullable<FastifyServerOptions["logger"]>;

export interface BuildAppOptions {
  env: Env;
  /** Override the logger (e.g. `false` in tests). Defaults to a level/env-appropriate pino config. */
  logger?: LoggerOption;
}

/** Build a fully configured Fastify instance without starting to listen. */
export function buildApp({ env, logger }: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: logger ?? loggerOptions(env) });

  app.register(healthRoutes);
  app.register(ttsRoutes, {
    inferenceUrl: env.INFERENCE_URL,
    inferenceApiKey: env.INFERENCE_API_KEY,
  });

  return app;
}

function loggerOptions(env: Env): LoggerOption {
  if (env.NODE_ENV === "test") return false;
  if (env.NODE_ENV === "development") {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:standard" },
      },
    };
  }
  return { level: env.LOG_LEVEL };
}
