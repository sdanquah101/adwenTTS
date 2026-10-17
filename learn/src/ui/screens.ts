import { makeItem, type Item, type Option } from "../content/generators";
import { LESSON, lessonsFor, type Lesson } from "../content/lessons";
import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";
import { ancestors, SKILL, SKILLS, type SkillId, type Strand } from "../content/skills";
import { insights } from "../engine/analytics";
import { bktUpdate, KNOWN, stateOf } from "../engine/bkt";
import {
  isFinished,
  MAX_QUESTIONS,
  recordAnswer,
  startDiagnostic,
  type DiagnosticState,
} from "../engine/diagnostic";
import { buildPlan, nextUp, type Plan } from "../engine/planner";
import { randomSeed } from "../engine/rng";
import type { AccentId, Level, Profile, VoicePref } from "../state";
import { feedback, meter, questionCard, stat, stateChip, STATE_LABEL } from "./components";
import { h, math, mathHTML, sleep } from "./dom";
import { estimateSeconds, speak, stopAll, type Speech } from "./narrator";
import { renderScene, type SceneView } from "./scenes";
import type { App } from "../main";

export interface View {
  el: HTMLElement;
  cleanup?: () => void;
}

const ACCENTS: { id: AccentId; label: string }[] = [
  { id: "purple", label: "Purple" },
  { id: "blue", label: "Blue" },
  { id: "green", label: "Green" },
  { id: "orange", label: "Orange" },
  { id: "rose", label: "Rose" },
  { id: "teal", label: "Teal" },
];

function btn(label: string, onClick: () => void, cls = "btn btn-primary"): HTMLButtonElement {
  return h("button", { type: "button", class: cls, onClick }, label);
}

function lessonMinutes(ids: string[], register: "standard" | "simple"): number {
  let s = 0;
  for (const id of ids)
    for (const sc of LESSON[id]?.scenes ?? [])
      s +=
        estimateSeconds(register === "simple" ? (sc.say.simple ?? sc.say.text) : sc.say.text, 1) +
        0.6;
  return Math.max(1, Math.round(s / 60));
}

/** Record one answer everywhere it matters. */
function record(
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
  const preview = renderScene(LESSON["eq-two-step-balance"]!.scenes[1]!);
  const el = h(
    "section",
    { class: "welcome" },
    h(
      "div",
      { class: "welcome-copy" },
      h("p", { class: "eyebrow" }, "BECE Mathematics · JHS 1–3"),
      h("h1", { class: "display" }, "Maths lessons that start where you are"),
      h(
        "p",
        { class: "lede" },
        "Answer a few questions. Adwen Maths finds the skill that is really holding you back, then plays short narrated lessons made for you, with questions after each one.",
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
            " A short quiz that follows your answers down to the real gap.",
          ),
        ),
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("strong", null, "Learn."),
            " One-minute lessons, foundations first, in a voice and colour you choose.",
          ),
        ),
        h(
          "li",
          null,
          h(
            "span",
            null,
            h("strong", null, "Prove it."),
            " Questions after every lesson. Wrong answers get a fix aimed at that exact mistake.",
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
  const error = h("p", { class: "form-error", role: "alert" });
  const form = h(
    "form",
    { class: "onboard", novalidate: true },
    h("h1", { class: "display-sm" }, p ? "Your settings" : "Let’s set things up"),
    h(
      "p",
      { class: "lede" },
      "These choices make the app comfortable for you. Your lessons are planned from how you answer questions.",
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
        h("span", null, "Show captions under lessons"),
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
      createdAt: p?.createdAt ?? Date.now(),
    };
    app.data.profile = profile;
    app.setAccent(profile.accent);
    app.commit();
    app.go({ name: "home" });
  });
  return { el: form };
}

// ---------------------------------------------------------------- home

const STRAND_ORDER: Strand[] = ["Equations", "Fractions and percentages", "Algebra", "Number"];

