import type { SkillId } from "./content/skills";
import { insights } from "./engine/analytics";
import { loadRemote, onClaude, saveRemote } from "./gen/runtime";
import { clear, emptyData, load, revive, save, type AccentId, type Data } from "./state";
import { h } from "./ui/dom";
import { initPwa } from "./pwa";
import { sampleStudent } from "./ui/sample";
import * as screens from "./ui/screens";
import * as series from "./ui/series";

export type Screen =
  | { name: "welcome" }
  | { name: "onboard" }
  | { name: "home" }
  | { name: "diagnostic"; target: SkillId }
  | { name: "series" }
  | { name: "video"; index: number; chapter?: number }
  | { name: "quiz" }
  | { name: "results" }
  | { name: "profile" };

export interface App {
  data: Data;
  go(s: Screen): void;
  commit(): void;
  rate(): number;
  register(): "standard" | "simple";
  setAccent(a: AccentId): void;
  /** Start a new series on a topic; the series screen plans it. */
  newSeries(target: SkillId): void;
  loadSample(): void;
  reset(): void;
}

function boot(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const main = h("main", { class: "shell", id: "main" });
  const header = h("header", { class: "topbar" });
  const banner = h("div", { class: "banner", hidden: true });
  root.replaceChildren(header, banner, main);
  let cleanup: (() => void) | undefined;

  const app: App = {
    data: load(),
    go(s) {
      cleanup?.();
      // Screens that need a profile or a series fall back sensibly.
      const sr = app.data.series;
      if (!app.data.profile && s.name !== "welcome" && s.name !== "onboard")
        s = { name: "welcome" };
      if ((s.name === "series" || s.name === "quiz") && !sr) s = { name: "home" };
      if (s.name === "video" && !sr?.videos[s.index]) s = { name: sr ? "series" : "home" };
      if (s.name === "results" && !sr?.quiz) s = { name: sr ? "series" : "home" };
      const v =
        s.name === "welcome"
          ? screens.welcome(app)
          : s.name === "onboard"
            ? screens.onboard(app)
            : s.name === "home"
              ? screens.home(app)
              : s.name === "diagnostic"
                ? screens.diagnostic(app, s.target)
                : s.name === "series"
                  ? series.seriesScreen(app)
                  : s.name === "video"
                    ? series.videoScreen(app, s.index, s.chapter)
                    : s.name === "quiz"
                      ? series.quizScreen(app)
                      : s.name === "results"
                        ? series.resultsScreen(app)
                        : screens.profile(app);
      cleanup = v.cleanup;
      main.replaceChildren(v.el);
      drawChrome(s);
      window.scrollTo({ top: 0 });
      (main.querySelector("h1") as HTMLElement | null)?.setAttribute("tabindex", "-1");
    },
    commit() {
      save(app.data);
      if (!app.data.profile?.sample) saveRemote(app.data);
    },
    rate() {
      const p = app.data.profile;
      const r = (p?.speed ?? 1) * insights(app.data).paceFactor;
      return Math.min(1.3, Math.max(0.75, r));
    },
    register: () => (app.data.profile?.simpler ? "simple" : "standard"),
    setAccent(a) {
      root.setAttribute("data-accent", a);
    },
    newSeries(target) {
      const d = app.data;
      d.series = {
        id: `s${Date.now().toString(36)}`,
        target,
        createdAt: Date.now(),
        intro: "",
        videos: [],
      };
      d.planStart = { ...d.mastery };
      app.commit();
    },
    loadSample() {
      app.data = sampleStudent();
      app.setAccent(app.data.profile!.accent);
      app.go({ name: "home" });
    },
    reset() {
      clear();
      app.data = emptyData();
      app.setAccent("purple");
      app.go({ name: "welcome" });
    },
  };

  function drawChrome(s: Screen) {
    const p = app.data.profile;
    header.replaceChildren(
      h(
        "div",
        { class: "topbar-inner" },
        h(
          "button",
          {
            type: "button",
            class: "brand",
            "aria-label": "Adwen Maths home",
            onClick: () => app.go({ name: p ? "home" : "welcome" }),
          },
          h("span", { class: "brand-mark", "aria-hidden": "true" }, "x"),
          h("span", { class: "brand-name" }, "Adwen Maths"),
        ),
        p
          ? h(
              "nav",
              { class: "nav" },
              h(
                "button",
                {
                  type: "button",
                  class: `navlink${s.name === "home" ? " on" : ""}`,
                  onClick: () => app.go({ name: "home" }),
                },
                "Topics",
              ),
              app.data.series
                ? h(
                    "button",
                    {
                      type: "button",
                      class: `navlink${s.name === "series" || s.name === "video" ? " on" : ""}`,
                      onClick: () => app.go({ name: "series" }),
                    },
                    "My videos",
                  )
                : null,
              h(
                "button",
                {
                  type: "button",
                  class: `navlink avatar-link${s.name === "profile" ? " on" : ""}`,
                  onClick: () => app.go({ name: "profile" }),
                  "aria-label": `${p.name}'s learning profile`,
                },
                h("span", { class: "avatar" }, p.name.slice(0, 1).toUpperCase()),
                h("span", { class: "avatar-name" }, "Profile"),
              ),
            )
          : null,
      ),
    );
    banner.hidden = !p?.sample;
    if (p?.sample) {
      banner.replaceChildren(
        h(
          "div",
          { class: "banner-inner" },
          h(
            "p",
            null,
            `You are exploring a sample student, ${p.name}. The answers and progress here are examples.`,
          ),
          h(
            "button",
            { type: "button", class: "btn btn-small", onClick: () => app.reset() },
            "Start as yourself",
          ),
        ),
      );
    }
  }

  if (app.data.profile) app.setAccent(app.data.profile.accent);
  if (!onClaude()) initPwa();
  app.go({ name: app.data.profile ? "home" : "welcome" });
  // On claude.ai the record is also kept in the student's private folder; use it when this
  // browser has nothing saved (a new device, or cleared storage).
  if (onClaude() && !app.data.profile)
    void loadRemote().then((raw) => {
      if (!raw || app.data.profile) return;
      const d = revive(raw);
      if (!d.profile) return;
      app.data = d;
      save(d);
      app.setAccent(d.profile.accent);
      app.go({ name: "home" });
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
