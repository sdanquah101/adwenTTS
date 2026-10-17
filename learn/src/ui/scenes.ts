import type { BalanceAction, Pan, Scene, Tile } from "../content/lessons";
import { fmtInt } from "../math/format";
import { h, math, mathHTML, reducedMotion, s } from "./dom";

/** A rendered scene. `start` schedules its animation across `duration` seconds. */
export interface SceneView {
  el: HTMLElement;
  start(duration: number): void;
  /** Jump to the final state (skip, or reduced motion). */
  finish(): void;
  stop(): void;
}

class Timeline {
  private timers: number[] = [];
  at(seconds: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, Math.max(0, seconds * 1000)));
  }
  clear(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }
}

function view(
  el: HTMLElement,
  steps: { at: number; run: () => void }[],
  finalize: () => void,
): SceneView {
  const tl = new Timeline();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    tl.clear();
    finalize();
  };
  return {
    el,
    start(duration) {
      if (reducedMotion()) {
        finish();
        return;
      }
      for (const st of steps) tl.at(st.at * duration, st.run);
      tl.at(duration, finish);
    },
    finish,
    stop: () => tl.clear(),
  };
}

const show = (el: Element) => el.classList.add("in");

export function renderScene(scene: Scene): SceneView {
  switch (scene.type) {
    case "intro":
      return intro(scene.kicker, scene.title);
    case "steps":
      return steps(scene.lines);
    case "balance":
      return balance(scene.math, scene.left, scene.right, scene.actions, scene.result);
    case "numberline":
      return numberline(scene.math, scene.start, scene.by, scene.min, scene.max);
    case "tiles":
      return tiles(scene.math, scene.tiles, scene.result);
    case "contrast":
      return contrast(scene.wrong, scene.right, scene.why);
    case "rule":
      return rule(scene.title, scene.body);
    case "bars":
      return bars(scene.math, scene.rows, scene.result);
    case "grid100":
      return grid100(scene.math, scene.shaded, scene.result);
  }
}

function intro(kicker: string, title: string): SceneView {
  const k = h("p", { class: "sc-kicker reveal" }, kicker);
  const t = h("h2", { class: "sc-title reveal" }, title);
  const el = h("div", { class: "scene sc-intro" }, k, t);
  return view(
    el,
    [
      { at: 0.02, run: () => show(k) },
      { at: 0.15, run: () => show(t) },
    ],
    () => [k, t].forEach(show),
  );
}

function steps(lines: { expr: string; note?: string }[]): SceneView {
  const rows = lines.map((l) =>
    h(
      "li",
      { class: "sc-step reveal" },
      h("span", { class: "sc-expr", html: mathHTML(l.expr) }),
      l.note ? h("span", { class: "sc-note" }, l.note) : null,
    ),
  );
  const el = h("div", { class: "scene sc-steps" }, h("ol", { class: "sc-steplist" }, rows));
  const n = rows.length;
  const cues = rows.map((r, i) => ({
    at: 0.04 + (0.8 * i) / Math.max(1, n - 1 || 1),
    run: () => {
      rows.forEach((x, j) => x.classList.toggle("past", j < i));
      show(r);
    },
  }));
  return view(el, cues, () => {
    rows.forEach((r) => {
      show(r);
      r.classList.remove("past");
    });
  });
}

// ---------- balance scale ----------

interface PanState {
  x: number;
  u: number;
}

const W = 640;
const H = 380;
const PAN_W = 230;
const LEFT_CX = 170;
const RIGHT_CX = 470;
const PAN_Y = 268;

