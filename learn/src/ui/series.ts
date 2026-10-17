import { makeItem } from "../content/generators";
import { MISCONCEPTIONS, type MisconceptionId } from "../content/misconceptions";
import { SKILL, type SkillId } from "../content/skills";
import { stateOf } from "../engine/bkt";
import { nextUp } from "../engine/planner";
import { randomSeed } from "../engine/rng";
import { GenError, genErrorText, planSeries, writeVideo } from "../gen/generate";
import {
  narratorConfig,
  requestNarration,
  voiceName,
  type NarrationRequest,
  type NarrationState,
} from "../gen/narration";
import { onClaude } from "../gen/runtime";
import {
  estimateVideoSeconds,
  linesOf,
  wordCount,
  type Chapter,
  type ScriptEvent,
  type Video,
} from "../gen/script";
import type { App } from "../main";
import type { QuizMiss, Series } from "../state";
import { feedback, meter, questionCard, STATE_LABEL } from "./components";
import { h } from "./dom";
import { renderScene, showHint, type SceneView } from "./scenes";
import { btn, iconNext, iconPause, iconPlay, iconPrev, record, type View } from "./screens";

// ---------------------------------------------------------------- background jobs

/**
 * Writing a video and recording its narration keep going while the student
 * moves around the app, so they live here rather than in a screen.
 */
interface WriteJob {
  events: ScriptEvent[];
  listeners: Set<(e: ScriptEvent) => void>;
  done: Promise<Video>;
  error?: GenError;
}
const writeJobs = new Map<string, WriteJob>();
const jobKey = (s: Series, i: number) => `${s.id}:${i}`;

function startWriting(app: App, series: Series, index: number): WriteJob {
  const key = jobKey(series, index);
  const existing = writeJobs.get(key);
  if (existing && !existing.error) return existing;
  const job: WriteJob = { events: [], listeners: new Set(), done: Promise.resolve(null as never) };
  const emit = (e: ScriptEvent) => {
    job.events.push(e);
    job.listeners.forEach((l) => l(e));
    if (e.k === "chapterDone") void narrateChapter(app, series, index, e.index, e.chapter);
  };
  job.done = writeVideo(app.data, series, index, emit)
    .then((video) => {
      const sv = app.data.series?.id === series.id ? app.data.series.videos[index] : undefined;
      if (sv) {
        sv.video = video;
        app.commit();
      }
      return video;
    })
    .catch((e: unknown) => {
      job.error = e instanceof GenError ? e : new GenError("error", genErrorText("error"));
      job.listeners.forEach((l) => l({ k: "end", video: { title: "", goal: "", chapters: [] } }));
      throw job.error;
    });
  job.done.catch(() => {});
  writeJobs.set(key, job);
  return job;
}

interface NarrJob {
  state: NarrationState | { status: "unavailable"; why: string };
  listeners: Set<() => void>;
  req: NarrationRequest | null;
}
const narrJobs = new Map<string, NarrJob>();

function narrateChapter(
  app: App,
  series: Series,
  vi: number,
  ci: number,
  chapter: Chapter,
): NarrJob {
  const key = `${series.id}:${vi}:${ci}`;
  const have = narrJobs.get(key);
  if (have) return have;
  const job: NarrJob = { state: { status: "queued" }, listeners: new Set(), req: null };
  narrJobs.set(key, job);
  const set = (st: NarrJob["state"]) => {
    job.state = st;
    job.listeners.forEach((l) => l());
  };
  void (async () => {
    const cfg = await narratorConfig();
    if (!cfg) {
      set({ status: "unavailable", why: "Narration is not set up for this page yet." });
      return;
    }
    if (cfg.offline) {
      set({ status: "unavailable", why: cfg.offline });
      return;
    }
    const voice = voiceName(cfg, app.data.profile?.voice ?? "female");
    job.req = await requestNarration({
      lines: linesOf(chapter, ci),
      voice,
      title: `${series.videos[vi]?.title ?? "Video"} · ${chapter.title}`,
      onState: (st) => set(st),
      onError: (code) => {
        if (job.state.status === "done") return;
        set({
          status: "unavailable",
          why:
            code === "not_granted" || code === "consent_required"
              ? "Allow this page to use the Claude Code Remote connector so your narrator can be reached."
              : code === "server_not_connected" || code === "server_not_found"
                ? "The Claude Code Remote connector is not connected to this account."
                : "Your narrator could not be reached just now.",
        });
      },
    });
    if (!job.req && job.state.status === "queued")
      set({ status: "unavailable", why: "Narration could not be requested from this page." });
  })();
  return job;
}

