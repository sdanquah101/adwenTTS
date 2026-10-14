# AdwenTTS

Voice-cloning text-to-speech for Ghanaian-accented English. Give it a short clip of a speaker and
some text, download the audio.

Two parts:

| Part             | Where                         | What                                                                                                                                       |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Inference worker | [`worker/`](worker/README.md) | Python. Runs the TTS model (Chatterbox, MIT) with a REST API, CLI and web UI. Needs a GPU for real synthesis; a mock engine runs anywhere. |
| API              | `src/`                        | TypeScript + [Fastify](https://fastify.dev). Health endpoints and a proxy in front of the worker.                                          |

## Fastest way to try it (free GPU)

Open [`notebooks/AdwenTTS_Colab.ipynb`](notebooks/AdwenTTS_Colab.ipynb) in Google Colab, pick a T4
GPU runtime, run the cells. The last cell prints a public link to a page where you upload a
10 to 20 second reference clip, type text and download the result as WAV or MP3.

## API service

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