function panItems(state: PanState, cx: number, side: "L" | "R"): SVGElement[] {
  const out: SVGElement[] = [];
  const xw = 40;
  const xh = 46;
  const uw = 22;
  const gap = 5;
  let y = PAN_Y - 6;
  // x bags first, in rows of 5
  const perRowX = 5;
  for (let i = 0; i < state.x; i++) {
    const row = Math.floor(i / perRowX);
    const inRow = Math.min(perRowX, state.x - row * perRowX);
    const col = i % perRowX;
    const rowW = inRow * xw + (inRow - 1) * gap;
    const x0 = cx - rowW / 2 + col * (xw + gap);
    const y0 = y - xh - row * (xh + gap);
    out.push(
      s(
        "g",
        { class: "bal-item bal-x", "data-side": side, "data-kind": "x", "data-i": i },
        s("rect", { x: x0, y: y0, width: xw, height: xh, rx: 10 }),
        s("text", { x: x0 + xw / 2, y: y0 + xh / 2 + 7, "text-anchor": "middle" }, "x"),
      ),
    );
  }
  if (state.x) y -= Math.ceil(state.x / perRowX) * (xh + gap);
  const perRowU = 8;
  for (let i = 0; i < state.u; i++) {
    const row = Math.floor(i / perRowU);
    const inRow = Math.min(perRowU, state.u - row * perRowU);
    const col = i % perRowU;
    const rowW = inRow * uw + (inRow - 1) * gap;
    const x0 = cx - rowW / 2 + col * (uw + gap);
    const y0 = y - uw - row * (uw + gap);
    out.push(
      s(
        "g",
        { class: "bal-item bal-u", "data-side": side, "data-kind": "u", "data-i": i },
        s("rect", { x: x0, y: y0, width: uw, height: uw, rx: 4 }),
        s("text", { x: x0 + uw / 2, y: y0 + uw / 2 + 5, "text-anchor": "middle" }, "1"),
      ),
    );
  }
  return out;
}

function balance(
  mathText: string,
  left: Pan,
  right: Pan,
  actions: BalanceAction[],
  result: string,
): SceneView {
  let L: PanState = { x: left.x ?? 0, u: left.units ?? 0 };
  let R: PanState = { x: right.x ?? 0, u: right.units ?? 0 };
  const items = s("g", { class: "bal-items" });
  const frame = s(
    "svg",
    {
      viewBox: `0 0 ${W} ${H}`,
      class: "bal-svg",
      role: "img",
      "aria-label": `Balance scale showing ${mathText}`,
    },
    s("polygon", {
      class: "bal-stand",
      points: `${W / 2},180 ${W / 2 - 46},${H - 18} ${W / 2 + 46},${H - 18}`,
    }),
    s("rect", {
      class: "bal-beam",
      x: LEFT_CX - 20,
      y: 172,
      width: RIGHT_CX - LEFT_CX + 40,
      height: 12,
      rx: 6,
    }),
    s("circle", { class: "bal-pivot", cx: W / 2, cy: 178, r: 9 }),
    s("line", { class: "bal-string", x1: LEFT_CX, y1: 184, x2: LEFT_CX, y2: PAN_Y }),
    s("line", { class: "bal-string", x1: RIGHT_CX, y1: 184, x2: RIGHT_CX, y2: PAN_Y }),
    s("rect", {
      class: "bal-pan",
      x: LEFT_CX - PAN_W / 2,
      y: PAN_Y,
      width: PAN_W,
      height: 12,
      rx: 6,
    }),
    s("rect", {
      class: "bal-pan",
      x: RIGHT_CX - PAN_W / 2,
      y: PAN_Y,
      width: PAN_W,
      height: 12,
      rx: 6,
    }),
    s("text", { class: "bal-eq", x: W / 2, y: PAN_Y + 4, "text-anchor": "middle" }, "="),
    items,
  );
  const draw = () => {
    items.replaceChildren(...panItems(L, LEFT_CX, "L"), ...panItems(R, RIGHT_CX, "R"));
  };
  draw();
  const eq = h("p", { class: "sc-bigmath", html: mathHTML(mathText) });
  const label = h("p", { class: "sc-chip", "aria-live": "polite" }, "");
  const res = h("p", { class: "sc-result reveal", html: mathHTML(result) });
  const el = h(
    "div",
    { class: "scene sc-balance" },
    eq,
    h("div", { class: "bal-wrap" }, frame),
    h("div", { class: "sc-foot" }, label, res),
  );

  const apply = (a: BalanceAction) => {
    label.textContent = a.label;
    label.classList.add("in");
    const leaving = (kind: "x" | "u", side: "L" | "R", from: number) =>
      items
        .querySelectorAll<SVGElement>(`[data-side="${side}"][data-kind="${kind}"]`)
        .forEach((g) => {
          if (Number(g.dataset.i) >= from) g.classList.add("leaving");
        });
    if (a.type === "removeUnits") {
      leaving("u", "L", L.u - a.n);
      leaving("u", "R", R.u - a.n);
      L = { ...L, u: L.u - a.n };
      R = { ...R, u: R.u - a.n };
    } else if (a.type === "removeX") {
      leaving("x", "L", L.x - a.n);
      leaving("x", "R", R.x - a.n);
      L = { ...L, x: L.x - a.n };
      R = { ...R, x: R.x - a.n };
    } else {
      const k = a.groups;
      leaving("x", "L", L.x / k);
      leaving("u", "L", L.u / k);
      leaving("x", "R", R.x / k);
      leaving("u", "R", R.u / k);
      L = { x: L.x / k, u: L.u / k };
      R = { x: R.x / k, u: R.u / k };
    }
    window.setTimeout(draw, 750);
  };

  const n = actions.length;
  const cues = actions.map((a, i) => ({
    at: 0.18 + (0.62 * i) / Math.max(1, n),
    run: () => apply(a),
  }));
  cues.push({ at: 0.86, run: () => show(res) });
  return view(el, cues, () => {
    // Recompute the final state from scratch so finish() is idempotent.
    let fl: PanState = { x: left.x ?? 0, u: left.units ?? 0 };
    let fr: PanState = { x: right.x ?? 0, u: right.units ?? 0 };
    for (const a of actions) {
      if (a.type === "removeUnits") {
        fl = { ...fl, u: fl.u - a.n };
        fr = { ...fr, u: fr.u - a.n };
      } else if (a.type === "removeX") {
        fl = { ...fl, x: fl.x - a.n };
        fr = { ...fr, x: fr.x - a.n };
      } else {
        fl = { x: fl.x / a.groups, u: fl.u / a.groups };
        fr = { x: fr.x / a.groups, u: fr.u / a.groups };
      }
    }
    L = fl;
    R = fr;
    draw();
    const last = actions[actions.length - 1];
    if (last) {
      label.textContent = last.label;
      show(label);
    }
    show(res);
  });
}

