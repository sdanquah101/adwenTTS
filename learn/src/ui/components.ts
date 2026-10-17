import type { Item, Option } from "../content/generators";
import { MISCONCEPTIONS } from "../content/misconceptions";
import type { SkillState } from "../engine/bkt";
import { h, math, mathHTML } from "./dom";

export const STATE_LABEL: Record<SkillState, string> = {
  mastered: "Mastered",
  known: "Strong",
  learning: "Getting there",
  gap: "Needs work",
  untested: "Not checked yet",
};

export function stateChip(state: SkillState): HTMLElement {
  return h("span", { class: `chip chip-${state}` }, STATE_LABEL[state]);
}

export function meter(p: number | null, label: string): HTMLElement {
  const pct = p === null ? 0 : Math.round(p * 100);
  return h(
    "div",
    {
      class: "meter",
      role: "meter",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": pct,
      "aria-label": label,
    },
    h("span", { class: "meter-fill", style: `width:${pct}%` }),
  );
}

export interface QuestionCard {
  el: HTMLElement;
  /** Show which option was right and which was chosen. */
  reveal(chosen: Option | null): void;
}

/**
 * One question in BECE objective style (options A to D). `onPick` fires once.
 * `unsure` adds an "I'm not sure yet" button, which counts as not known rather than as a guess.
 */
export function questionCard(
  item: Item,
  onPick: (o: Option | null) => void,
  opts: { unsure?: boolean } = {},
): QuestionCard {
  let locked = false;
  const buttons = item.options.map((o) =>
    h(
      "button",
      {
        type: "button",
        class: "opt",
        "data-key": o.key,
        onClick: () => {
          if (locked) return;
          locked = true;
          buttons.forEach((b) => (b.disabled = true));
          btn(o).classList.add("picked");
          onPick(o);
        },
      },
      h("span", { class: "opt-letter" }, o.letter),
      h("span", { class: "opt-text", html: mathHTML(o.text) }),
    ),
  );
  const btn = (o: Option) => buttons[item.options.indexOf(o)] as HTMLButtonElement;
  const unsure = opts.unsure
    ? h(
        "button",
        {
          type: "button",
          class: "btn btn-quiet",
          onClick: () => {
            if (locked) return;
            locked = true;
            buttons.forEach((b) => (b.disabled = true));
            onPick(null);
          },
        },
        "I’m not sure yet",
      )
    : null;
  const el = h(
    "div",
    { class: "qcard" },
    h("p", { class: item.math ? "q-prompt" : "q-prompt q-word" }, item.prompt),
    item.math ? h("p", { class: "q-math", html: mathHTML(item.math) }) : null,
    h("div", { class: "opts", role: "group", "aria-label": "Answer options" }, buttons),
    unsure ? h("div", { class: "q-actions" }, unsure) : null,
  );
  return {
    el,
    reveal(chosen) {
      item.options.forEach((o) => {
        const b = btn(o);
        if (o.correct) b.classList.add("right");
        else if (chosen && o.key === chosen.key) b.classList.add("wrong");
        else b.classList.add("faded");
      });
    },
  };
}

/** Feedback after a check question: what went wrong (if anything) and the worked solution. */
export function feedback(item: Item, chosen: Option | null): HTMLElement {
  const right = item.options.find((o) => o.correct) as Option;
  const ok = chosen?.correct === true;
  const m = chosen && !ok && chosen.misconception ? MISCONCEPTIONS[chosen.misconception] : null;
  return h(
    "div",
    { class: `fb ${ok ? "fb-ok" : "fb-no"}`, role: "status" },
    h(
      "p",
      { class: "fb-head" },
      ok
        ? "Correct."
        : h(
            "span",
            null,
            "The answer is ",
            h("strong", null, `${right.letter}: `),
            math(right.text),
          ),
    ),
    m
      ? h("p", { class: "fb-why" }, `${m.did} ${m.fix}`)
      : !ok
        ? h("p", { class: "fb-why" }, "Look at the working below, one step at a time.")
        : null,
    h(
      "details",
      { class: "fb-work", open: !ok },
      h("summary", null, "Worked solution"),
      h(
        "ol",
        null,
        item.solution.map((line) => h("li", { html: mathHTML(line) })),
      ),
    ),
  );
}

export function stat(value: string, label: string): HTMLElement {
  return h(
    "div",
    { class: "stat" },
    h("p", { class: "stat-value" }, value),
    h("p", { class: "stat-label" }, label),
  );
}
