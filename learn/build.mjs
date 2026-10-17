// Bundles the app into one HTML file that works offline:
//   dist/index.html        page fragment (for hosts that add their own <html>/<head>, such as Claude Artifacts)
//   dist/adwen-maths.html  complete standalone document (open directly, or share the file)
//   dist/narration.json    every narration line, for pre-generating audio with AdwenTTS
import * as esbuild from "esbuild";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

async function narration() {
  const out = join(dist, ".narration.mjs");
  await esbuild.build({
    stdin: {
      contents: 'export { narrationLines } from "./src/content/lessons.ts";',
      resolveDir: here,
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: out,
    logLevel: "error",
  });
  const mod = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
  writeFileSync(join(dist, "narration.json"), JSON.stringify(mod.narrationLines(), null, 1));
}

function page(js) {
  const css = readFileSync(join(here, "src/styles.css"), "utf8").replace(
    "/*ACCENTS*/",
    accentCss(),
  );
  let tpl = readFileSync(join(here, "src/page.html"), "utf8");
  // Narration clips from AdwenTTS are optional; flag them only when they exist.
  if (existsSync(join(dist, "audio", "manifest.json")))
    tpl = tpl.replace("<title>", '<meta name="adwen-audio" content="1">\n<title>');
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
  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
  console.log(
    `built dist/index.html (${kb(fragment)}) and dist/adwen-maths.html (${kb(standalone)})`,
  );
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
await narration();
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
