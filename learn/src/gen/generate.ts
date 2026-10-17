import type { SkillId } from "../content/skills";
import type { Data, Series } from "../state";
import { extendPrompt, outlinePrompt, repairOutline, videoPrompt } from "./prompts";
import { errorCode, getSample } from "./runtime";
import {
  estimateVideoSeconds,
  MIN_VIDEO_SECONDS,
  ScriptBuilder,
  type ScriptEvent,
  type Video,
} from "./script";

export class GenError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Words for a student when Claude could not be reached. */
export function genErrorText(code: string): string {
  switch (code) {
    case "not_granted":
      return "Adwen Maths needs your permission to ask Claude to write your videos. Allow it in this page's permissions, then try again.";
    case "rate_limited":
      return "Claude is busy or the usage limit was reached. Wait a few minutes, then try again.";
    case "sampling_disabled":
      return "Claude is switched off for this account, so new videos cannot be written.";
    case "unavailable":
      return "Videos are written by Claude, which is only available when Adwen Maths is opened on claude.ai.";
    case "cancelled":
      return "Stopped.";
    default:
      return "Something went wrong while writing your video. Try again.";
  }
}

async function sampleOrThrow() {
  const sample = await getSample();
  if (!sample) throw new GenError("unavailable", genErrorText("unavailable"));
  return sample;
}

export async function planSeries(d: Data, target: SkillId, signal?: AbortSignal): Promise<Series> {
  const sample = await sampleOrThrow();
  let raw: unknown = null;
  try {
    raw = await sample.json(outlinePrompt(d, target), { modelTier: "default", signal });
  } catch (e) {
    const code = errorCode(e);
    // An unreadable plan is replaced by one built from the skill graph; anything else is reported.
    if (code !== "invalid_json") throw new GenError(code, genErrorText(code));
  }
  const { intro, videos } = repairOutline(raw, d, target);
  return {
    id: `s${Date.now().toString(36)}`,
    target,
    createdAt: Date.now(),
    intro,
    videos,
  };
}

/**
 * Write one video, streaming. `onEvent` hears every scene and every finished
 * chapter as it arrives, so playback and narration can start early. A video
 * that comes out under three minutes gets two more chapters.
 */
export async function writeVideo(
  d: Data,
  series: Series,
  index: number,
  onEvent: (e: ScriptEvent) => void,
  signal?: AbortSignal,
): Promise<Video> {
  const sample = await sampleOrThrow();
  const run = async (prompt: string, base?: Video): Promise<Video> => {
    const b = new ScriptBuilder((e) => {
      // The extension's own "end" is reported once, below.
      if (e.k !== "end") onEvent(e);
    }, base);
    try {
      await sample(prompt, { modelTier: "default", signal, onText: (u) => b.push(u.delta) });
    } catch (e) {
      const code = errorCode(e);
      // Keep what was written before a failure if it is a usable video.
      const partial = b.finish();
      if (code === "cancelled" || !partial.chapters.length)
        throw new GenError(code, genErrorText(code));
      return partial;
    }
    return b.finish();
  };
  let video = await run(videoPrompt(d, series, index));
  if (!video.chapters.length) throw new GenError("empty", genErrorText("empty"));
  if (estimateVideoSeconds(video) < MIN_VIDEO_SECONDS) {
    try {
      video = await run(extendPrompt(d, series, index, video), video);
    } catch (e) {
      if (e instanceof GenError && e.code === "cancelled") throw e;
      /* keep the shorter video rather than nothing */
    }
  }
  onEvent({ k: "end", video });
  return video;
}
