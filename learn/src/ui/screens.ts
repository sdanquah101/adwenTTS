import { makeItem, type Item, type Option } from "../content/generators";
import { ancestors, SKILL, SKILLS, type SkillId, type Strand } from "../content/skills";
import { insights } from "../engine/analytics";
import { bktUpdate } from "../engine/bkt";
import {
  isFinished,
  MAX_QUESTIONS,
  recordAnswer,
  startDiagnostic,
  type DiagnosticState,
} from "../engine/diagnostic";
import { randomSeed } from "../engine/rng";
import type { AccentId, Level, Profile, VoicePref } from "../state";
import { meter, questionCard, stat, stateChip } from "./components";
import { h, math, mathHTML } from "./dom";
import { onClaude } from "../gen/runtime";
import { renderScene } from "./scenes";
import type { App } from "../main";
import { installState, onInstallChange, persistStorage, promptInstall } from "../pwa";

export interface View {
  el: HTMLElement;
  cleanup?: () => void;
}

const INTERESTS = [
  "Football",
  "Music",
  "Cooking",
  "Buying and selling",
  "Phones and games",
  "Farming",
  "Science and gadgets",
  "Drawing and design",
  "Films and series",
];

const ACCENTS: { id: AccentId; label: string }[] = [
  { id: "purple", label: "Purple" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "orange", label: "Orange" },
  { id: "rose", label: "Rose" },
  { id: "teal", label: "Teal" },
];

export function btn(
  label: string,
  onClick: () => void,
  cls = "btn btn-primary",
): HTMLButtonElement {
  return h("button", { type: "button", class: cls, onClick }, label);
}

/** Record one answer everywhere it matters. */
export function record(
  app: App,
  item: Item,
  chosen: Option | null,
  ms: number,
  ctx: "diagnostic" | "check",
): boolean {
  const correct = chosen?.correct === true;
  const d = app.data;
  d.attempts.push({
    t: Date.now(),
    skill: item.skill,
    item: item.id,
    correct,
    skipped: chosen === null || undefined,
    misconception: chosen?.misconception,
    ms,
    ctx,
    question: item.math ? `${item.prompt} ${item.math}` : item.prompt,
    answer: chosen ? chosen.text : "I'm not sure yet",
  });
  const prior = d.mastery[item.skill] ?? 0.35;
  d.mastery[item.skill] = bktUpdate(prior, correct, ctx === "check");
  if (chosen?.misconception)
    d.misconceptions[chosen.misconception] = (d.misconceptions[chosen.misconception] ?? 0) + 1;
  app.commit();
  return correct;
}

// ---------------------------------------------------------------- welcome

export function welcome(app: App): View {
  const preview = renderScene({
    type: "balance",
    math: "2x + 3 = 11",
    left: { x: 2, units: 3 },
    right: { units: 11 },
    actions: [
      { type: "removeUnits", n: 3, label: "Take 3 off both sides" },
      { type: "share", groups: 2, label: "Share both sides into 2" },
    ],
    result: "x = 4",
  });
  preview.finish();
  const el = h(
    "section",
    { class: "welcome" },
    h(
      "div",
      { class: "welcome-copy" },
      h("p", { class: "eyebrow" }, "BECE Mathematics · JHS 1–3"),
      h("h1", { class: "display" }, "Explainer videos made for you, on the spot"),
      h(
        "p",
        { class: "lede" },
        "Answer a few questions. Adwen Maths finds what is really holding you back. Then Claude writes a series of explainer videos for you alone, 3 to 5 minutes each and narrated in a Ghanaian voice, with a quiz at the end.",
      ),
      h(
        "ol",
        { class: "how" },
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("strong", null, "Check."),
            " A short quiz that follows your answers down to the real gap and records your exact mistakes.",
          ),
        ),
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("strong", null, "Watch."),
            " A full series on your topic: analogies from your own life, every step broken down, your mistakes fixed. Written the moment you ask.",
          ),
        ),
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("strong", null, "Prove it."),
            " A quiz at the end. Each wrong answer points to the chapter to rewatch, or to a new video on that mistake.",
          ),
        ),
      ),
      h(
        "div",
        { class: "cta" },
        btn("Start as a new student", () => app.go({ name: "onboard" })),
        btn("Explore a sample student", () => app.loadSample(), "btn btn-ghost"),
      ),
    ),
    h(
      "div",
      { class: "welcome-art", "aria-hidden": "true" },
      h("div", { class: "stage stage-preview" }, preview.el),
    ),
  );
  return { el };
}

// ---------------------------------------------------------------- onboarding

