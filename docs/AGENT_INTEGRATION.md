# Giving AdwenTTS to an AI model

An AI model needs three things: a URL it can reach, a key, and a way to get the audio to
the user. AdwenTTS provides all three.

| What               | Where it comes from                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Base URL           | Printed by the Colab notebook's "Public API" cell (a `https://....trycloudflare.com` address), or wherever you host the worker |
| API key            | Printed by the same cell, or whatever you pass to `adwentts serve --api-key`                                                   |
| Audio for the user | Every synthesis can return JSON with an `audio_url`. The link needs no key and plays or downloads in any browser               |

The base URL and key change every time the Colab session restarts.

## Recommended flow for a model

1. `GET /v1/voices` to learn the saved voices.
2. `POST /v1/tts` with `response: "json"` and a `voice` name.
3. Hand the returned `audio_url` to the user.

```sh
BASE=https://your-tunnel.trycloudflare.com
KEY=your-api-key

curl -s "$BASE/v1/voices" -H "Authorization: Bearer $KEY"

curl -s -X POST "$BASE/v1/tts" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"text": "Akwaaba, welcome to Accra.", "voice": "Kofi", "format": "mp3", "response": "json"}'
```

Response:

```json
{
  "id": "3f9a2c7d1e5b8a04",
  "audio_url": "https://your-tunnel.trycloudflare.com/v1/audio/3f9a2c7d1e5b8a04.mp3",
  "format": "mp3",
  "duration_seconds": 2.9,
  "sample_rate": 24000,
  "synthesis_seconds": 1.4,
  "voice_id": "0123456789ab",
  "engine": "chatterbox"
}
```

The machine-readable spec is at `GET /openapi.json`; many agent frameworks can import it directly.

## Option A: MCP (Claude, Claude Desktop, Cursor, and other MCP clients)

The worker serves the Model Context Protocol over streamable HTTP at `POST {BASE}/mcp`, with
two tools: `list_voices` and `text_to_speech`. Authenticate with the same bearer key.

**Claude API, server-side connection (no tool loop to write):**

```python
import anthropic

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY in the environment

BASE = "https://your-tunnel.trycloudflare.com"
KEY = "your-adwentts-key"

response = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=16000,
    betas=["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
    fallbacks="default",
    mcp_servers=[
        {"type": "url", "url": f"{BASE}/mcp", "name": "adwentts", "authorization_token": KEY}
    ],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "adwentts"}],
    messages=[
        {
            "role": "user",
            "content": "Say 'Akwaaba, welcome to Accra' in Kofi's voice and give me the link.",
        }
    ],
)
for block in response.content:
    if block.type == "text":
        print(block.text)
```

**Claude Desktop / Cursor / any MCP client config:**

```json
{
  "mcpServers": {
    "adwentts": {
      "url": "https://your-tunnel.trycloudflare.com/mcp",
      "headers": { "Authorization": "Bearer your-adwentts-key" }
    }
  }
}
```

## Option B: a function-calling tool (any model)

Register this tool with whatever model or framework you use, and have your code call
`POST /v1/tts` with `response: "json"` when the model invokes it.

```json
{
  "name": "text_to_speech",
  "description": "Convert English text to speech in a cloned Ghanaian voice. Returns an audio_url to give to the user. Use list_voices first to pick a voice name.",
  "input_schema": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "description": "What to say, under 5000 characters" },
      "voice": { "type": "string", "description": "Saved voice name or id" },
      "format": { "type": "string", "enum": ["mp3", "wav", "flac"], "default": "mp3" }
    },
    "required": ["text", "voice"],
    "additionalProperties": false
  }
}
```

## Option C: OpenAI-compatible speech endpoint

Frameworks that already speak the OpenAI text-to-speech API can point at
`POST {BASE}/v1/audio/speech` with the bearer key. Body: `input`, `voice` (a saved voice
name), `response_format` (`mp3`, `wav`, `flac`). The reply is the audio file.

## Saving voices

Voices are created from reference clips, which a model cannot upload. Create them once,
from the notebook's "Add voices" cell, the web UI, or:

```sh
curl -s -X POST "$BASE/v1/voices" -H "Authorization: Bearer $KEY" \
  -F name=Kofi -F file=@kofi.wav
```

## Through the Fastify API

If you front the worker with the Node service in `src/`, set `INFERENCE_URL` and
`INFERENCE_API_KEY` there; it exposes `POST /v1/text-to-speech` and `GET /v1/voices` with the
same bodies and forwards the key for you.
