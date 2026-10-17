// Renders the app icons and install-dialog screenshots into src/icons/.
// Dev-time only (needs Playwright); the PNGs are committed so the build needs no image tools.
//   node scripts/make-icons.mjs            icons
//   node scripts/make-icons.mjs --shots    also screenshots (run `pnpm build` first)
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(execSync("npm root -g").toString().trim() + "/playwright"));
}
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "src", "icons");

const PURPLE = "#6b3fd4";
function svg(size, { maskable }) {
  const r = maskable ? 0 : size * 0.22;
  const grid = [];
  const step = size / 8;
  for (let i = 1; i < 8; i++) {
    grid.push(
      `<line x1="${i * step}" y1="0" x2="${i * step}" y2="${size}"/><line x1="0" y1="${i * step}" x2="${size}" y2="${i * step}"/>`,
    );
  }
  const font = size * (maskable ? 0.5 : 0.66);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><clipPath id="c"><rect width="${size}" height="${size}" rx="${r}"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect width="${size}" height="${size}" fill="${PURPLE}"/>
    <g stroke="#ffffff" stroke-opacity="0.13" stroke-width="${Math.max(1, size / 256)}">${grid.join("")}</g>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff"
      font-family="'STIX Two Text', 'Cambria Math', serif" font-style="italic" font-weight="500" font-size="${font}">x</text>
  </g>
</svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: true },
];

const browser = await chromium.launch();
for (const ic of ICONS) {
  const page = await browser.newPage({ viewport: { width: ic.size, height: ic.size } });
  await page.setContent(
    `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@1,500&display=block"><style>html,body{margin:0;background:transparent}</style></head><body>${svg(ic.size, ic)}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(out, ic.file),
    omitBackground: !ic.maskable,
    clip: { x: 0, y: 0, width: ic.size, height: ic.size },
  });
  await page.close();
  console.log(`wrote src/icons/${ic.file}`);
}

if (process.argv.includes("--shots")) {
  const file = "file://" + join(here, "..", "dist", "adwen-maths.html");
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
  });
  const page = await ctx.newPage();
  await page.goto(file);
  await page.getByRole("button", { name: "Explore a sample student" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, "screen-home.png") });
  await page.getByRole("button", { name: "See your path" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, "screen-path.png") });
  console.log("wrote src/icons/screen-home.png and screen-path.png (780x1688)");
}
await browser.close();