/** For a video written earlier, make sure every chapter has narration requested. */
function narrateVideo(app: App, series: Series, vi: number, video: Video): void {
  video.chapters.forEach((ch, ci) => narrateChapter(app, series, vi, ci, ch));
}

// ---------------------------------------------------------------- the series screen

const minutes = (v: Video) => Math.max(3, Math.round(estimateVideoSeconds(v) / 60));

export function seriesScreen(app: App): View {
  const d = app.data;
  const series = d.series as Series;
  const el = h("section", { class: "path" });
  const ctl = new AbortController();

  const draw = () => {
    const target = SKILL[series.target];
    const next = series.videos.findIndex((v) => !v.watched);
    const allWatched = series.videos.length > 0 && next < 0;
    el.replaceChildren(
      h("p", { class: "eyebrow" }, "Your video series"),
      h("h1", { class: "display-sm" }, target.title),
      h("p", { class: "lede" }, series.intro),
      h(
        "ol",
        { class: "steps" },
        series.videos.map((v, i) =>
          h(
            "li",
            { class: `step step-${v.watched ? "done" : "todo"}` },
            h("span", { class: "step-num" }, String(i + 1)),
            h(
              "div",
              { class: "step-body" },
              h("p", { class: "step-title" }, v.video?.title ?? v.title),
              v.why ? h("p", { class: "muted small" }, v.why) : null,
              h(
                "p",
                { class: "muted small" },
                v.video
                  ? `About ${minutes(v.video)} min · ${v.video.chapters.length} chapters`
                  : "Written for you when you open it · 3 to 5 min",
              ),
            ),
            v.watched
              ? h("span", { class: "chip chip-mastered" }, "Watched")
              : i === next
                ? h("span", { class: "chip chip-learning" }, "Next")
                : null,
          ),
        ),
        h(
          "li",
          { class: `step step-${series.quiz ? "done" : "todo"}` },
          h("span", { class: "step-num" }, "✓"),
          h(
            "div",
            { class: "step-body" },
            h("p", { class: "step-title" }, "Check your understanding"),
            h(
              "p",
              { class: "muted small" },
              series.quiz
                ? `${series.quiz.right} of ${series.quiz.total} correct`
                : "BECE-style questions on everything in the series",
            ),
          ),
        ),
      ),
      h(
        "div",
        { class: "cta" },
        allWatched
          ? btn(series.quiz ? "See your results" : "Take the quiz", () =>
              app.go({ name: series.quiz ? "results" : "quiz" }),
            )
          : btn(`Watch video ${next + 1}`, () => app.go({ name: "video", index: next })),
        allWatched && series.quiz
          ? btn("Take the quiz again", () => app.go({ name: "quiz" }), "btn btn-ghost")
          : !allWatched && series.videos.some((v) => v.watched)
            ? btn("Skip to the quiz", () => app.go({ name: "quiz" }), "btn btn-ghost")
            : null,
      ),
      h(
        "details",
        { class: "why" },
        h("summary", null, "How is this series made for me?"),
        h(
          "p",
          null,
          "Claude plans the series from your answers: which skills underneath the topic need work, which mistakes you made and what you chose, your class, your interests and your reading setting. Each video is then written for you when you open it, and read by your narrator.",
        ),
      ),
    );
  };

  const planning = (msg: string, error = false) =>
    el.replaceChildren(
      h("p", { class: "eyebrow" }, "Your video series"),
      h("h1", { class: "display-sm" }, SKILL[series.target].title),
      h(
        "div",
        { class: `card narrow gen-status${error ? " gen-error" : ""}` },
        error ? null : h("span", { class: "spinner", "aria-hidden": "true" }),
        h("p", { role: "status" }, msg),
        error
          ? h(
              "div",
              { class: "cta" },
              btn("Try again", () => app.go({ name: "series" })),
              btn("Back to topics", () => app.go({ name: "home" }), "btn btn-ghost"),
            )
          : null,
      ),
    );

  if (series.videos.length) draw();
  else if (!onClaude()) planning(genErrorText("unavailable"), true);
  else {
    planning("Claude is planning your series from your answers…");
    planSeries(d, series.target, ctl.signal)
      .then((planned) => {
        if (d.series?.id !== series.id) return;
        series.intro = planned.intro;
        series.videos = planned.videos;
        app.commit();
        draw();
        // Start writing the first video straight away so it is ready sooner.
        startWriting(app, series, 0);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        planning(e instanceof GenError ? e.message : genErrorText("error"), true);
      });
  }
  return { el, cleanup: () => ctl.abort() };
}

