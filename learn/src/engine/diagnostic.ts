import { SKILL, type SkillId } from "../content/skills";

/**
 * Adaptive diagnostic. Starts at the topic the student chose. A skill passes
 * with two correct answers and fails with two wrong ones (at most three
 * questions). When a skill fails, its prerequisites are tested next, so the
 * test walks down to the real gap instead of asking about everything.
 */
export interface DiagnosticAnswer {
  skill: SkillId;
  correct: boolean;
}

export interface DiagnosticState {
  target: SkillId;
  queue: SkillId[];
  current: SkillId | null;
  /** Results per skill tested so far. */
  results: Partial<Record<SkillId, { right: number; wrong: number; passed?: boolean }>>;
  asked: number;
}

export const MAX_QUESTIONS = 14;

export function startDiagnostic(target: SkillId): DiagnosticState {
  return {
    target,
    queue: [],
    current: target,
    results: { [target]: { right: 0, wrong: 0 } },
    asked: 0,
  };
}

/** Record an answer and move on. Returns the new state; `current` is null when finished. */
export function recordAnswer(state: DiagnosticState, answer: DiagnosticAnswer): DiagnosticState {
  const s: DiagnosticState = {
    ...state,
    queue: [...state.queue],
    results: { ...state.results },
    asked: state.asked + 1,
  };
  const r = { ...(s.results[answer.skill] ?? { right: 0, wrong: 0 }) };
  if (answer.correct) r.right++;
  else r.wrong++;
  if (r.right >= 2) r.passed = true;
  else if (r.wrong >= 2) r.passed = false;
  s.results[answer.skill] = r;

  if (r.passed === false) {
    for (const pre of SKILL[answer.skill].prereqs) {
      if (!(pre in s.results) && !s.queue.includes(pre)) s.queue.push(pre);
    }
  }
  if (r.passed !== undefined) {
    s.current = null;
    while (s.queue.length && s.current === null) {
      const next = s.queue.shift() as SkillId;
      if (!(next in s.results)) {
        s.current = next;
        s.results[next] = { right: 0, wrong: 0 };
      }
    }
  }
  if (s.asked >= MAX_QUESTIONS) s.current = null;
  return s;
}

export function isFinished(state: DiagnosticState): boolean {
  return state.current === null;
}