// ---------- number line ----------

function numberline(
  mathText: string,
  start: number,
  by: number,
  min: number,
  max: number,
): SceneView {
  const vw = 640;
  const pad = 36;
  const step = (vw - 2 * pad) / (max - min);
  const X = (v: number) => pad + (v - min) * step;
  const baseY = 120;
  const ticks: SVGElement[] = [];
  for (let v = min; v <= max; v++) {
    ticks.push(
      s("line", {
        class: v === 0 ? "nl-tick zero" : "nl-tick",
        x1: X(v),
        y1: baseY - (v === 0 ? 14 : 9),
        x2: X(v),
        y2: baseY + (v === 0 ? 14 : 9),
      }),
    );
    ticks.push(
      s(
        "text",
        {
          class: v === 0 ? "nl-num zero" : "nl-num",
          x: X(v),
          y: baseY + 36,
          "text-anchor": "middle",
        },
        fmtInt(v),
      ),
    );
  }
  const dir = Math.sign(by);
  const hops: SVGElement[] = [];
  for (let i = 0; i < Math.abs(by); i++) {
    const a = start + dir * i;
    const b = a + dir;
    const mx = (X(a) + X(b)) / 2;
    hops.push(
      s("path", {
        class: "nl-hop",
        d: `M${X(a)} ${baseY - 6} Q${mx} ${baseY - 58} ${X(b)} ${baseY - 6}`,
        pathLength: 1,
      }),
    );
  }
  const end = start + by;
  const startDot = s("circle", { class: "nl-start", cx: X(start), cy: baseY, r: 9 });
  const endDot = s("circle", { class: "nl-end", cx: X(end), cy: baseY, r: 10 });
  const svg = s(
    "svg",
    {
      viewBox: `0 0 ${vw} 190`,
      class: "nl-svg",
      role: "img",
      "aria-label": `Number line: ${mathText} = ${fmtInt(end)}`,
    },
    s("line", { class: "nl-axis", x1: pad - 18, y1: baseY, x2: vw - pad + 18, y2: baseY }),
    s("polygon", {
      class: "nl-arrow",
      points: `${vw - pad + 26},${baseY} ${vw - pad + 14},${baseY - 7} ${vw - pad + 14},${baseY + 7}`,
    }),
    s("polygon", {
      class: "nl-arrow",
      points: `${pad - 26},${baseY} ${pad - 14},${baseY - 7} ${pad - 14},${baseY + 7}`,
    }),
    ticks,
    hops,
    startDot,
    endDot,
  );
  const eq = h("p", { class: "sc-bigmath", html: mathHTML(mathText) });
  const res = h("p", { class: "sc-result reveal", html: mathHTML(`${mathText} = ${fmtInt(end)}`) });
  const el = h(
    "div",
    { class: "scene sc-numberline" },
    eq,
    h("div", { class: "nl-wrap" }, svg),
    h("div", { class: "sc-foot" }, res),
  );
  const cues = [{ at: 0.08, run: () => startDot.classList.add("in") }];
  hops.forEach((hp, i) =>
    cues.push({
      at: 0.22 + (0.5 * i) / Math.max(1, hops.length),
      run: () => hp.classList.add("in"),
    }),
  );
  cues.push({ at: 0.78, run: () => endDot.classList.add("in") });
  cues.push({ at: 0.84, run: () => show(res) });
  return view(el, cues, () => {
    startDot.classList.add("in");
    hops.forEach((hp) => hp.classList.add("in"));
    endDot.classList.add("in");
    show(res);
  });
}

