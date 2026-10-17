import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";

/**
 * The scene language Claude writes explainer videos in. Every scene is
 * something the player can draw and animate; narration lives beside it in
 * `say`. Claude streams a video as JSON lines (see `VIDEO_FORMAT`), and
 * everything here repairs or drops what it gets wrong, so a bad line can
 * never break a video.
 */

export interface Pan {
  x?: number;
  units?: number;
}

export type BalanceAction =
  | { type: "removeUnits"; n: number; label: string }
  | { type: "removeX"; n: number; label: string }
  | { type: "share"; groups: number; label: string };

export interface Tile {
  kind: "x" | "1";
  /** Negative for negative tiles. */
  n: number;
}

export const ICONS = {
  market: "🧺",
  money: "💵",
  phone: "📱",
  football: "⚽",
  bus: "🚌",
  farm: "🌽",
  food: "🍲",
  cake: "🎂",
  thermometer: "🌡️",
  scale: "⚖️",
  bank: "🏦",
  school: "🏫",
  music: "🎵",
  shop: "🏪",
  water: "💧",
  map: "🗺️",
  idea: "💡",
} as const;
export type IconName = keyof typeof ICONS;

export type Visual =
  | { type: "title"; kicker: string; title: string }
  | { type: "steps"; lines: { expr: string; note?: string }[] }
  | {
      type: "balance";
      math: string;
      left: Pan;
      right: Pan;
      actions: BalanceAction[];
      result: string;
    }
  | { type: "numberline"; math: string; start: number; by: number; min: number; max: number }
  | { type: "tiles"; math: string; tiles: Tile[]; result: string }
  | { type: "contrast"; wrong: string; right: string; why: string }
  | { type: "rule"; title: string; body: string[] }
  | {
      type: "bars";
      math: string;
      rows: { parts: number; shaded: number; label: string }[];
      result: string;
    }
  | { type: "grid100"; math: string; shaded: number; result: string }
  | { type: "story"; icon: IconName; title: string; lines: string[] }
  | { type: "mapping"; title: string; pairs: { from: string; to: string }[] }
  | { type: "quote"; text: string }
  | { type: "think"; question: string; math?: string; answer: string; hint?: string };

export type SceneType = Visual["type"];

/** A scene plus its narration. `reveal` is only for `think`: what the narrator says after the pause. */
export type GenScene = Visual & { say: string; reveal?: string };

export interface Chapter {
  title: string;
  /** Mistakes this chapter is built to fix: the end quiz sends a student back here. */
  addresses: MisconceptionId[];
  scenes: GenScene[];
}

export interface Video {
  title: string;
  goal: string;
  chapters: Chapter[];
}

/** One spoken line, the unit the narrator records. */
export interface Line {
  id: string;
  text: string;
}

// ---------------------------------------------------------------- narration helpers

