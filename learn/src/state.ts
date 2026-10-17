import type { MisconceptionId } from "./content/misconceptions";
import type { SkillId } from "./content/skills";
import type { Video } from "./gen/script";

export type AccentId = "purple" | "blue" | "green" | "orange" | "rose" | "teal";
export type VoicePref = "female" | "male" | "any";
export type Level = "JHS 1" | "JHS 2" | "JHS 3";

export interface Profile {
  name: string;
  level: Level;
  accent: AccentId;
  voice: VoicePref;
  /** Simpler words and shorter sentences in narration. */
  simpler: boolean;
  captions: boolean;
  /** Narration speed chosen by the student. */
  speed: number;
  /** Things the student enjoys, used for analogies in their videos. */
  interests: string[];
  sample?: boolean;
  createdAt: number;
}

export interface Attempt {
  t: number;
  skill: SkillId;
  item: string;
  correct: boolean;
  /** True when the student chose "I'm not sure yet". */
  skipped?: boolean;
  misconception?: MisconceptionId;
  ms: number;
  ctx: "diagnostic" | "check";
  /** The question as shown and the answer chosen, so a video can talk about this exact mistake. */
  question?: string;
  answer?: string;
}

export interface Watch {
  t: number;
  /** Series id and video index. */
  lesson: string;
  seconds: number;
}

/** One planned video in a series; `video` is filled in when Claude has written it. */
export interface SeriesVideo {
  title: string;
  focus: SkillId[];
  goal: string;
  /** Why this video is in this student's series, in a sentence. */
  why: string;
  video?: Video;
  watched?: boolean;
}

export interface QuizMiss {
  skill: SkillId;
  misconception?: MisconceptionId;
  /** Where to rewatch: video index and chapter index. */
  video?: number;
  chapter?: number;
}

export interface Series {
  id: string;
  target: SkillId;
  createdAt: number;
  /** A sentence or two to the student about why the series looks like this. */
  intro: string;
  videos: SeriesVideo[];
  quiz?: { at: number; right: number; total: number; missed: QuizMiss[] };
}

export interface Data {
  version: 2;
  profile: Profile | null;
  mastery: Partial<Record<SkillId, number>>;
  attempts: Attempt[];
  misconceptions: Partial<Record<MisconceptionId, number>>;
  /** Topics the student has taken the diagnostic for. */
  diagnosed: SkillId[];
  series: Series | null;
  /** Mastery when the current series was made, to show progress at the end. */
  planStart: Partial<Record<SkillId, number>>;
  watched: Watch[];
  /** Skills where two explanations did not land, flagged for a teacher. */
  needsHelp: SkillId[];
}

const KEY = "adwen-maths-v1";

export function emptyData(): Data {
  return {
    version: 2,
    profile: null,
    mastery: {},
    attempts: [],
    misconceptions: {},
    diagnosed: [],
    series: null,
    planStart: {},
    watched: [],
    needsHelp: [],
  };
}

/** Everything stays on this device. Storage can be unavailable; then the app runs in memory. */
export function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    return revive(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

/** Accept saved data from this version or the first one (whose short lessons are gone). */
export function revive(raw: unknown): Data {
  const parsed = (raw ?? {}) as Omit<Partial<Data>, "version"> & {
    version?: number;
    plan?: unknown;
    style?: unknown;
  };
  if (parsed.version !== 1 && parsed.version !== 2) return emptyData();
  const rest = { ...parsed };
  delete rest.plan;
  delete rest.style;
  const d = { ...emptyData(), ...rest, version: 2 as const };
  if (d.profile) d.profile = { ...d.profile, interests: d.profile.interests ?? [] };
  return d;
}

export function save(data: Data): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode or storage full: keep going in memory */
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