export function onboard(app: App): View {
  const p = app.data.profile;
  const radios = <T extends string>(
    name: string,
    legend: string,
    items: { value: T; label: string; hint?: string }[],
    current: T,
  ) =>
    h(
      "fieldset",
      { class: "field" },
      h("legend", null, legend),
      h(
        "div",
        { class: "choices" },
        items.map((it) =>
          h(
            "label",
            { class: "choice" },
            h("input", {
              type: "radio",
              name,
              value: it.value,
              id: `${name}-${it.value}`,
              checked: it.value === current,
            }),
            h("span", null, it.label, it.hint ? h("small", null, it.hint) : null),
          ),
        ),
      ),
    );

  const nameInput = h("input", {
    id: "student-name",
    name: "name",
    type: "text",
    required: true,
    maxlength: 30,
    autocomplete: "given-name",
    value: p?.name ?? "",
    placeholder: "e.g. Kwame",
  });
  const swatches = h(
    "fieldset",
    { class: "field" },
    h("legend", null, "Favourite colour"),
    h(
      "div",
      { class: "swatches" },
      ACCENTS.map((a) =>
        h(
          "label",
          { class: "swatch", "data-accent": a.id, title: a.label },
          h("input", {
            type: "radio",
            name: "accent",
            value: a.id,
            id: `accent-${a.id}`,
            checked: a.id === (p?.accent ?? "purple"),
          }),
          h("span", { class: "swatch-dot" }),
          h("span", { class: "swatch-label" }, a.label),
        ),
      ),
    ),
  );
  const interestBox = h(
    "fieldset",
    { class: "field" },
    h("legend", null, "What do you enjoy?"),
    h(
      "p",
      { class: "muted small field-hint" },
      "Your videos use these for examples and stories. Pick any.",
    ),
    h(
      "div",
      { class: "chips" },
      INTERESTS.map((it) =>
        h(
          "label",
          { class: "chip-check" },
          h("input", {
            type: "checkbox",
            name: "interest",
            value: it,
            checked: p?.interests.includes(it) ?? false,
          }),
          h("span", null, it),
        ),
      ),
    ),
    h("input", {
      id: "interest-other",
      name: "interestOther",
      type: "text",
      maxlength: 40,
      "aria-label": "Something else you enjoy",
      placeholder: "Something else, e.g. basketball",
      value: (p?.interests ?? []).filter((i) => !INTERESTS.includes(i)).join(", "),
    }),
  );
  const error = h("p", { class: "form-error", role: "alert" });
  const form = h(
    "form",
    { class: "onboard", novalidate: true },
    h("h1", { class: "display-sm" }, p ? "Your settings" : "Let’s set things up"),
    h(
      "p",
      { class: "lede" },
      "Your videos are written from these choices and from how you answer questions.",
    ),
    h("div", { class: "field" }, h("label", { for: "student-name" }, "First name"), nameInput),
    radios<Level>(
      "level",
      "Class",
      [
        { value: "JHS 1", label: "JHS 1" },
        { value: "JHS 2", label: "JHS 2" },
        { value: "JHS 3", label: "JHS 3" },
      ],
      p?.level ?? "JHS 3",
    ),
    swatches,
    interestBox,
    radios<VoicePref>(
      "voice",
      "Narrator voice",
      [
        { value: "female", label: "Female voice" },
        { value: "male", label: "Male voice" },
        { value: "any", label: "No preference" },
      ],
      p?.voice ?? "female",
    ),
    radios<string>(
      "speed",
      "Narration speed",
      [
        { value: "0.85", label: "Slower" },
        { value: "1", label: "Normal" },
        { value: "1.15", label: "Faster" },
      ],
      String(p?.speed ?? 1),
    ),
    h(
      "fieldset",
      { class: "field" },
      h("legend", null, "Reading support"),
      h(
        "label",
        { class: "checkbox" },
        h("input", {
          type: "checkbox",
          name: "simpler",
          id: "opt-simpler",
          checked: p?.simpler ?? false,
        }),
        h("span", null, "Use simpler words and shorter sentences"),
      ),
      h(
        "label",
        { class: "checkbox" },
        h("input", {
          type: "checkbox",
          name: "captions",
          id: "opt-captions",
          checked: p?.captions ?? true,
        }),
        h("span", null, "Show captions under videos"),
      ),
    ),
    error,
    h(
      "div",
      { class: "cta" },
      h("button", { type: "submit", class: "btn btn-primary" }, p ? "Save" : "Continue"),
    ),
  );
  form.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "accent") app.setAccent(t.value as AccentId);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      error.textContent = "Type your first name to continue.";
      nameInput.focus();
      return;
    }
    const profile: Profile = {
      name,
      level: (fd.get("level") as Level) ?? "JHS 3",
      accent: (fd.get("accent") as AccentId) ?? "purple",
      voice: (fd.get("voice") as VoicePref) ?? "female",
      speed: Number(fd.get("speed") ?? 1),
      simpler: fd.get("simpler") === "on",
      captions: fd.get("captions") === "on",
      interests: [
        ...fd.getAll("interest").map(String),
        ...String(fd.get("interestOther") ?? "")
          .split(",")
          .map((x) => x.trim().slice(0, 40))
          .filter(Boolean),
      ].slice(0, 6),
      createdAt: p?.createdAt ?? Date.now(),
    };
    app.data.profile = profile;
    app.setAccent(profile.accent);
    app.commit();
    persistStorage();
    app.go({ name: "home" });
  });
  return { el: form };
}

