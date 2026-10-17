type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> | null | undefined;

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

function setAttrs(el: Element, attrs: Attrs): void {
  if (!attrs) return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === "html") {
      el.innerHTML = String(v);
    } else {
      el.setAttribute(k === "className" ? "class" : k, v === true ? "" : String(v));
    }
  }
}

/** Tiny element builder: h("button", { class: "btn", onClick }, "Start"). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function s(tag: string, attrs?: Attrs, ...children: Child[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  setAttrs(el, attrs);
  append(el, children);
  return el;
}

export function esc(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const VARS = /(^|[^A-Za-zÀ-ɏ])([xynmpkw])(?![A-Za-zÀ-ɏ])/g;

function frac(top: string, bottom: string): string {
  return `<span class="frac" role="math" aria-label="${top} over ${bottom}"><span class="num">${top}</span><span class="den">${bottom}</span></span>`;
}

/**
 * Typeset a maths string: stacked fractions for a/b and (x + 2)/3, italic
 * letters for variables. Input is plain text; output is safe HTML.
 */
export function mathHTML(text: string): string {
  let out = esc(text);
  out = out.replace(/\(([^()]+)\)\/(\d+)/g, (_m, top: string, bottom: string) => frac(top, bottom));
  out = out.replace(/(\d+|[a-z])\/(\d+)/g, (_m, top: string, bottom: string) => frac(top, bottom));
  out = out.replace(VARS, (_m, pre: string, v: string) => `${pre}<i class="var">${v}</i>`);
  return out;
}

export function math(text: string, cls = "math"): HTMLSpanElement {
  return h("span", { class: cls, html: mathHTML(text) });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