// ---------- algebra tiles ----------

function tileEls(t: Tile): HTMLElement[] {
  return Array.from({ length: Math.abs(t.n) }, () =>
    h(
      "span",
      { class: `tile tile-${t.kind === "x" ? "x" : "u"}${t.n < 0 ? " neg" : ""}` },
      t.kind === "x" ? (t.n < 0 ? "−x" : "x") : t.n < 0 ? "−1" : "1",
    ),
  );
}

function tiles(mathText: string, ts: Tile[], result: string): SceneView {
  const eq = h("p", { class: "sc-bigmath", html: mathHTML(mathText) });
  const mixed = h(
    "div",
    { class: "tiles-row" },
    ts.map((t) => h("span", { class: "tile-group" }, tileEls(t))),
  );
  const xs = ts.filter((t) => t.kind === "x");
  const us = ts.filter((t) => t.kind === "1");
  const pos = us.filter((t) => t.n > 0).reduce((a, t) => a + t.n, 0);
  const neg = -us.filter((t) => t.n < 0).reduce((a, t) => a + t.n, 0);
  const pairs = Math.min(pos, neg);
  const unitTiles: HTMLElement[] = [];
  for (let i = 0; i < pos; i++)
    unitTiles.push(h("span", { class: `tile tile-u${i < pairs ? " pair" : ""}` }, "1"));
  for (let i = 0; i < neg; i++)
    unitTiles.push(h("span", { class: `tile tile-u neg${i < pairs ? " pair" : ""}` }, "−1"));
  const sorted = h(
    "div",
    { class: "tiles-sorted reveal" },
    h(
      "div",
      { class: "tiles-bin" },
      h("p", { class: "bin-label" }, "x terms"),
      h("div", { class: "tiles-row" }, xs.flatMap(tileEls)),
    ),
    h(
      "div",
      { class: "tiles-bin" },
      h("p", { class: "bin-label" }, "numbers"),
      h("div", { class: "tiles-row" }, unitTiles),
    ),
  );
  const res = h("p", { class: "sc-result reveal", html: mathHTML(`= ${result}`) });
  const stack = h("div", { class: "tiles-stack" }, mixed, sorted);
  const el = h("div", { class: "scene sc-tiles" }, eq, stack, h("div", { class: "sc-foot" }, res));
  const sortNow = () => {
    mixed.classList.add("gone");
    show(sorted);
  };
  const cancel = () => sorted.querySelectorAll(".pair").forEach((p) => p.classList.add("cancel"));
  return view(
    el,
    [
      { at: 0.32, run: sortNow },
      { at: 0.62, run: cancel },
      { at: 0.82, run: () => show(res) },
    ],
    () => {
      sortNow();
      cancel();
      show(res);
    },
  );
}

// ---------- mistake vs fix ----------

