import {
  MISCONCEPTIONS,
  type Misconception,
  type MisconceptionId,
} from "../content/misconceptions";
import { SKILLS, type SkillId } from "../content/skills";
import type { Data } from "../state";
import { KNOWN, stateOf, type SkillState } from "./bkt";

export type Pace = "quick" | "steady" | "careful";

export interface Insights {
  answered: number;
  correct: number;
  accuracy: number | null;
  medianSeconds: number | null;
  pace: Pace | null;
  /** Multiplier applied to the student's chosen narration speed. */
  paceFactor: number;
  minutesStudied: number;
  lessonsWatched: number;
  skills: { id: SkillId; title: string; p: number | null; state: SkillState; attempts: number }[];
  strengths: SkillId[];
  gaps: SkillId[];
  mistakes: { m: Misconception; count: number }[];
  /** Share of "I'm not sure yet" answers: high values suggest low confidence rather than a misconception. */
  unsureRate: number | null;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? (a[mid] as number) : ((a[mid - 1] as number) + (a[mid] as number)) / 2;
}

export function insights(data: Data): Insights {
  const att = data.attempts;
  const answered = att.length;
  const correct = att.filter((a) => a.correct).length;
  const recent = att.slice(-30).filter((a) => !a.skipped);
  const med = median(recent.map((a) => a.ms / 1000));
  const acc = recent.length ? recent.filter((a) => a.correct).length / recent.length : null;

  let pace: Pace | null = null;
  let paceFactor = 1;
  if (med !== null && recent.length >= 4) {
    pace = med < 20 ? "quick" : med < 45 ? "steady" : "careful";
    // Careful thinkers get a little more time; quick and accurate students a little less.
    if (pace === "careful") paceFactor = 0.92;
    else if (pace === "quick" && acc !== null && acc >= 0.7) paceFactor = 1.06;
  }

  const attemptsBySkill = new Map<SkillId, number>();
  for (const a of att) attemptsBySkill.set(a.skill, (attemptsBySkill.get(a.skill) ?? 0) + 1);

  const skills = SKILLS.map((s) => {
    const p = data.mastery[s.id];
    const n = attemptsBySkill.get(s.id) ?? 0;
    return { id: s.id, title: s.title, p: p ?? null, state: stateOf(p, n), attempts: n };
  });

  const mistakes = (Object.entries(data.misconceptions) as [MisconceptionId, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ m: MISCONCEPTIONS[id], count }));

  const seconds =
    data.watched.reduce((s, w) => s + w.seconds, 0) + att.reduce((s, a) => s + a.ms / 1000, 0);

  return {
    answered,
    correct,
    accuracy: answered ? correct / answered : null,
    medianSeconds: med,
    pace,
    paceFactor,
    minutesStudied: Math.round(seconds / 60),
    lessonsWatched: data.watched.length,
    skills,
    strengths: skills.filter((s) => s.p !== null && s.p >= KNOWN).map((s) => s.id),
    gaps: skills.filter((s) => s.attempts > 0 && s.p !== null && s.p < 0.5).map((s) => s.id),
    mistakes,
    unsureRate: answered ? att.filter((a) => a.skipped).length / answered : null,
  };
}
