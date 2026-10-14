# AdwenTTS

Backend API service for AdwenTTS, built with TypeScript and [Fastify](https://fastify.dev).

## Requirements

- Node.js 22+ (see `.nvmrc`)
- pnpm 10 (`corepack enable` installs the pinned version)

## Getting started

```sh
pnpm install
cp .env.example .env
pnpm dev
```

The server listens on `http://localhost:3000` by default.

| Endpoint  | Purpose                     |
| --------- | --------------------------- |
| `/health` | Liveness: status and uptime |
| `/ready`  | Readiness probe             |

## Scripts

| Script           | What it does                              |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Start with hot reload and pretty logs     |
| `pnpm build`     | Compile to `dist/`                        |
| `pnpm start`     | Run the compiled server                   |
| `pnpm test`      | Run the Vitest suite                      |
| `pnpm typecheck` | Type-check source and tests               |
| `pnpm lint`      | ESLint                                    |
| `pnpm format`    | Prettier (write)                          |
| `pnpm check`     | Lint, typecheck, test and build in one go |

## Configuration

Environment variables are validated at startup with Zod in `src/config/env.ts`.
Invalid or missing values fail fast with a readable error. See `.env.example`.

## Project layout

```
src/
  app.ts          builds the Fastify instance (no listening) so tests can inject requests
  server.ts       entry point: loads env, starts listening, handles graceful shutdown
  config/env.ts   environment schema and loader
  routes/         route plugins
test/             Vitest suites
```

## Docker

```sh
docker build -t adwentts .
docker run --rm -p 3000:3000 adwentts
```