// ---------------------------------------------------------------- the video player

interface Timing {
  /** Second each line starts at, and where the chapter ends. */
  marks: number[];
  duration: number;
  /** Absent in silent mode. */
  asset?: string;
}

/** Without narration, lines are timed to reading speed. */
function silentTiming(ch: Chapter, ci: number): Timing {
  const marks: number[] = [];
  let t = 0;
  for (const l of linesOf(ch, ci)) {
    marks.push(t);
    t += Math.max(2.5, (wordCount(l.text) / 150) * 60) + 0.6;
  }
  return { marks, duration: t };
}

/** One media element for the whole player: once a tap has unlocked it, it can play every chapter. */
class Track {
  readonly audio = new Audio();
  private silentBase = 0;
  private silentStart: number | null = null;
  private silent = true;
  rate = 1;

  async load(t: Timing): Promise<void> {
    this.pause();
    this.silentBase = 0;
    this.silent = !t.asset;
    if (!t.asset) return;
    const src = `/_blob/${t.asset}`;
    if (!this.audio.src.endsWith(src)) {
      this.audio.src = src;
      this.audio.preload = "auto";
      await new Promise<void>((resolve) => {
        const ok = () => {
          this.audio.removeEventListener("loadedmetadata", ok);
          this.audio.removeEventListener("error", ok);
          resolve();
        };
        this.audio.addEventListener("loadedmetadata", ok);
        this.audio.addEventListener("error", ok);
      });
    }
  }

  get failed(): boolean {
    return !this.silent && !!this.audio.error;
  }

  now(): number {
    if (!this.silent) return this.audio.currentTime;
    return this.silentStart === null
      ? this.silentBase
      : this.silentBase + ((performance.now() - this.silentStart) / 1000) * this.rate;
  }

  seek(t: number): void {
    if (!this.silent) {
      if (Math.abs(this.audio.currentTime - t) > 0.25) this.audio.currentTime = t;
      return;
    }
    this.silentBase = t;
    if (this.silentStart !== null) this.silentStart = performance.now();
  }

  async play(): Promise<boolean> {
    if (this.silent) {
      if (this.silentStart === null) this.silentStart = performance.now();
      return true;
    }
    this.audio.playbackRate = this.rate;
    try {
      await this.audio.play();
      return true;
    } catch {
      return false;
    }
  }

  pause(): void {
    if (this.silent) {
      this.silentBase = this.now();
      this.silentStart = null;
    } else this.audio.pause();
  }

  setRate(r: number): void {
    const t = this.now();
    this.rate = r;
    if (this.silent) this.seek(t);
    else this.audio.playbackRate = r;
  }