export function home(app: App): View {
  const d = app.data;
  const ins = insights(d);
  const plan = d.plan;
  const nextIdx = plan ? plan.steps.findIndex((s) => s.status === "todo") : -1;
  const attemptsBy = new Map(ins.skills.map((s) => [s.id, s]));

  const cont =
    plan && nextIdx >= 0
      ? h(
          "div",
          { class: "continue" },
          h(
            "div",
            null,
            h("p", { class: "eyebrow" }, `Your path · ${SKILL[plan.target].title}`),
            h(
              "p",
              { class: "continue-title" },
              `Next: lesson ${nextIdx + 1} of ${plan.steps.length} · ${SKILL[plan.steps[nextIdx]!.skill].title}`,
            ),
          ),
          h(
            "div",
            { class: "cta" },
            btn("Continue", () => app.go({ name: "lesson", step: nextIdx })),
            btn("See your path", () => app.go({ name: "path" }), "btn btn-ghost"),
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
                  app.newPlan(s.id);
                  app.go({ name: "path" });
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

  const el = h(
    "section",
    { class: "home" },
    h("h1", { class: "display-sm" }, `Hi ${d.profile?.name ?? ""}`),
    cont,
    h("h2", { class: "section-title" }, "Which topic do you find hard?"),
    h(
      "p",
      { class: "muted" },
      "Pick one. A short check finds where to start, then you get lessons made for you.",
    ),
    groups,
  );
  return { el };
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
    app.newPlan(target);
    app.go({ name: "path" });
  }

  intro();
  return {
    el: wrap,
    cleanup: () => {
      if (onKey) document.removeEventListener("keydown", onKey);
    },
  };
}

// ---------------------------------------------------------------- learning path

export function path(app: App): View {
  const d = app.data;
  const plan = d.plan as Plan;
  const reg = app.register();
  const first = plan.steps[0]!;
  const pathSkills = new Set<SkillId>([...ancestors(plan.target), plan.target]);
  const strong = [...pathSkills].filter((s) => (d.mastery[s] ?? 0) >= KNOWN);
  const ins = insights(d);
  const mistakes = ins.mistakes.filter((x) => pathSkills.has(x.m.root)).slice(0, 3);
  const nextIdx = plan.steps.findIndex((s) => s.status === "todo");

  const targetP = d.mastery[plan.target] ?? 0;
  const headline =
    first.skill === plan.target
      ? targetP >= 0.5
        ? `You are close on ${SKILL[plan.target].title.toLowerCase()}. One focused lesson, then practice.`
        : `We will build ${SKILL[plan.target].title.toLowerCase()} from the start: one focused lesson, then practice.`
      : `Your ${SKILL[plan.target].title.toLowerCase()} answers point to an earlier skill: ${SKILL[first.skill].title.toLowerCase()}. We start there, because the rest builds on it.`;

  const el = h(
    "section",
    { class: "path" },
    h("p", { class: "eyebrow" }, "Your learning path"),
    h("h1", { class: "display-sm" }, SKILL[plan.target].title),
    h("p", { class: "lede" }, headline),
    h(
      "div",
      { class: "findings" },
      strong.length
        ? h(
            "div",
            { class: "finding" },
            h("p", { class: "finding-label" }, "Already strong"),
            h("p", null, strong.map((s) => SKILL[s].title).join(", ")),
          )
        : null,
      mistakes.length
        ? h(
            "div",
            { class: "finding" },
            h("p", { class: "finding-label" }, "What we noticed"),
            h(
              "ul",
              { class: "plain" },
              mistakes.map((x) => h("li", null, x.m.did)),
            ),
          )
        : null,
    ),
    h(
      "ol",
      { class: "steps" },
      plan.steps.map((st, i) => {
        const lesson = LESSON[st.lesson] as Lesson;
        const fixes = st.fixes.map((f) => LESSON[f]?.title).filter(Boolean);
        return h(
          "li",
          { class: `step step-${st.status}` },
          h("span", { class: "step-num" }, String(i + 1)),
          h(
            "div",
            { class: "step-body" },
            h("p", { class: "step-title" }, SKILL[st.skill].title),
            h(
              "p",
              { class: "muted small" },
              `${lesson.title} · about ${lessonMinutes([st.lesson, ...st.fixes], reg)} min + 3 questions`,
              fixes.length ? ` · includes a fix: ${fixes.join(", ")}` : "",
            ),
          ),
          st.status === "done"
            ? h("span", { class: "chip chip-mastered" }, "Done")
            : i === nextIdx
              ? h("span", { class: "chip chip-learning" }, "Next")
              : null,
        );
      }),
    ),
    plan.later.length
      ? h(
          "p",
          { class: "muted small" },
          `After this: ${plan.later.map((s) => SKILL[s].title).join(", ")}.`,
        )
      : null,
    h(
      "div",
      { class: "cta" },
      nextIdx >= 0
        ? btn(`Start lesson ${nextIdx + 1}`, () => app.go({ name: "lesson", step: nextIdx }))
        : btn("See your results", () => app.go({ name: "done" })),
      btn(
        "Retake the check",
        () => {
          d.diagnosed = d.diagnosed.filter((s) => s !== plan.target);
          app.go({ name: "diagnostic", target: plan.target });
        },
        "btn btn-ghost",
      ),
    ),
    h(
      "details",
      { class: "why" },
      h("summary", null, "Why this order?"),
      h(
        "p",
        null,
        "Topics in mathematics build on each other. When a later topic goes wrong, the cause is often an earlier skill. The check followed your answers down to the lowest skill that needs work, and the path starts there.",
      ),
    ),
  );
  return { el };
}

// ---------------------------------------------------------------- lesson player + checks

export function lesson(app: App, stepIndex: number): View {
  const d = app.data;
  const plan = d.plan as Plan;
  const step = plan.steps[stepIndex]!;
  const skill = step.skill;
  const played = new Set<string>();
  let round = 1;
  let stopPlayer: (() => void) | null = null;

  const panel = h("div", { class: "panel" });
  const el = h(
    "section",
    { class: "player" },
    h(
      "div",
      { class: "player-head" },
      h("p", { class: "eyebrow" }, `Lesson ${stepIndex + 1} of ${plan.steps.length}`),
      h("h1", { class: "display-sm" }, SKILL[skill].title),
    ),
    panel,
  );

  function playSeries(ids: string[], after: () => void) {
    ids.forEach((id) => played.add(id));
    const scenes = ids.flatMap((id) =>
      (LESSON[id] as Lesson).scenes.map((sc, i) => ({ sc, lesson: LESSON[id] as Lesson, i })),
    );
    const profile = d.profile as Profile;
    let captionsOn = profile.captions;
    let speedFactor = 1;
    let idx = 0;
    let playing = false;
    let token = 0;
    let cur: { view: SceneView; speech: Speech } | null = null;
    const started = Date.now();

    const tag = h("p", { class: "stage-tag" });
    const content = h("div", { class: "stage-content" });
    const stage = h(
      "div",
      { class: "stage", role: "region", "aria-label": "Lesson" },
      tag,
      content,
    );
    const caption = h("p", { class: "caption", "aria-live": "polite", hidden: !captionsOn });
    const dots = h(
      "div",
      { class: "dots", "aria-hidden": "true" },
      scenes.map(() => h("span")),
    );
    const playBtn = h(
      "button",
      { type: "button", class: "ctl ctl-main", "aria-label": "Play" },
      iconPlay(),
    );
    const prev = h(
      "button",
      { type: "button", class: "ctl", "aria-label": "Previous part" },
      iconPrev(),
    );
    const next = h(
      "button",
      { type: "button", class: "ctl", "aria-label": "Next part" },
      iconNext(),
    );
    const capBtn = h(
      "button",
      { type: "button", class: "ctl ctl-text", "aria-pressed": String(captionsOn) },
      "CC",
    );
    const speedSel = h(
      "select",
      { class: "ctl-select", id: "speed-select", "aria-label": "Narration speed" },
      h("option", { value: "0.85" }, "Slower"),
      h("option", { value: "1", selected: true }, "Normal"),
      h("option", { value: "1.15" }, "Faster"),
    );
    const controls = h(
      "div",
      { class: "controls" },
      prev,
      playBtn,
      next,
      h("span", { class: "ctl-gap" }),
      capBtn,
      speedSel,
    );

    const text = (k: number) => {
      const say = scenes[k]!.sc.say;
      return app.register() === "simple" ? (say.simple ?? say.text) : say.text;
    };

    const stopCurrent = () => {
      token++;
      cur?.speech.stop();
      cur?.view.stop();
      cur = null;
    };

    async function run(k: number) {
      stopCurrent();
      idx = k;
      const { sc, lesson: les, i } = scenes[k]!;
      const view = renderScene(sc);
      content.replaceChildren(view.el);
      tag.textContent = les.style === "fix" ? `Watch out · ${les.title}` : les.title;
      caption.textContent = text(k);
      [...dots.children].forEach((dot, j) => dot.classList.toggle("on", j <= k));
      const my = ++token;
      const speech = speak({
        id: `${les.id}.${i}`,
        text: text(k),
        rate: app.rate() * speedFactor,
        voice: profile.voice,
        register: app.register(),
      });
      cur = { view, speech };
      view.start(speech.duration);
      await speech.done;
      await sleep(550);
      if (my !== token || !playing) return;
      view.finish();
      if (k + 1 < scenes.length) void run(k + 1);
      else end();
    }

    function setPlaying(on: boolean) {
      playing = on;
      playBtn.replaceChildren(on ? iconPause() : iconPlay());
      playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    }

    function end() {
      setPlaying(false);
      stopCurrent();
      d.watched.push({
        t: Date.now(),
        lesson: ids[0] as string,
        seconds: Math.round((Date.now() - started) / 1000),
      });
      app.commit();
      content.replaceChildren(
        h(
          "div",
          { class: "scene sc-end" },
          h("p", { class: "sc-kicker in" }, "Lesson done"),
          h("h2", { class: "sc-title in" }, "Now show what you know"),
          btn("Check your understanding", () => {
            stopPlayer = null;
            after();
          }),
        ),
      );
      tag.textContent = "";
    }

    playBtn.addEventListener("click", () => {
      if (playing) {
        setPlaying(false);
        stopCurrent();
        cur = null;
      } else {
        setPlaying(true);
        void run(idx);
      }
    });
    prev.addEventListener("click", () => {
      setPlaying(true);
      void run(Math.max(0, idx - 1));
    });
    next.addEventListener("click", () => {
      if (idx + 1 >= scenes.length) {
        end();
        return;
      }
      setPlaying(true);
      void run(idx + 1);
    });
    capBtn.addEventListener("click", () => {
      captionsOn = !captionsOn;
      caption.hidden = !captionsOn;
      capBtn.setAttribute("aria-pressed", String(captionsOn));
    });
    speedSel.addEventListener("change", () => {
      speedFactor = Number(speedSel.value);
    });

    // First frame: the opening scene at rest, with a big play button (audio needs a tap to start).
    const first = renderScene(scenes[0]!.sc);
    first.finish();
    content.replaceChildren(first.el);
    tag.textContent =
      scenes[0]!.lesson.style === "fix"
        ? `Watch out · ${scenes[0]!.lesson.title}`
        : scenes[0]!.lesson.title;
    caption.textContent = text(0);
    const startOverlay = h(
      "button",
      {
        type: "button",
        class: "start-overlay",
        onClick: () => {
          startOverlay.remove();
          setPlaying(true);
          void run(0);
        },
      },
      h("span", { class: "start-circle" }, iconPlay()),
      h("span", { class: "start-label" }, `Play · about ${lessonMinutes(ids, app.register())} min`),
    );
    stage.append(startOverlay);

    panel.replaceChildren(h("div", { class: "player-box" }, stage, caption, dots, controls));
    stopPlayer = () => {
      setPlaying(false);
      stopCurrent();
      stopAll();
    };
  }

  function checks(n: number) {
    let k = 0;
    let right = 0;
    const seen: MisconceptionId[] = [];
    const box = h("div", { class: "card narrow checks" });
    panel.replaceChildren(box);

    const askOne = () => {
      const item = makeItem(skill, randomSeed());
      const t0 = performance.now();
      const fbSlot = h("div");
      const nextBtn = h("div", { class: "cta" });
      const card = questionCard(item, (o) => {
        const ok = record(app, item, o, performance.now() - t0, "check");
        if (ok) right++;
        if (o?.misconception) seen.push(o.misconception);
        card.reveal(o);
        fbSlot.replaceChildren(feedback(item, o));
        k++;
        nextBtn.replaceChildren(
          btn(k < n ? "Next question" : "See how you did", () => (k < n ? askOne() : summary())),
        );
        (nextBtn.querySelector("button") as HTMLElement).focus({ preventScroll: true });
      });
      box.replaceChildren(
        h(
          "div",
          { class: "diag-top" },
          h("p", { class: "eyebrow" }, "Check your understanding"),
          h("p", { class: "muted small" }, `Question ${k + 1} of ${n}`),
        ),
        card.el,
        fbSlot,
        nextBtn,
      );
    };

    const summary = () => {
      const p = d.mastery[skill] ?? 0;
      const passed = right >= Math.ceil((2 * n) / 3);
      const goNext = () => {
        const nextIdx = plan.steps.findIndex((s) => s.status === "todo");
        app.go(nextIdx >= 0 ? { name: "lesson", step: nextIdx } : { name: "done" });
      };
      const nextLabel = () =>
        plan.steps.some((s) => s.status === "todo") ? "Next lesson" : "See your results";

      if (passed) {
        step.status = "done";
        // Remember which explanation style worked, when there was a choice.
        const style = [...played]
          .map((id) => LESSON[id]?.style)
          .find((s) => s === "balance" || s === "undo");
        if (style && round === 2) d.style = style;
        app.commit();
        box.replaceChildren(
          h("p", { class: "eyebrow" }, `${right} of ${n} correct`),
          h("h2", { class: "display-sm" }, stateOf(p, 1) === "mastered" ? "Mastered" : "Well done"),
          h(
            "p",
            { class: "lede" },
            `${SKILL[skill].title}: ${STATE_LABEL[stateOf(p, 1)].toLowerCase()}.`,
          ),
          meter(p, "Skill level"),
          h(
            "div",
            { class: "cta" },
            btn(nextLabel(), goNext),
            btn("Back to your path", () => app.go({ name: "path" }), "btn btn-ghost"),
          ),
        );
        return;
      }
      if (round === 1) {
        const fixIds = [
          ...new Set(
            seen
              .map((m) => MISCONCEPTIONS[m].lesson)
              .filter((x): x is string => !!x && !played.has(x)),
          ),
        ];
        const alt = lessonsFor(skill).find((id) => !played.has(id));
        const pick = fixIds.length ? fixIds.slice(0, 2) : alt ? [alt] : [step.lesson];
        const top = seen[0] ? MISCONCEPTIONS[seen[0]] : null;
        const replay = !fixIds.length && !alt;
        box.replaceChildren(
          h("p", { class: "eyebrow" }, `${right} of ${n} correct`),
          h(
            "h2",
            { class: "display-sm" },
            replay ? "Let’s watch it once more" : "Let’s look at it another way",
          ),
          h(
            "p",
            { class: "lede" },
            fixIds.length && top
              ? `${top.did} This short lesson is about exactly that.`
              : alt
                ? "Here is a different explanation of the same idea."
                : "Watch closely for the step you found hard, then try three new questions.",
          ),
          h(
            "div",
            { class: "cta" },
            btn("Watch it", () => {
              round = 2;
              playSeries(pick, () => checks(3));
            }),
          ),
        );
        return;
      }
      if (!d.needsHelp.includes(skill)) d.needsHelp.push(skill);
      step.status = "done";
      app.commit();
      box.replaceChildren(
        h("p", { class: "eyebrow" }, `${right} of ${n} correct`),
        h("h2", { class: "display-sm" }, "This one needs more time"),
        h(
          "p",
          { class: "lede" },
          "That is normal. We have saved it on your profile so you can come back to it, and it is a good one to ask your teacher about. Let’s keep going.",
        ),
        h("div", { class: "cta" }, btn(nextLabel(), goNext)),
      );
    };

    askOne();
  }

  playSeries([step.lesson, ...step.fixes], () => checks(3));
  return {
    el,
    cleanup: () => {
      stopPlayer?.();
      stopAll();
    },
  };
}

// ---------------------------------------------------------------- end of path

export function done(app: App): View {
  const d = app.data;
  const plan = d.plan as Plan;
  const since = d.attempts.filter((a) => a.t >= plan.createdAt && a.ctx === "check");
  const right = since.filter((a) => a.correct).length;
  const before = d.attempts.filter((a) => a.t < plan.createdAt);
  const fixed = (Object.keys(d.misconceptions) as MisconceptionId[]).filter(
    (m) =>
      before.some((a) => a.misconception === m) &&
      !since.some((a) => a.misconception === m) &&
      plan.steps.some((s) => s.skill === MISCONCEPTIONS[m].root),
  );
  const up = nextUp(d.mastery).filter((s) => !plan.steps.some((st) => st.skill === s));
  const el = h(
    "section",
    { class: "done" },
    h("p", { class: "eyebrow" }, "Path complete"),
    h("h1", { class: "display-sm" }, `Well done, ${d.profile?.name ?? ""}`),
    h("p", { class: "lede" }, `${right} of ${since.length} check questions right on this path.`),
    h(
      "ul",
      { class: "progress-list" },
      plan.steps.map((st) => {
        const a = d.planStart[st.skill];
        const b = d.mastery[st.skill];
        return h(
          "li",
          null,
          h("p", { class: "step-title" }, SKILL[st.skill].title),
          h(
            "div",
            { class: "before-after" },
            meter(a ?? null, "Before"),
            h("span", { class: "arrow" }, "→"),
            meter(b ?? null, "Now"),
          ),
          stateChip(stateOf(b, 1)),
        );
      }),
    ),
    fixed.length
      ? h(
          "div",
          { class: "finding" },
          h("p", { class: "finding-label" }, "Mistakes that stopped"),
          h(
            "ul",
            { class: "plain" },
            fixed.map((m) => h("li", null, MISCONCEPTIONS[m].label)),
          ),
        )
      : null,
    h(
      "div",
      { class: "cta" },
      up[0]
        ? btn(`Next topic: ${SKILL[up[0]].title}`, () =>
            app.go({ name: "diagnostic", target: up[0] as SkillId }),
          )
        : null,
      btn(
        "Back to topics",
        () => app.go({ name: "home" }),
        up[0] ? "btn btn-ghost" : "btn btn-primary",
      ),
      btn("See your profile", () => app.go({ name: "profile" }), "btn btn-ghost"),
    ),
  );
  return { el };
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
      stat(String(ins.lessonsWatched), "lessons watched"),
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
      h(
        "li",
        null,
        h("strong", null, "Explanations. "),
        d.style === "undo"
          ? "Responds well to working backwards (undoing each step)."
          : "Starts with the balance-scale explanation; switches automatically if it does not land.",
      ),
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
            `Two explanations did not land yet for: ${d.needsHelp.map((s) => SKILL[s].title).join(", ")}.`,
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
      "Everything on this page is stored only on this device.",
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
const iconPlay = () => icon('<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>');
const iconPause = () =>
  icon(
    '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  );
const iconPrev = () =>
  icon(
    '<path d="M7 6v12M18 6l-8 6 8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  );
const iconNext = () =>
  icon(
    '<path d="M17 6v12M6 6l8 6-8 6z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  );

export { math };
