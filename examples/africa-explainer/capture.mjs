// Render scene.html frame by frame with Playwright (deterministic: we drive time ourselves)
// and pipe the frames straight into ffmpeg together with the mixed audio.
// usage: node capture.mjs <out.mp4> <audio.wav> <fps> [start_s] [end_s]
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(execSync("npm root -g").toString().trim() + "/playwright"));
}

const [outPath, audioPath, fpsArg, startArg, endArg] = process.argv.slice(2);
const fps = Number(fpsArg || 30);
const tl = JSON.parse(readFileSync(resolve("timeline.json"), "utf8"));
const start = Number(startArg ?? 0);
const end = Number(endArg ?? tl.total);
const nFrames = Math.round((end - start) * fps);

const ffArgs = [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
  ...(audioPath && audioPath !== "-" ? ["-ss", String(start), "-i", audioPath] : []),
  "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
  ...(audioPath && audioPath !== "-" ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
  "-movflags", "+faststart", outPath,
];
const ff = spawn("ffmpeg", ffArgs, { stdio: ["pipe", "inherit", "inherit"] });
const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once("drain", res)));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto("file://" + resolve("scene.html"));
await page.evaluate(() => window.__ready);
await page.waitForTimeout(300);

const t0 = Date.now();
for (let i = 0; i < nFrames; i++) {
  const t = start + i / fps;
  await page.evaluate((tt) => window.render(tt), t);
  await write(await page.screenshot({ type: "jpeg", quality: 93 }));
  if (i % 600 === 0) console.log(`frame ${i}/${nFrames} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
ff.stdin.end();
await new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error("ffmpeg exit " + code)))));
await browser.close();
console.log(`done: ${nFrames} frames -> ${outPath} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