  stop(): void {
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}

export function videoScreen(app: App, index: number, startChapter = 0): View {
  const d = app.data;
  const series = d.series as Series;
  const sv = series.videos[index]!;
  const profile = d.profile!;

  // The video as far as it is written; grows while Claude writes.
  const video: Video = sv.video
    ? sv.video
    : { title: sv.title, goal: sv.goal, chapters: [] as Chapter[] };
  let writing = !sv.video;
  let writeError: GenError | null = null;
  const changed = new Set<() => void>();
  const notify = () => changed.forEach((f) => f());

  let job: WriteJob | null = null;
  const onEvent = (e: ScriptEvent) => {
    if (e.k === "video") video.title = e.title || video.title;
    else if (e.k === "chapter") video.chapters[e.index] = e.chapter;
    else if (e.k === "end") {
      writing = false;
      if (job?.error) writeError = job.error;
      else if (e.video.chapters.length) video.chapters = e.video.chapters;
    }
    notify();
  };
  if (sv.video) narrateVideo(app, series, index, sv.video);
  else if (onClaude()) {
    job = startWriting(app, series, index);
    job.events.forEach(onEvent);
    job.listeners.add(onEvent);
  } else {
    writing = false;
    writeError = new GenError("unavailable", genErrorText("unavailable"));
  }
  // Write the next video in the background while this one plays.
  const prefetchNext = () => {
    const nv = series.videos[index + 1];
    if (nv && !nv.video && onClaude()) startWriting(app, series, index + 1);
  };

  let silentMode = false;
  let captionsOn = profile.captions;
  let speed = app.rate();
  const track = new Track();
  track.rate = speed;
  let token = 0;
  let playing = false;
  let pos = { ci: startChapter, li: 0 };
  let curScene: { key: string; view: SceneView } | null = null;
  const started = Date.now();

  // ----- layout
  const tag = h("p", { class: "stage-tag" });
  const content = h("div", { class: "stage-content" });
  const overlay = h("div", { class: "stage-overlay", hidden: true });
  const stage = h(
    "div",
    { class: "stage", role: "region", "aria-label": "Video" },
    tag,
    content,
    overlay,
  );
  const caption = h("p", { class: "caption", "aria-live": "polite", hidden: !captionsOn });
  const chapterBar = h("div", { class: "chapter-bar", "aria-hidden": "true" });
  const playBtn = h(
    "button",
    { type: "button", class: "ctl ctl-main", "aria-label": "Play" },
    iconPlay(),
  );
  const prev = h(
    "button",
    { type: "button", class: "ctl", "aria-label": "Previous scene" },
    iconPrev(),
  );
  const next = h(
    "button",
    { type: "button", class: "ctl", "aria-label": "Next scene" },
    iconNext(),
  );
  const capBtn = h(
    "button",
    { type: "button", class: "ctl ctl-text", "aria-pressed": String(captionsOn) },
    "CC",
  );
  const speedSel = h(
    "select",
    { class: "ctl-select", "aria-label": "Narration speed" },
    [
      ["0.85", "Slower"],
      ["1", "Normal"],
      ["1.15", "Faster"],
    ].map(([v, l]) => h("option", { value: v, selected: Number(v) === profile.speed }, l)),
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
  const chapterList = h("ol", { class: "chapter-list" });
  const status = h("p", { class: "gen-line muted small", role: "status" });
  const head = h(
    "div",
    { class: "player-head" },
    h("p", { class: "eyebrow" }, `Video ${index + 1} of ${series.videos.length}`),
    h("h1", { class: "display-sm" }, video.title),
  );
  const el = h(
    "section",
    { class: "player" },
    head,
    h(
      "div",
      { class: "player-grid" },
      h("div", { class: "player-box" }, stage, caption, chapterBar, controls, status),
      h("aside", { class: "chapters" }, h("p", { class: "eyebrow" }, "Chapters"), chapterList),
    ),
  );

  // ----- chrome that follows the video as it is written and narrated
  const narrState = (ci: number) => narrJobs.get(`${series.id}:${index}:${ci}`)?.state;
  const drawChrome = () => {
    (head.querySelector("h1") as HTMLElement).textContent = video.title;
    chapterList.replaceChildren(
      ...video.chapters.map((ch, ci) => {
        const ns = narrState(ci);
        const label =
          ns?.status === "done"
            ? ""
            : ns?.status === "working"
              ? " · recording"
              : ns?.status === "queued"
                ? " · waiting for narrator"
                : "";
        return h(
          "li",
          { class: ci === pos.ci ? "on" : "" },
          h(
            "button",
            { type: "button", class: "chapter-btn", onClick: () => jump(ci, 0) },
            h("span", { class: "chapter-title" }, ch.title),
            label ? h("span", { class: "muted small" }, label) : null,
          ),
        );
      }),
      ...(writing
        ? [h("li", { class: "muted small chapter-writing" }, "Claude is writing more…")]
        : []),
    );
    chapterBar.replaceChildren(
      ...video.chapters.map((ch, ci) =>
        h("span", { class: ci < pos.ci ? "done" : ci === pos.ci ? "on" : "", title: ch.title }),
      ),
    );
    status.textContent = writeError
      ? writeError.message
      : writing
        ? `Claude is writing this video for you: ${video.chapters.length} chapter${video.chapters.length === 1 ? "" : "s"} so far.`
        : silentMode
          ? "Playing without sound, with captions."
          : `About ${minutes(video)} minutes · narrated in your narrator's voice.`;
  };
  changed.add(drawChrome);
  const listenNarr = () => {
    video.chapters.forEach((_c, ci) => {
      const j = narrJobs.get(`${series.id}:${index}:${ci}`);
      if (j && !j.listeners.has(drawChrome)) j.listeners.add(drawChrome);
    });
  };
  changed.add(listenNarr);

  // ----- overlay helpers
  const showOverlay = (...kids: (Node | null)[]) => {
    overlay.replaceChildren(...kids.filter((k): k is Node => !!k));
    overlay.hidden = false;
  };
  const hideOverlay = () => {
    overlay.hidden = true;
    overlay.replaceChildren();
  };

  /** Wait until something is true, re-checking whenever the video or its narration changes. */
  const waitFor = <T>(check: () => T | null, my: number): Promise<T | null> =>
    new Promise((resolve) => {
      const tryNow = () => {
        if (my !== token) {
          changed.delete(tryNow);
          resolve(null);
          return;
        }
        const v = check();
        if (v !== null) {
          changed.delete(tryNow);
          resolve(v);
        }
      };
      changed.add(tryNow);
      const poll = window.setInterval(() => {
        if (!changed.has(tryNow)) window.clearInterval(poll);
        else tryNow();
      }, 500);
      tryNow();
    });

  async function timingFor(ci: number, my: number): Promise<Timing | null> {
    const ch = video.chapters[ci]!;
    if (silentMode) return silentTiming(ch, ci);
    // The chapter must be complete (the next one started, or writing finished) before it is narrated.
    const complete = () => !writing || ci < video.chapters.length - 1;
    const job = complete() ? narrateChapter(app, series, index, ci, ch) : null;
    if (job && !job.listeners.has(notify)) job.listeners.add(notify);
    const st = job?.state;
    if (st?.status === "done") return { marks: st.marks, duration: st.duration, asset: st.asset };
    // Wait for the recording, explaining what is happening.
    const waitingMsg = () => {
      const s = narrJobs.get(`${series.id}:${index}:${ci}`)?.state;
      if (s?.status === "unavailable" || s?.status === "failed")
        return [
          h("p", { class: "overlay-title" }, "Narration is not available"),
          h(
            "p",
            null,
            s.status === "failed" ? "The narrator could not record this chapter." : s.why,
          ),
          btn("Watch without sound", () => {
            silentMode = true;
            notify();
          }),
        ];
      return [
        h("span", { class: "spinner", "aria-hidden": "true" }),
        h(
          "p",
          { class: "overlay-title" },
          !complete()
            ? "Claude is writing this part…"
            : s?.status === "working"
              ? `Recording chapter ${ci + 1} in your narrator's voice…`
              : "Waiting for your narrator…",
        ),
        h(
          "p",
          { class: "muted small" },
          "Each chapter is narrated as soon as it is written. This takes a minute or two.",
        ),
      ];
    };
    let lastKey = "";
    const got = await waitFor<Timing>(() => {
      if (silentMode) return silentTiming(ch, ci);
      const j = complete() ? narrateChapter(app, series, index, ci, ch) : null;
      if (j && !j.listeners.has(notify)) j.listeners.add(notify);
      const s = j?.state;
      if (s?.status === "done") return { marks: s.marks, duration: s.duration, asset: s.asset };
      const key = `${complete()}:${s?.status}`;
      if (key !== lastKey) {
        lastKey = key;
        showOverlay(...waitingMsg());
      }
      return null;
    }, my);
    hideOverlay();
    return got;
  }

  function sceneFor(ci: number, lineId: string) {
    const m = /^c(\d+)s(\d+)(r?)$/.exec(lineId)!;
    const si = Number(m[2]);
    return { si, reveal: m[3] === "r", scene: video.chapters[ci]!.scenes[si]! };
  }

  /** The think pause: wait for the student, then reveal. */
  function tryIt(view: SceneView, my: number): Promise<boolean> {
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        hideOverlay();
        resolve(ok);
      };
      const hintBtn = btn(
        "Show a hint",
        () => {
          if (showHint(view.el)) hintBtn.remove();
        },
        "btn btn-ghost btn-small",
      );
      const panel = h(
        "div",
        { class: "think-panel" },
        h("p", { class: "overlay-title" }, "Pause and try it"),
        h("p", { class: "muted small" }, "Work it out on paper, then check."),
        h(
          "div",
          { class: "cta" },
          btn("Show me", () => done(my === token)),
          view.el.querySelector(".think-hint") ? hintBtn : null,
        ),
      );
      overlay.classList.add("overlay-bottom");
      showOverlay(panel);
      (panel.querySelector("button") as HTMLElement).focus({ preventScroll: true });
      const watchToken = window.setInterval(() => {
        if (my !== token) {
          window.clearInterval(watchToken);
          overlay.classList.remove("overlay-bottom");
          done(false);
        }
      }, 300);
    }).then((ok) => {
      overlay.classList.remove("overlay-bottom");
      return ok as boolean;
    });
  }

  async function playFrom(ci: number, li: number) {
    const my = ++token;
    track.pause();
    hideOverlay();
    for (;;) {
      if (my !== token) return;
      if (ci >= video.chapters.length) {
        if (writing) {
          showOverlay(
            h("span", { class: "spinner", "aria-hidden": "true" }),
            h("p", { class: "overlay-title" }, "Claude is writing the next part…"),
          );
          const ok = await waitFor(
            () => (ci < video.chapters.length || !writing ? true : null),
            my,
          );
          hideOverlay();
          if (!ok) return;
          continue;
        }
        if (my === token) end();
        return;
      }
      const ch = video.chapters[ci]!;
      const timing = await timingFor(ci, my);
      if (!timing || my !== token) return;
      await track.load(timing);
      if (my !== token) return;
      if (track.failed) {
        silentMode = true;
        continue;
      }
      const lines = linesOf(ch, ci);
      pos = { ci, li };
      drawChrome();
      for (; li < lines.length; li++) {
        if (my !== token) return;
        pos = { ci, li };
        const line = lines[li]!;
        const { si, reveal, scene } = sceneFor(ci, line.id);
        const t0 = timing.marks[li] ?? 0;
        const t1 = timing.marks[li + 1] ?? timing.duration;
        const key = `${ci}:${si}`;
        if (curScene?.key !== key) {
          curScene?.view.stop();
          const view = renderScene(scene);
          content.replaceChildren(view.el);
          curScene = { key, view };
          tag.textContent = ch.title;
          // The animation runs across the scene's narration (both lines for a think scene).
          view.start(Math.max(1.5, (t1 - t0) / track.rate));
        }
        if (reveal) curScene.view.reveal?.();
        caption.textContent = line.text;
        track.seek(t0);
        if (playing) {
          const ok = await track.play();
          if (!ok) {
            setPlaying(false);
            return;
          }
        }
        const reached = await waitFor(
          () => (track.now() >= t1 - 0.05 || track.audio.ended ? true : null),
          my,
        );
        if (!reached) return;
        if (scene.type === "think" && !reveal) {
          track.pause();
          const ok = await tryIt(curScene.view, my);
          if (!ok) return;
          if (playing) await track.play();
        }
      }
      track.pause();
      ci++;
      li = 0;
    }
  }

  function setPlaying(on: boolean) {
    playing = on;
    playBtn.replaceChildren(on ? iconPause() : iconPlay());
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    if (!on) track.pause();
  }

  function jump(ci: number, li: number) {
    if (ci < 0 || ci >= video.chapters.length) return;
    setPlaying(true);
    curScene = null;
    void playFrom(ci, li);
  }

  function step(dir: 1 | -1) {
    const lines = video.chapters[pos.ci] ? linesOf(video.chapters[pos.ci]!, pos.ci) : [];
    // Move to the first line of the next or previous scene.
    const sceneOf = (i: number) => lines[i]?.id.replace(/r$/, "");
    let li = pos.li;
    const cur = sceneOf(li);
    if (dir === 1) {
      while (li < lines.length && sceneOf(li) === cur) li++;
      if (li >= lines.length) return jump(pos.ci + 1, 0);
    } else {
      while (li > 0 && sceneOf(li - 1) === cur) li--;
      if (li === 0) {
        if (pos.ci === 0) return jump(0, 0);
        const pl = linesOf(video.chapters[pos.ci - 1]!, pos.ci - 1);
        let k = pl.length - 1;
        while (k > 0 && pl[k - 1]!.id.replace(/r$/, "") === pl[k]!.id.replace(/r$/, "")) k--;
        return jump(pos.ci - 1, k);
      }
      li--;
      while (li > 0 && sceneOf(li - 1) === sceneOf(li)) li--;
    }
    jump(pos.ci, li);
  }

  function end() {
    setPlaying(false);
    token++;
    curScene?.view.stop();
    sv.watched = true;
    d.watched.push({
      t: Date.now(),
      lesson: `${series.id}:${index}`,
      seconds: Math.round((Date.now() - started) / 1000),
    });
    app.commit();
    const nextVideo = series.videos[index + 1];
    content.replaceChildren(
      h(
        "div",
        { class: "scene sc-end" },
        h("p", { class: "sc-kicker in" }, "Video done"),
        h(
          "h2",
          { class: "sc-title in" },
          nextVideo ? `Next: ${nextVideo.title}` : "Now show what you know",
        ),
        h(
          "div",
          { class: "cta" },
          nextVideo
            ? btn("Watch the next video", () => app.go({ name: "video", index: index + 1 }))
            : btn("Take the quiz", () => app.go({ name: "quiz" })),
          btn("Back to the series", () => app.go({ name: "series" }), "btn btn-ghost"),
        ),
      ),
    );
    tag.textContent = "";
    caption.textContent = "";
  }

  playBtn.addEventListener("click", () => {
    if (playing) setPlaying(false);
    else {
      setPlaying(true);
      if (!curScene) void playFrom(pos.ci, pos.li);
      else void track.play();
    }
  });
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  capBtn.addEventListener("click", () => {
    captionsOn = !captionsOn;
    caption.hidden = !captionsOn;
    capBtn.setAttribute("aria-pressed", String(captionsOn));
  });
  speedSel.addEventListener("change", () => {
    speed = Number(speedSel.value) * (app.rate() / profile.speed);
    track.setRate(speed);
  });

  // First frame: a big play button (audio needs a tap to start), with the plan for the video.
  const startOverlay = h(
    "button",
    {
      type: "button",
      class: "start-overlay",
      onClick: () => {
        startOverlay.remove();
        // Unlock the media element inside the tap so later chapters can play.
        void track.audio.play().catch(() => {});
        track.audio.pause();
        setPlaying(true);
        prefetchNext();
        void playFrom(pos.ci, 0);
      },
    },
    h("span", { class: "start-circle" }, iconPlay()),
    h(
      "span",
      { class: "start-label" },
      sv.video ? `Play · about ${minutes(sv.video)} min` : "Play",
    ),
  );
  content.replaceChildren(
    h(
      "div",
      { class: "scene sc-intro" },
      h("p", { class: "sc-kicker in" }, `Made for ${profile.name}`),
      h("h2", { class: "sc-title in" }, video.title),
      h("p", { class: "muted" }, sv.goal),
    ),
  );
  stage.append(startOverlay);
  listenNarr();
  drawChrome();

  return {
    el,
    cleanup: () => {
      token++;
      track.stop();
      curScene?.view.stop();
      job?.listeners.delete(onEvent);
      for (const j of narrJobs.values()) {
        j.listeners.delete(drawChrome);
        j.listeners.delete(notify);
      }
      changed.clear();
    },
  };
}