// ---------------------------------------------------------------- home

const STRAND_ORDER: Strand[] = ["Equations", "Fractions and percentages", "Algebra", "Number"];

export function home(app: App): View {
  const d = app.data;
  const ins = insights(d);
  const series = d.series;
  const attemptsBy = new Map(ins.skills.map((s) => [s.id, s]));
  const nextIdx = series ? series.videos.findIndex((v) => !v.watched) : -1;

  const cont = series
    ? h(
        "div",
        { class: "continue" },
        h(
          "div",
          null,
          h("p", { class: "eyebrow" }, `Your series · ${SKILL[series.target].title}`),
          h(
            "p",
            { class: "continue-title" },
            !series.videos.length
              ? "Being planned"
              : nextIdx >= 0
                ? `Next: video ${nextIdx + 1} of ${series.videos.length} · ${series.videos[nextIdx]!.video?.title ?? series.videos[nextIdx]!.title}`
                : series.quiz
                  ? `Quiz done: ${series.quiz.right} of ${series.quiz.total}`
                  : "All videos watched. Quiz next",
          ),
        ),
        h(
          "div",
          { class: "cta" },
          btn("Continue", () =>
            app.go(
              nextIdx >= 0 && series.videos.length
                ? { name: "video", index: nextIdx }
                : { name: series.videos.length && !series.quiz ? "quiz" : "series" },
            ),
          ),
          btn("See the series", () => app.go({ name: "series" }), "btn btn-ghost"),
        ),
      )
    : null;

  const groups = STRAND_ORDER.map((strand) =>
    h(
      "section",
      { class: "strand" },
      h("h3", { class: "strand-title" }, strand),
      h(
        "div",
        { class: "topics" },
        SKILLS.filter((s) => s.strand === strand).map((s) => {
          const info = attemptsBy.get(s.id);
          return h(
            "button",
            {
              type: "button",
              class: "topic",
              onClick: () => {
                if (d.diagnosed.includes(s.id)) {
                  app.newSeries(s.id);
                  app.go({ name: "series" });
                } else app.go({ name: "diagnostic", target: s.id });
              },
            },
            h("span", { class: "topic-title" }, s.title),
            h("span", { class: "topic-example", html: mathHTML(s.example) }),
            h("span", { class: "topic-foot" }, stateChip(info?.state ?? "untested")),
          );
        }),
      ),
    ),
  );

  const install = installCard();
  const el = h(
    "section",
    { class: "home" },
    h("h1", { class: "display-sm" }, `Hi ${d.profile?.name ?? ""}`),
    install.el,
    cont,
    h("h2", { class: "section-title" }, "Which topic do you find hard?"),
    h(
      "p",
      { class: "muted" },
      "Pick one. A short check finds where to start, then Claude writes a video series for you.",
    ),
    groups,
  );
  return { el, cleanup: install.cleanup };
}

const DISMISS_KEY = "adwen-maths-install-dismissed";

/** "Install on this phone" card. Shows only when installing is possible and not yet done. */
function installCard(): View {
  const el = h("div", { class: "install", hidden: true });
  const dismissed = () => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  };
  const draw = () => {
    const st = installState();
    const show = st.available && !st.standalone && !dismissed() && (st.canPrompt || st.ios);
    el.hidden = !show;
    if (!show) return;
    const notNow = h(
      "button",
      {
        type: "button",
        class: "btn btn-quiet",
        onClick: () => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          draw();
        },
      },
      "Not now",
    );
    el.replaceChildren(
      h(
        "div",
        { class: "install-copy" },
        h("p", { class: "install-title" }, "Put Adwen Maths on your phone"),
        h(
          "p",
          { class: "muted small" },
          st.ios
            ? "Tap the Share button in Safari, then \u201cAdd to Home Screen\u201d. It opens like an app and works without internet."
            : "It opens like an app from your home screen and works without internet.",
        ),
      ),
      h(
        "div",
        { class: "cta" },
        st.canPrompt ? btn("Install", () => void promptInstall().then(draw)) : null,
        notNow,
      ),
    );
  };
  draw();
  const off = onInstallChange(draw);
  return { el, cleanup: off };
}

