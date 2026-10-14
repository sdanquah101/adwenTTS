import type { FastifyPluginAsync } from "fastify";

/** Liveness and readiness endpoints for load balancers and orchestrators. */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }));

  app.get("/ready", async () => ({ status: "ready" }));
};