// ---------------------------------------------------------------- end-of-series quiz

function quizSkills(series: Series): SkillId[] {
  const seen: SkillId[] = [];
  for (const v of series.videos) for (const s of v.focus) if (!seen.includes(s)) seen.push(s);
  if (!seen.includes(series.target)) seen.push(series.target);
  // Two questions per skill, four on the topic itself, at most eight.
  const out: SkillId[] = [];
  for (const s of seen) out.push(s, s);
  out.push(series.target, series.target);
  return out.slice(-8);
}

/** Where to rewatch for a mistake: the chapter built to fix it, else the first video on that skill. */
export function rewatchFor(
  series: Series,
  skill: SkillId,
  m?: MisconceptionId,
): { video?: number; chapter?: number } {
  if (m)
    for (let vi = 0; vi < series.videos.length; vi++) {
      const chs = series.videos[vi]!.video?.chapters ?? [];
      const ci = chs.findIndex((c) => c.addresses.includes(m));
      if (ci >= 0) return { video: vi, chapter: ci };
    }
  const vi = series.videos.findIndex((v) => v.focus.includes(skill));
  return vi >= 0 ? { video: vi, chapter: 0 } : {};
}

export function quizScreen(app: App): View {
  const d = app.data;
  const series = d.series as Series;
  const skills = quizSkills(series);
  const box = h("div", { class: "card narrow checks" });
  const el = h("section", { class: "diag" }, box);
  let k = 0;
  let right = 0;
  const missed: QuizMiss[] = [];

  const askOne = () => {
    const skill = skills[k]!;
    const item = makeItem(skill, randomSeed());
    const t0 = performance.now();
    const fbSlot = h("div");
    const nextBtn = h("div", { class: "cta" });
    const card = questionCard(
      item,
      (o) => {
        const ok = record(app, item, o, performance.now() - t0, "check");
        if (ok) right++;
        else
          missed.push({
            skill,
            misconception: o?.misconception,
            ...rewatchFor(series, skill, o?.misconception),
          });
        card.reveal(o);
        fbSlot.replaceChildren(feedback(item, o));
        k++;
        nextBtn.replaceChildren(
          btn(k < skills.length ? "Next question" : "See how you did", () =>
            k < skills.length ? askOne() : finish(),
          ),
        );
        (nextBtn.querySelector("button") as HTMLElement).focus({ preventScroll: true });
      },
      { unsure: true },
    );
    box.replaceChildren(
      h(
        "div",
        { class: "diag-top" },
        h("p", { class: "eyebrow" }, "Check your understanding"),
        h("p", { class: "muted small" }, `Question ${k + 1} of ${skills.length}`),
      ),
      card.el,
      fbSlot,
      nextBtn,
    );
  };

  const finish = () => {
    series.quiz = { at: Date.now(), right, total: skills.length, missed };
    app.commit();
    app.go({ name: "results" });
  };

  box.replaceChildren(
    h("p", { class: "eyebrow" }, "End of the series"),
    h("h1", { class: "display-sm" }, "Show what you know"),
    h(
      "p",
      { class: "lede" },
      `${skills.length} questions on everything in your videos. If you get one wrong, we will show you the exact chapter to watch again.`,
    ),
    h("div", { class: "cta" }, btn("Start", askOne)),
  );
  return { el };
}