// ---------------------------------------------------------------- diagnostic

export function diagnostic(app: App, target: SkillId): View {
  const wrap = h("section", { class: "diag" });
  let state: DiagnosticState = startDiagnostic(target);
  let onKey: ((e: KeyboardEvent) => void) | null = null;

  const intro = () =>
    wrap.replaceChildren(
      h(
        "div",
        { class: "card narrow" },
        h("p", { class: "eyebrow" }, "Quick check"),
        h("h1", { class: "display-sm" }, SKILL[target].title),
        h(
          "p",
          { class: "lede" },
          `Up to ${MAX_QUESTIONS} questions, usually fewer. There are no marks. If you don’t know an answer, choose “I’m not sure yet”. That tells us more than a guess.`,
        ),
        h(
          "div",
          { class: "cta" },
          btn("Start the check", ask),
          btn("Back to topics", () => app.go({ name: "home" }), "btn btn-ghost"),
        ),
      ),
    );

  function ask() {
    const skill = state.current as SkillId;
    const item = makeItem(skill, randomSeed());
    const t0 = performance.now();
    const card = questionCard(
      item,
      (o) => {
        record(app, item, o, performance.now() - t0, "diagnostic");
        state = recordAnswer(state, { skill, correct: o?.correct === true });
        setTimeout(() => (isFinished(state) ? finish() : ask()), 380);
      },
      { unsure: true },
    );
    const pct = Math.min(100, Math.round((state.asked / MAX_QUESTIONS) * 100));
    wrap.replaceChildren(
      h(
        "div",
        { class: "card narrow" },
        h(
          "div",
          { class: "diag-top" },
          h("p", { class: "eyebrow" }, `Question ${state.asked + 1}`),
          h("p", { class: "muted small" }, `Checking: ${SKILL[skill].title}`),
        ),
        h(
          "div",
          { class: "progress", "aria-hidden": "true" },
          h("span", { style: `width:${pct}%` }),
        ),
        card.el,
      ),
    );
    if (onKey) document.removeEventListener("keydown", onKey);
    onKey = (e) => {
      const i = "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0) card.el.querySelectorAll<HTMLButtonElement>(".opt")[i]?.click();
    };
    document.addEventListener("keydown", onKey);
    (card.el.querySelector(".opt") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function finish() {
    const d = app.data;
    // Skills below a passed skill are very likely known too.
    for (const [sk, r] of Object.entries(state.results) as [SkillId, { passed?: boolean }][]) {
      if (r.passed)
        for (const a of ancestors(sk)) if (d.mastery[a] === undefined) d.mastery[a] = 0.88;
    }
    if (!d.diagnosed.includes(target)) d.diagnosed.push(target);
    app.newSeries(target);
    app.go({ name: "series" });
  }

  intro();
  return {
    el: wrap,
    cleanup: () => {
      if (onKey) document.removeEventListener("keydown", onKey);
    },
  };
}

// ---------------------------------------------------------------- learning profile

export function profile(app: App): View {
  const d = app.data;
  const p = d.profile as Profile;
  const ins = insights(d);
  let confirming = false;

  const paceText =
    ins.pace === null
      ? "Not enough answers yet to judge pace."
      : ins.pace === "careful"
        ? `Takes time over each question (about ${Math.round(ins.medianSeconds ?? 0)} seconds). Narration is slowed a little to match.`
        : ins.pace === "quick"
          ? `Answers quickly (about ${Math.round(ins.medianSeconds ?? 0)} seconds per question).${ins.paceFactor > 1 ? " Accuracy is good, so narration runs a little faster." : " Slowing down could help accuracy."}`
          : `Steady pace, about ${Math.round(ins.medianSeconds ?? 0)} seconds per question.`;

  const strands: Strand[] = ["Number", "Fractions and percentages", "Algebra", "Equations"];
  const resetArea = h("div", { class: "reset" });
  const drawReset = () => {
    resetArea.replaceChildren(
      confirming
        ? h(
            "div",
            { class: "confirm" },
            h("p", null, "This deletes everything saved on this device for this student."),
            btn("Yes, delete", () => app.reset(), "btn btn-danger"),
            btn(
              "Cancel",
              () => {
                confirming = false;
                drawReset();
              },
              "btn btn-ghost",
            ),
          )
        : btn(
            p.sample ? "Leave the sample and start as yourself" : "Reset this device",
            () => {
              if (p.sample) app.reset();
              else {
                confirming = true;
                drawReset();
              }
            },
            "btn btn-ghost",
          ),
    );
  };
  drawReset();

  const el = h(
    "section",
    { class: "profile" },
    h("p", { class: "eyebrow" }, "Learning profile"),
    h("h1", { class: "display-sm" }, `${p.name} · ${p.level}`),
    h(
      "div",
      { class: "stats" },
      stat(String(ins.answered), "questions answered"),
      stat(ins.accuracy === null ? "–" : `${Math.round(ins.accuracy * 100)}%`, "correct"),
      stat(String(ins.minutesStudied), "minutes learning"),
      stat(String(ins.lessonsWatched), "videos watched"),
    ),
    h("h2", { class: "section-title" }, "Skill map"),
    h(
      "p",
      { class: "muted" },
      "Each bar is our current estimate that the skill is learned. It updates after every answer.",
    ),
    strands.map((strand) =>
      h(
        "div",
        { class: "skillgroup" },
        h("h3", { class: "strand-title" }, strand),
        h(
          "ul",
          { class: "skills" },
          ins.skills
            .filter((s) => SKILL[s.id].strand === strand)
            .map((s) =>
              h(
                "li",
                { class: "skillrow" },
                h("span", { class: "skill-name" }, s.title),
                meter(s.p, s.title),
                stateChip(s.state),
              ),
            ),
        ),
      ),
    ),
    h("h2", { class: "section-title" }, "Mistake patterns"),
    ins.mistakes.length
      ? h(
          "ul",
          { class: "mistakes" },
          ins.mistakes.map(({ m, count }) =>
            h(
              "li",
              null,
              h(
                "p",
                { class: "mistake-label" },
                m.label,
                h("span", { class: "count" }, `${count}×`),
              ),
              h("p", { class: "muted small" }, `Root skill: ${SKILL[m.root].title}. Fix: ${m.fix}`),
            ),
          ),
        )
      : h("p", { class: "muted" }, "No repeated mistakes found yet."),
    h("h2", { class: "section-title" }, `How ${p.name} learns`),
    h(
      "ul",
      { class: "plain learns" },
      h("li", null, h("strong", null, "Pace. "), paceText),
      p.interests.length
        ? h(
            "li",
            null,
            h("strong", null, "Interests. "),
            `${p.interests.join(", ")}. Videos use these for analogies and word problems.`,
          )
        : null,
      ins.unsureRate !== null && ins.unsureRate > 0.25
        ? h(
            "li",
            null,
            h("strong", null, "Confidence. "),
            "Often chooses “not sure yet”. Encouragement may matter as much as content here.",
          )
        : null,
      h(
        "li",
        null,
        h("strong", null, "Comfort settings. "),
        `${ACCENTS.find((a) => a.id === p.accent)?.label} theme, ${p.voice === "any" ? "any" : p.voice} narrator, ${p.speed < 1 ? "slower" : p.speed > 1 ? "faster" : "normal"} speed${p.simpler ? ", simpler words" : ""}.`,
      ),
    ),
    d.needsHelp.length
      ? h(
          "div",
          { class: "finding warn" },
          h("p", { class: "finding-label" }, "For the teacher"),
          h(
            "p",
            null,
            `Still finding these hard after a video series: ${d.needsHelp.map((s) => SKILL[s].title).join(", ")}.`,
          ),
        )
      : null,
    h(
      "div",
      { class: "cta" },
      btn("Change settings", () => app.go({ name: "onboard" }), "btn btn-ghost"),
      btn("Back to topics", () => app.go({ name: "home" })),
    ),
    h(
      "p",
      { class: "muted small privacy" },
      onClaude()
        ? "This profile is saved privately for you in Adwen Maths on claude.ai. Only you can see it."
        : "Everything on this page is stored only on this device.",
    ),
    resetArea,
  );
  return { el };
}

// ---------------------------------------------------------------- icons

function icon(d: string): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = d;
  return svg;
}
export const iconPlay = () => icon('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>');
export const iconPause = () =>
  icon(
    '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  );
export const iconPrev = () =>
  icon(
    '<path d="M7 6v12M18 6l-8 6 8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  );
export const iconNext = () =>
  icon(
    '<path d="M17 6v12M6 6l8 6-8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  );

export { math };
