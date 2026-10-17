import type { VoicePref } from "../state";
import { errorCode, getDb, getMcp, type DocRef } from "./runtime";
import type { Line } from "./script";

/**
 * Narration in the AdwenTTS voice, through a Claude Code session.
 *
 * The page cannot reach the AdwenTTS server itself (claude.ai pages have no
 * network), so it leaves a request in the shared `narration` collection and
 * messages the narrator session through the Claude Code Remote connector.
 * That session records each line with AdwenTTS, joins a chapter into one
 * audio file, stores it with the page and writes back the file id and the
 * second each line starts at. The page watches the request and plays the
 * chapter as soon as it is there.
 *
 * Requests are named by a hash of their text and voice, so a chapter that was
 * recorded once is never recorded again.
 */

export interface NarratorConfig {
  session: string;
  /** This page's claude.ai link, so the narrator knows where to store the audio. */
  artifact: string;
  /** AdwenTTS voice names for each preference. */
  voices: { female: string; male: string };
  /** Set by the narrator when the TTS server is down, with a note for students. */
  offline?: string;
}

export type NarrationState =
  | { status: "queued" | "working" }
  | { status: "done"; asset: string; marks: number[]; duration: number }
  | { status: "failed"; error: string };

export interface NarrationRequest {
  id: string;
  /** Unsubscribe and stop nudging the narrator. */
  stop(): void;
}

export const CONNECTOR = "Claude Code Remote";

let configPromise: Promise<NarratorConfig | null> | null = null;
export function narratorConfig(): Promise<NarratorConfig | null> {
  configPromise ??= (async () => {
    const db = await getDb();
    if (!db) return null;
    try {
      const snap = await db.doc("config/narrator").get();
      const d = snap.exists ? snap.data() : undefined;
      if (!d || typeof d.session !== "string") return null;
      const v = (d.voices ?? {}) as Record<string, unknown>;
      const voice = (x: unknown) => (typeof x === "string" && x ? x : "TTS");
      return {
        session: d.session,
        artifact: typeof d.artifact === "string" ? d.artifact : "",
        voices: { female: voice(v.female), male: voice(v.male) },
        offline: typeof d.offline === "string" && d.offline ? d.offline : undefined,
      };
    } catch {
      return null;
    }
  })();
  return configPromise;
}

export function voiceName(cfg: NarratorConfig, pref: VoicePref): string {
  return pref === "male" ? cfg.voices.male : cfg.voices.female;
}

/** FNV-1a, enough to name a request by its content. */
export function requestId(voice: string, lines: Line[]): string {
  let h = 0x811c9dc5;
  const text = `${voice}\u0000${lines.map((l) => `${l.id}\u0001${l.text}`).join("\u0002")}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `n${h.toString(36)}${text.length.toString(36)}`;
}

function readState(d: Record<string, unknown> | undefined): NarrationState | null {
  if (!d) return null;
  if (d.status === "done" && typeof d.asset === "string" && Array.isArray(d.marks))
    return {
      status: "done",
      asset: d.asset,
      marks: d.marks.map(Number),
      duration: Number(d.duration) || 0,
    };
  if (d.status === "failed") return { status: "failed", error: String(d.error ?? "") };
  if (d.status === "working") return { status: "working" };
  return { status: "queued" };
}

// One nudge message at a time; the narrator works through every queued request it finds.
const NUDGE_EVERY = 20_000;
let lastNudge = 0;
const waiting = new Set<string>();
let nudgeTimer: number | undefined;

async function nudge(cfg: NarratorConfig): Promise<string | null> {
  if (!waiting.size || Date.now() - lastNudge < NUDGE_EVERY - 500) return null;
  const mcp = await getMcp();
  if (!mcp) return "no_connector";
  lastNudge = Date.now();
  try {
    await mcp.callTool(CONNECTOR, "send_message", {
      session_id: cfg.session,
      message: `Adwen Maths narration request: ${[...waiting].join(", ")} in the "narration" collection of ${cfg.artifact || "the Adwen Maths page"}. Please record every queued request.`,
    });
    return null;
  } catch (e) {
    return errorCode(e);
  }
}

function scheduleNudges(cfg: NarratorConfig, onError: (code: string) => void) {
  if (nudgeTimer !== undefined) return;
  const tick = async () => {
    const err = await nudge(cfg);
    if (err) onError(err);
    nudgeTimer = waiting.size ? window.setTimeout(tick, NUDGE_EVERY) : undefined;
  };
  nudgeTimer = window.setTimeout(tick, 0);
}

/**
 * Ask for one chapter's narration. `onState` hears every change, including
 * an immediate "done" when the chapter was recorded before.
 */
export async function requestNarration(opts: {
  lines: Line[];
  voice: string;
  title: string;
  onState: (s: NarrationState) => void;
  onError: (code: string) => void;
}): Promise<NarrationRequest | null> {
  const [db, cfg] = await Promise.all([getDb(), narratorConfig()]);
  if (!db || !cfg) return null;
  const id = requestId(opts.voice, opts.lines);
  const ref: DocRef = db.doc(`narration/${id}`);
  let unsub: (() => void) | null = null;
  try {
    const snap = await ref.get();
    const prev = snap.exists ? readState(snap.data()) : null;
    if (!prev || prev.status === "failed") {
      await ref.set({
        status: "queued",
        voice: opts.voice,
        title: opts.title,
        lines: opts.lines.map((l) => ({ id: l.id, text: l.text })),
        at: Date.now(),
      });
    }
  } catch (e) {
    opts.onError(errorCode(e));
    return null;
  }
  unsub = ref.onSnapshot(
    (snap) => {
      const st = readState(snap.exists ? snap.data() : undefined);
      if (!st) return;
      if (st.status === "queued") {
        waiting.add(id);
        scheduleNudges(cfg, opts.onError);
      } else waiting.delete(id);
      opts.onState(st);
    },
    (e) => opts.onError(e.code),
  );
  return {
    id,
    stop() {
      unsub?.();
      unsub = null;
      waiting.delete(id);
    },
  };
}