export function resultsScreen(app: App): View {
  const d = app.data;
  const series = d.series as Series;
  const quiz = series.quiz!;
  const skills = [...new Set(series.videos.flatMap((v) => v.focus).concat(series.target))];
  const byMistake = new Map<string, QuizMiss & { count: number }>();
  for (const m of quiz.missed) {
    const key = m.misconception ?? `skill:${m.skill}`;
    const have = byMistake.get(key);
    if (have) have.count++;
    else byMistake.set(key, { ...m, count: 1 });
  }
  const passed = quiz.right >= Math.ceil((2 * quiz.total) / 3);

  const followUp = () => {
    const ms = [...byMistake.values()];
    const focus = [...new Set(ms.map((m) => m.skill))];
    series.videos.push({
      title: "Fixing what tripped you up",
      focus: focus.length ? focus : [series.target],
      goal: `Go back over ${ms
        .map((m) =>
          m.misconception
            ? MISCONCEPTIONS[m.misconception].label.toLowerCase()
            : SKILL[m.skill].title.toLowerCase(),
        )
        .slice(0, 3)
        .join(", ")} with new explanations and new examples.`,
      why: "Made from your quiz answers, to fix exactly what you got wrong.",
    });
    series.quiz = undefined;
    app.commit();
    app.go({ name: "video", index: series.videos.length - 1 });
  };

  const el = h(
    "section",
    { class: "done" },
    h("p", { class: "eyebrow" }, `${quiz.right} of ${quiz.total} correct`),
    h("h1", { class: "display-sm" }, passed ? "Well done" : "Good effort. Let’s fix the rest"),
    h(
      "ul",
      { class: "progress-list" },
      skills.map((s) => {
        const p = d.mastery[s] ?? null;
        const n = d.attempts.filter((a) => a.skill === s).length;
        return h(
          "li",
          null,
          h("p", { class: "step-title" }, SKILL[s].title),
          meter(p, SKILL[s].title),
          h("p", { class: "muted small" }, STATE_LABEL[stateOf(p ?? undefined, n)]),
        );
      }),
    ),
    byMistake.size
      ? h(
          "div",
          { class: "card rewatch" },
          h("h2", { class: "section-title" }, "Watch these parts again"),
          h(
            "ul",
            { class: "plain" },
            [...byMistake.values()].map((m) => {
              const what = m.misconception
                ? MISCONCEPTIONS[m.misconception].did
                : `A question on ${SKILL[m.skill].title.toLowerCase()} went wrong.`;
              const v = m.video !== undefined ? series.videos[m.video] : undefined;
              const ch = v?.video?.chapters[m.chapter ?? 0];
              return h(
                "li",
                { class: "rewatch-item" },
                h("p", null, what),
                v
                  ? btn(
                      `Rewatch: video ${m.video! + 1}${ch ? ` · ${ch.title}` : ""}`,
                      () => app.go({ name: "video", index: m.video!, chapter: m.chapter ?? 0 }),
                      "btn btn-ghost btn-small",
                    )
                  : null,
              );
            }),
          ),
          onClaude()
            ? h("div", { class: "cta" }, btn("Make me a new video on these mistakes", followUp))
            : null,
        )
      : null,
    h(
      "div",
      { class: "cta" },
      btn(
        "Choose another topic",
        () => app.go({ name: "home" }),
        byMistake.size ? "btn btn-ghost" : "btn btn-primary",
      ),
      btn("Back to the series", () => app.go({ name: "series" }), "btn btn-ghost"),
    ),
    (() => {
      const up = nextUp(d.mastery)
        .filter((s) => !skills.includes(s))
        .slice(0, 3);
      return up.length
        ? h(
            "p",
            { class: "muted small" },
            `Ready next: ${up.map((s) => SKILL[s].title).join(", ")}.`,
          )
        : null;
    })(),
  );
  return { el };
}
