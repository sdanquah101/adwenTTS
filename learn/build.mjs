// Bundles the app into one HTML file that works offline:
//   dist/index.html        page fragment for claude.ai, where videos are written and narrated on the spot
//   dist/adwen-maths.html  complete standalone document (open directly, or share the file)
//   dist/app/              installable web app (manifest, icons, offline service worker); deploy this folder
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const watch = process.argv.includes("--watch");

// Light and dark values for each colour a student can choose: [accent, strong, soft].
const ACCENTS = {
  purple: { light: ["#6b3fd4", "#5530b3", "#efe9fd"], dark: ["#ab8dff", "#c7b3ff", "#2b2346"] },
  blue: { light: ["#1f5fc4", "#174a9c", "#e6effc"], dark: ["#7fb0ff", "#a9c9ff", "#1b2a45"] },
  green: { light: ["#1a7a44", "#135e34", "#e3f3e9"], dark: ["#6bd39b", "#95e2b8", "#16301f"] },
  orange: { light: ["#b4520b", "#8f4008", "#fdeee2"], dark: ["#ffaa6b", "#ffc597", "#3a2414"] },
  rose: { light: ["#b8285a", "#931e47", "#fce8ef"], dark: ["#ff8fb6", "#ffb3cd", "#3d1a28"] },
  teal: { light: ["#0b7480", "#085a63", "#e0f3f4"], dark: ["#5fd2d9", "#8fe2e6", "#12302f"] },
};

function accentCss() {
  const vars = ([a, s, soft]) => `--accent:${a};--accent-strong:${s};--accent-soft:${soft};`;
  let light = "";
  let darkMedia = "";
  let darkAttr = "";
  for (const [id, v] of Object.entries(ACCENTS)) {
    light += `.app[data-accent="${id}"],.swatch[data-accent="${id}"]{${vars(v.light)}}\n`;
    darkMedia += `:root:not([data-theme="light"]) .app[data-accent="${id}"],:root:not([data-theme="light"]) .swatch[data-accent="${id}"]{${vars(v.dark)}}\n`;
    darkAttr += `:root[data-theme="dark"] .app[data-accent="${id}"],:root[data-theme="dark"] .swatch[data-accent="${id}"]{${vars(v.dark)}}\n`;
  }
  return `${light}@media (prefers-color-scheme: dark){\n${darkMedia}}\n${darkAttr}`;
}

function page(js) {
  const css = readFileSync(join(here, "src/styles.css"), "utf8").replace(
    "/*ACCENTS*/",
    accentCss(),
  );
  const tpl = readFileSync(join(here, "src/page.html"), "utf8");
  // Avoid "</script>" inside the bundle ending the tag early.
  const safeJs = js.replace(/<\/script/gi, "<\\/script");
  return tpl.replace("/*CSS*/", () => css).replace("/*JS*/", () => safeJs);
}

function write(js) {
  mkdirSync(dist, { recursive: true });
  const fragment = page(js);
  writeFileSync(join(dist, "index.html"), fragment);
  const standalone = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${fragment.replace(/<div id="app"[\s\S]*$/, "")}</head>\n<body>\n${fragment.match(/<div id="app"[\s\S]*$/)[0]}\n</body>\n</html>\n`;
  writeFileSync(join(dist, "adwen-maths.html"), standalone);
  writeSite(standalone);
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(
    `built dist/index.html (${kb(fragment)}) and dist/adwen-maths.html (${kb(standalone)})`,
  );
}

const ICON_DIR = join(here, "src", "icons");
const THEME = { light: "#f6f5fa", dark: "#12101b", brand: "#6b3fd4" };

/** The installable build: same app, plus manifest, icons and an offline service worker. */
function writeSite(standalone) {
  const site = join(dist, "app");
  rmSync(site, { recursive: true, force: true });
  mkdirSync(join(site, "icons"), { recursive: true });
  const icons = existsSync(ICON_DIR) ? readdirSync(ICON_DIR).filter((f) => f.endsWith(".png")) : [];
  for (const f of icons) copyFileSync(join(ICON_DIR, f), join(site, "icons", f));

  const head = [
    '<link rel="manifest" href="manifest.webmanifest">',
    `<meta name="theme-color" content="${THEME.light}" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="${THEME.dark}" media="(prefers-color-scheme: dark)">`,
    '<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-title" content="Adwen Maths">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  ].join("\n");
  const html = standalone.replace(/(<meta name="viewport"[^>]*>)/, `$1\n${head}`);
  writeFileSync(join(site, "index.html"), html);

  const shots = [
    ["screen-home.png", "Topics and your learning path"],
    ["screen-path.png", "A video series planned from a short check"],
  ].filter(([f]) => icons.includes(f));
  const manifest = {
    name: "Adwen Maths",
    short_name: "Adwen Maths",
    description:
      "Adaptive BECE mathematics: a short check finds the real gap, then a series of explainer videos is written for you.",
    lang: "en-GB",
    start_url: "./",
    scope: "./",
    id: "./",
    display: "standalone",
    background_color: THEME.light,
    theme_color: THEME.brand,
    categories: ["education"],
    icons: [
      { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: shots.map(([f, label]) => ({
      src: `icons/${f}`,
      sizes: "780x1688",
      type: "image/png",
      form_factor: "narrow",
      label,
    })),
  };
  writeFileSync(join(site, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

  const shell = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    ...icons.filter((f) => !f.startsWith("screen-")).map((f) => `./icons/${f}`),
  ];
  const version = createHash("sha256")
    .update(html)
    .update(JSON.stringify(manifest))
    .digest("hex")
    .slice(0, 12);
  writeFileSync(join(site, "sw.js"), serviceWorker(version, shell));
  console.log(`built dist/app/ (installable, version ${version})`);
}

function serviceWorker(version, shell) {
  return `// Adwen Maths offline support. Generated by build.mjs; do not edit.
const VERSION = ${JSON.stringify(version)};
const SHELL = "adwen-shell-" + VERSION;
const RUNTIME = "adwen-runtime";
const SHELL_FILES = ${JSON.stringify(shell)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("adwen-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app page: network first so updates arrive, saved copy when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true })),
    );
    return;
  }

  // Icons and fonts: saved after first use, so they cost data only once.
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !fonts) return;
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") {
            const copy = res.clone();
            caches.open(RUNTIME).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}

const options = {
  entryPoints: [join(here, "src/main.ts")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  minify: !watch,
  write: false,
  logLevel: "warning",
  legalComments: "none",
};

mkdirSync(dist, { recursive: true });
if (watch) {
  const ctx = await esbuild.context({
    ...options,
    plugins: [
      {
        name: "page",
        setup(b) {
          b.onEnd((r) => r.outputFiles?.[0] && write(r.outputFiles[0].text));
        },
      },
    ],
  });
  await ctx.watch();
  console.log("watching src/ ...");
} else {
  const result = await esbuild.build(options);
  write(result.outputFiles[0].text);
}