export function linesOf(ch: Chapter, ci: number): Line[] {
  const out: Line[] = [];
  ch.scenes.forEach((sc, si) => {
    out.push({ id: `c${ci}s${si}`, text: sc.say });
    if (sc.type === "think" && sc.reveal) out.push({ id: `c${ci}s${si}r`, text: sc.reveal });
  });
  return out;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Spoken words in a video. */
export function videoWords(v: Video): number {
  let n = 0;
  for (const ch of v.chapters)
    for (const sc of ch.scenes) n += wordCount(sc.say) + wordCount(sc.reveal ?? "");
  return n;
}

/** Narration runs at about 145 words a minute, plus a short breath between lines. */
export function estimateVideoSeconds(v: Video): number {
  let lines = 0;
  for (const ch of v.chapters) lines += linesOf(ch, 0).length;
  return Math.round((videoWords(v) / 145) * 60 + lines * 0.6);
}

export const MIN_VIDEO_SECONDS = 180;

// ---------------------------------------------------------------- the wire format

export const VIDEO_FORMAT = `Write the video as JSON Lines: one JSON object per line, nothing else (no prose, no code fences).
First line: {"k":"video","title":string,"goal":string}
Then for each chapter: {"k":"chapter","title":string,"addresses":[misconception ids this chapter fixes, may be empty]}
followed by its scenes, each {"k":"scene","type":...,"say":string, ...fields}.
Last line: {"k":"end"}

Scene types and their fields (all maths in plain text, e.g. "3x + 5 = 20", "2/3", use − for minus):
- title: kicker, title. Opening card of the video.
- story: icon (one of ${Object.keys(ICONS).join(", ")}), title, lines (1-4 short lines). An analogy or a real-life situation.
- mapping: title, pairs (1-4 of {from, to}). Shows how the analogy maps onto the maths, e.g. {"from":"the scale stays level","to":"both sides stay equal"}.
- steps: lines (1-7 of {expr, note?}). A worked solution, one line per step; notes are 2-6 words.
- balance: math, left {x, units}, right {x, units}, actions, result. A balance scale for an equation with whole numbers: x bags and unit blocks (x at most 10, units at most 20 per pan, never negative). actions: {"type":"removeUnits","n":k,"label":...} takes k units off both pans, {"type":"removeX","n":k,"label":...} takes k bags off both, {"type":"share","groups":k,"label":...} splits both pans into k equal groups (everything must divide exactly). result like "x = 4".
- numberline: math, start, by, min, max. Integers; one hop of size |by| from start (|by| at most 15, max − min at most 24).
- tiles: math, tiles (list of {kind:"x"|"1", n}), result. Algebra tiles for collecting like terms; n negative for negative tiles; at most 20 tiles.
- bars: math, rows (1-4 of {parts 1-12, shaded 0-parts, label}), result. Fraction bars.
- grid100: math, shaded (0-100), result. A hundred square for percentages.
- contrast: wrong, right, why. A common mistake next to the correct working.
- rule: title, body (1-5 short lines). A rule to remember.
- quote: text. One key sentence, shown large.
- think: question, math?, answer, hint?, plus "reveal": what you say after the student has tried. The video pauses on this scene so the student can try first; "say" poses the question and ends by asking them to pause and try.`;

// ---------------------------------------------------------------- parsing and repair

const MINUS = "−";

/** Tidy a maths string: real minus signs, single spaces, no stray markup. */
export function cleanMath(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  let t = v
    .replace(/[<>`$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/(^|[\s(=+×÷*/])-(?=[\dA-Za-z(])/g, `$1${MINUS}`).replace(/ - /g, ` ${MINUS} `);
  t = t.replace(/\*/g, "×");
  if (!t || t.length > max) return null;
  return t;
}

export function cleanText(v: unknown, max = 220): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

const int = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v)
    ? v
    : typeof v === "string" && /^-?\d+$/.test(v.trim())
      ? Number(v)
      : null;

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function balanceOk(left: Required<Pan>, right: Required<Pan>, actions: BalanceAction[]): boolean {
  let L = { ...left };
  let R = { ...right };
  for (const a of actions) {
    if (a.type === "removeUnits") {
      if (a.n < 1 || a.n > L.units || a.n > R.units) return false;
      L = { ...L, units: L.units - a.n };
      R = { ...R, units: R.units - a.n };
    } else if (a.type === "removeX") {
      if (a.n < 1 || a.n > L.x || a.n > R.x) return false;
      L = { ...L, x: L.x - a.n };
      R = { ...R, x: R.x - a.n };
    } else {
      const k = a.groups;
      if (k < 2 || [L.x, L.units, R.x, R.units].some((n) => n % k !== 0)) return false;
      L = { x: L.x / k, units: L.units / k };
      R = { x: R.x / k, units: R.units / k };
    }
  }
  return true;
}

/** Turn whatever Claude sent for one scene into a drawable scene, or null. */
export function repairVisual(raw: Record<string, unknown>): Visual | null {
  const type = raw.type;
  switch (type) {
    case "title": {
      const title = cleanText(raw.title, 90);
      if (!title) return null;
      return { type, kicker: cleanText(raw.kicker, 40) ?? "", title };
    }
    case "steps": {
      const lines = arr(raw.lines)
        .map((l) => {
          const o = typeof l === "string" ? { expr: l } : obj(l);
          const expr = cleanMath(o.expr, 70);
          if (!expr) return null;
          const note = cleanText(o.note, 40);
          return note ? { expr, note } : { expr };
        })
        .filter((l): l is { expr: string; note?: string } => !!l)
        .slice(0, 7);
      return lines.length ? { type, lines } : null;
    }
    case "balance": {
      const m = cleanMath(raw.math);
      const result = cleanMath(raw.result, 40);
      const l = obj(raw.left);
      const r = obj(raw.right);
      const left = { x: int(l.x) ?? 0, units: int(l.units) ?? 0 };
      const right = { x: int(r.x) ?? 0, units: int(r.units) ?? 0 };
      const sizes = [left.x, right.x, left.units, right.units];
      if (!m || !result || sizes.some((n) => n < 0) || left.x > 10 || right.x > 10) return null;
      if (left.units > 20 || right.units > 20 || left.x + right.x === 0) return null;
      const actions: BalanceAction[] = [];
      for (const a of arr(raw.actions).slice(0, 4)) {
        const o = obj(a);
        const label = cleanText(o.label, 50) ?? "";
        if (o.type === "removeUnits" && int(o.n) !== null)
          actions.push({ type: "removeUnits", n: int(o.n)!, label });
        else if (o.type === "removeX" && int(o.n) !== null)
          actions.push({ type: "removeX", n: int(o.n)!, label });
        else if (o.type === "share" && int(o.groups) !== null)
          actions.push({ type: "share", groups: int(o.groups)!, label });
        else return null;
      }
      if (!balanceOk(left, right, actions)) return null;
      return { type, math: m, left, right, actions, result };
    }
    case "numberline": {
      const m = cleanMath(raw.math);
      const start = int(raw.start);
      const by = int(raw.by);
      if (!m || start === null || by === null || by === 0 || Math.abs(by) > 15) return null;
      const end = start + by;
      let min = int(raw.min) ?? Math.min(start, end) - 1;
      let max = int(raw.max) ?? Math.max(start, end) + 1;
      min = Math.min(min, start - 1, end - 1);
      max = Math.max(max, start + 1, end + 1);
      if (max - min > 24) {
        // Keep the hop in view and trim the rest.
        min = Math.min(start, end) - 1;
        max = Math.max(start, end) + 1;
        if (max - min > 24) return null;
      }
      return { type, math: m, start, by, min, max };
    }
    case "tiles": {
      const m = cleanMath(raw.math);
      const result = cleanMath(raw.result, 40);
      const tiles = arr(raw.tiles)
        .map((t) => {
          const o = obj(t);
          const n = int(o.n);
          const kind = o.kind === "x" ? "x" : o.kind === "1" || o.kind === 1 ? "1" : null;
          return kind && n ? { kind, n } : null;
        })
        .filter((t): t is Tile => !!t);
      const total = tiles.reduce((a, t) => a + Math.abs(t.n), 0);
      if (!m || !result || !tiles.length || total > 20) return null;
      return { type, math: m, tiles, result };
    }
    case "contrast": {
      const wrong = cleanMath(raw.wrong);
      const right = cleanMath(raw.right);
      const why = cleanText(raw.why, 140);
      return wrong && right && why ? { type, wrong, right, why } : null;
    }
    case "rule": {
      const title = cleanText(raw.title, 70);
      const body = arr(raw.body)
        .map((b) => cleanText(b, 90))
        .filter((b): b is string => !!b)
        .slice(0, 5);
      return title && body.length ? { type, title, body } : null;
    }
    case "bars": {
      const m = cleanMath(raw.math);
      const result = cleanMath(raw.result, 40);
      const rows = arr(raw.rows)
        .slice(0, 4)
        .map((r) => {
          const o = obj(r);
          const parts = int(o.parts);
          const shaded = int(o.shaded);
          if (parts === null || shaded === null || parts < 1 || parts > 12) return null;
          return {
            parts,
            shaded: Math.max(0, Math.min(parts, shaded)),
            label: cleanMath(o.label, 24) ?? "",
          };
        })
        .filter((r): r is { parts: number; shaded: number; label: string } => !!r);
      return m && result && rows.length ? { type, math: m, rows, result } : null;
    }
    case "grid100": {
      const m = cleanMath(raw.math);
      const result = cleanMath(raw.result, 40);
      const shaded = int(raw.shaded);
      if (!m || !result || shaded === null || shaded < 0 || shaded > 100) return null;
      return { type, math: m, shaded, result };
    }
    case "story": {
      const title = cleanText(raw.title, 70);
      const lines = arr(raw.lines)
        .map((l) => cleanText(l, 110))
        .filter((l): l is string => !!l)
        .slice(0, 4);
      const icon =
        typeof raw.icon === "string" && raw.icon in ICONS ? (raw.icon as IconName) : "idea";
      return title ? { type, icon, title, lines } : null;
    }
    case "mapping": {
      const title = cleanText(raw.title, 70);
      const pairs = arr(raw.pairs)
        .map((p) => {
          const o = obj(p);
          const from = cleanText(o.from, 70);
          const to = cleanText(o.to, 70);
          return from && to ? { from, to } : null;
        })
        .filter((p): p is { from: string; to: string } => !!p)
        .slice(0, 4);
      return title && pairs.length ? { type, title, pairs } : null;
    }
    case "quote": {
      const text = cleanText(raw.text, 140);
      return text ? { type, text } : null;
    }
    case "think": {
      const question = cleanText(raw.question, 160);
      const answer = cleanMath(raw.answer, 80) ?? cleanText(raw.answer, 80);
      if (!question || !answer) return null;
      const out: Visual = { type, question, answer };
      const m = cleanMath(raw.math);
      const hint = cleanText(raw.hint, 100);
      if (m) out.math = m;
      if (hint) out.hint = hint;
      return out;
    }
    default:
      return null;
  }
}

/** First sentence of a narration line, for the fallback card. */
function firstSentence(say: string): string {
  const m = say.match(/^.{12,140}?[.!?](\s|$)/);
  return (m ? m[0] : say).trim();
}

export function repairScene(raw: Record<string, unknown>): GenScene | null {
  const say = cleanText(raw.say, 900);
  if (!say) return null;
  // A scene we cannot draw still has narration worth keeping: show its key sentence.
  const visual = repairVisual(raw) ?? {
    type: "quote" as const,
    text: cleanText(firstSentence(say), 140)!,
  };
  const scene: GenScene = { ...visual, say };
  if (visual.type === "think") {
    const reveal = cleanText(raw.reveal, 900);
    if (reveal) scene.reveal = reveal;
    else scene.reveal = `The answer is ${visual.answer}.`;
  }
  return scene;
}

export function repairAddresses(v: unknown): MisconceptionId[] {
  return arr(v).filter(
    (m): m is MisconceptionId =>
      typeof m === "string" && Object.prototype.hasOwnProperty.call(MISCONCEPTIONS, m),
  );
}

export type ScriptEvent =
  | { k: "video"; title: string; goal: string }
  | { k: "chapter"; index: number; chapter: Chapter }
  /** A chapter is complete: the next one started, or the video ended. */
  | { k: "chapterDone"; index: number; chapter: Chapter }
  | { k: "scene"; chapter: number; scene: GenScene }
  | { k: "end"; video: Video };

/**
 * Builds a video from JSON lines as they stream in, announcing each finished
 * chapter so narration can start before Claude has written the rest.
 */
export class ScriptBuilder {
  readonly video: Video;
  private pending = "";
  private ended = false;
  /** With `base`, new chapters are added after its chapters (used to extend a short video). */
  constructor(
    private readonly emit: (e: ScriptEvent) => void = () => {},
    base?: Video,
  ) {
    this.video = base
      ? { ...base, chapters: [...base.chapters] }
      : { title: "", goal: "", chapters: [] };
    this.base = this.video.chapters.length;
  }
  private readonly base: number;

  /** Feed new text (any size, split anywhere). */
  push(delta: string): void {
    const lines = (this.pending + delta).split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) this.line(line);
  }

  /** The stream is over: parse what is left and close the video. */
  finish(): Video {
    if (this.pending.trim()) this.line(this.pending);
    this.pending = "";
    this.close();
    return this.video;
  }

  private line(raw: string): void {
    const t = raw.trim().replace(/,$/, "");
    if (!t.startsWith("{") || this.ended) return;
    let o: Record<string, unknown>;
    try {
      o = obj(JSON.parse(t));
    } catch {
      return;
    }
    const chapters = this.video.chapters;
    if (o.k === "video") {
      this.video.title = cleanText(o.title, 90) ?? this.video.title;
      this.video.goal = cleanText(o.goal, 200) ?? this.video.goal;
      this.emit({ k: "video", title: this.video.title, goal: this.video.goal });
    } else if (o.k === "chapter") {
      this.doneLast();
      const chapter: Chapter = {
        title: cleanText(o.title, 80) ?? `Part ${chapters.length + 1}`,
        addresses: repairAddresses(o.addresses),
        scenes: [],
      };
      // A chapter heading with no scenes under it is replaced, so indexes never shift.
      if (chapters.length > this.base && !chapters[chapters.length - 1]!.scenes.length)
        chapters.pop();
      chapters.push(chapter);
      this.emit({ k: "chapter", index: chapters.length - 1, chapter });
    } else if (o.k === "scene" || (o.k === undefined && typeof o.type === "string")) {
      const scene = repairScene(o);
      if (!scene) return;
      if (chapters.length === this.base) {
        const chapter = { title: this.video.title || "Introduction", addresses: [], scenes: [] };
        chapters.push(chapter);
        this.emit({ k: "chapter", index: chapters.length - 1, chapter });
      }
      const ci = chapters.length - 1;
      chapters[ci]!.scenes.push(scene);
      this.emit({ k: "scene", chapter: ci, scene });
    } else if (o.k === "end") {
      this.close();
    }
  }

  private doneLast(): void {
    const ci = this.video.chapters.length - 1;
    const ch = this.video.chapters[ci];
    if (ci >= this.base && ch && ch.scenes.length)
      this.emit({ k: "chapterDone", index: ci, chapter: ch });
  }

  private close(): void {
    if (this.ended) return;
    this.doneLast();
    this.ended = true;
    // Only the last chapter can be empty here.
    const last = this.video.chapters[this.video.chapters.length - 1];
    if (last && !last.scenes.length) this.video.chapters.pop();
    if (!this.video.title) this.video.title = this.video.chapters[0]?.title ?? "Lesson";
    this.emit({ k: "end", video: this.video });
  }
}

/** Parse a complete JSON-lines script in one go. */
export function parseVideo(text: string): Video {
  const b = new ScriptBuilder();
  b.push(text);
  return b.finish();
}