function contrast(wrong: string, right: string, why: string): SceneView {
  const mark = (ok: boolean) =>
    s(
      "svg",
      { viewBox: "0 0 24 24", class: `mark ${ok ? "ok" : "no"}`, "aria-hidden": "true" },
      ok ? s("path", { d: "M5 12.5l4.5 4.5L19 7.5" }) : s("path", { d: "M6 6l12 12M18 6L6 18" }),
    );
  const w = h(
    "div",
    { class: "cmp cmp-wrong reveal" },
    h("p", { class: "cmp-label" }, mark(false), "Common mistake"),
    math(wrong, "cmp-math"),
  );
  const r = h(
    "div",
    { class: "cmp cmp-right reveal" },
    h("p", { class: "cmp-label" }, mark(true), "Correct"),
    math(right, "cmp-math"),
  );
  const y = h("p", { class: "cmp-why reveal" }, why);
  const el = h("div", { class: "scene sc-contrast" }, h("div", { class: "cmp-pair" }, w, r), y);
  return view(
    el,
    [
      { at: 0.04, run: () => show(w) },
      { at: 0.42, run: () => show(r) },
      { at: 0.7, run: () => show(y) },
    ],
    () => [w, r, y].forEach(show),
  );
}

function rule(title: string, body: string[]): SceneView {
  const t = h("p", { class: "rule-title reveal" }, title);
  const lines = body.map((b) => h("li", { class: "reveal", html: mathHTML(b) }));
  const el = h(
    "div",
    { class: "scene sc-rule" },
    h("div", { class: "rule-card" }, t, h("ul", { class: "rule-list" }, lines)),
  );
  const cues = [
    { at: 0.02, run: () => show(t) },
    ...lines.map((l, i) => ({
      at: 0.15 + (0.6 * i) / Math.max(1, lines.length),
      run: () => show(l),
    })),
  ];
  return view(el, cues, () => [t, ...lines].forEach(show));
}

// ---------- fraction bars ----------

function bars(
  mathText: string,
  rows: { parts: number; shaded: number; label: string }[],
  result: string,
): SceneView {
  const eq = h("p", { class: "sc-bigmath sc-bars-title", html: mathHTML(mathText) });
  const rowEls = rows.map((r) =>
    h(
      "div",
      { class: "bar-row reveal" },
      h("span", { class: "bar-label", html: mathHTML(r.label) }),
      h(
        "span",
        { class: "bar", role: "img", "aria-label": `${r.shaded} of ${r.parts} equal parts shaded` },
        Array.from({ length: r.parts }, (_, i) =>
          h("span", { class: i < r.shaded ? "seg on" : "seg" }),
        ),
      ),
    ),
  );
  const res = h("p", { class: "sc-result reveal", html: mathHTML(result) });
  const el = h(
    "div",
    { class: "scene sc-bars" },
    eq,
    h("div", { class: "bar-stack" }, rowEls),
    h("div", { class: "sc-foot" }, res),
  );
  const cues = rowEls.map((r, i) => ({
    at: 0.06 + (0.62 * i) / Math.max(1, rowEls.length),
    run: () => show(r),
  }));
  cues.push({ at: 0.82, run: () => show(res) });
  return view(el, cues, () => [...rowEls, res].forEach(show));
}

// ---------- hundred square ----------

function grid100(mathText: string, shaded: number, result: string): SceneView {
  const cells = Array.from({ length: 100 }, () => h("span", { class: "g100-cell" }));
  const grid = h(
    "div",
    { class: "g100", role: "img", "aria-label": `${shaded} of 100 squares shaded` },
    cells,
  );
  const eq = h("p", { class: "sc-bigmath", html: mathHTML(mathText) });
  const res = h("p", { class: "sc-result reveal", html: mathHTML(result) });
  const el = h(
    "div",
    { class: "scene sc-grid100" },
    h("div", { class: "g100-row" }, grid, h("div", { class: "g100-side" }, eq, res)),
  );
  const fill = (n: number) => cells.forEach((c, i) => c.classList.toggle("on", i < n));
  const steps = 10;
  const cues = Array.from({ length: steps }, (_, i) => ({
    at: 0.12 + (0.55 * i) / steps,
    run: () => fill(Math.round((shaded * (i + 1)) / steps)),
  }));
  cues.push({ at: 0.78, run: () => show(res) });
  return view(el, cues, () => {
    fill(shaded);
    show(res);
  });
}
