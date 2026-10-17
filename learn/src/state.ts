import type { MisconceptionId } from "./content/misconceptions";
import type { SkillId } from "./content/skills";
import type { Plan } from "./engine/planner";

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
}

export interface Watch {
  t: number;
  lesson: string;
  seconds: number;
}

export interface Data {
  version: 1;
  profile: Profile | null;
  mastery: Partial<Record<SkillId, number>>;
  attempts: Attempt[];
  misconceptions: Partial<Record<MisconceptionId, number>>;
  /** Topics the student has taken the diagnostic for. */
  diagnosed: SkillId[];
  plan: Plan | null;
  /** Mastery when the current plan was made, to show progress at the end. */
  planStart: Partial<Record<SkillId, number>>;
  /** Explanation style that has worked best so far. */
  style: "balance" | "undo";
  watched: Watch[];
  /** Skills where two explanations did not land, flagged for a teacher. */
  needsHelp: SkillId[];
}

const KEY = "adwen-maths-v1";

export function emptyData(): Data {
  return {
    version: 1,
    profile: null,
    mastery: {},
    attempts: [],
    misconceptions: {},
    diagnosed: [],
    plan: null,
    planStart: {},
    style: "balance",
    watched: [],
    needsHelp: [],
  };
}

/** Everything stays on this device. Storage can be unavailable; then the app runs in memory. */
export function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<Data>;
    if (parsed.version !== 1) return emptyData();
    return { ...emptyData(), ...parsed };
  } catch {
    return emptyData();
  }
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
