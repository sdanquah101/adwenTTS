import { describe, expect, it } from "vitest";
import { studentBrief } from "../src/gen/brief";
import { requestId } from "../src/gen/narration";
import {
  extendPrompt,
  fallbackOutline,
  outlinePrompt,
  repairOutline,
  videoPrompt,
} from "../src/gen/prompts";
import {
  cleanMath,
  estimateVideoSeconds,
  linesOf,
  parseVideo,
  repairScene,
  ScriptBuilder,
  type ScriptEvent,
} from "../src/gen/script";
import { emptyData, revive, type Data, type Series } from "../src/state";
import { sampleStudent } from "../src/ui/sample";

const L = (o: object) => JSON.stringify(o);

const SCRIPT = [
  L({ k: "video", title: "Balancing equations", goal: "Solve 3x + 5 = 20" }),
  L({
    k: "chapter",
    title: "The market scale",
    addresses: ["eq-order-of-undoing", "not-a-real-id"],
  }),
  L({
    k: "scene",
    type: "title",
    kicker: "Equations",
    title: "Keep it level",
    say: "Welcome, Abena.",
  }),
  L({
    k: "scene",
    type: "story",
    icon: "market",
    title: "Auntie's scale",
    lines: ["A bag of rice balances weights."],
    say: "At the market, a scale stays level when both sides weigh the same.",
  }),
  L({
    k: "scene",
    type: "balance",
    math: "3x + 5 = 20",
    left: { x: 3, units: 5 },
    right: { units: 20 },
    actions: [
      { type: "removeUnits", n: 5, label: "Take 5 off both sides" },
      { type: "share", groups: 3, label: "Share into 3" },
    ],
    result: "x = 5",
    say: "Take five off both sides, then share into three groups.",
  }),
  // Not drawable (unbalanced): kept as a quote card so the narration survives.
  L({
    k: "scene",
    type: "balance",
    math: "2x = 7",
    left: { x: 2 },
    right: { units: 7 },
    actions: [{ type: "share", groups: 2, label: "Share" }],
    result: "x = 3.5",
    say: "Seven does not share into two whole blocks. That is fine for now.",
  }),
  L({ k: "chapter", title: "Your turn", addresses: [] }),
  L({
    k: "scene",
    type: "think",
    question: "Solve 2x + 1 = 9",
    answer: "x = 4",
    say: "Pause and try this one.",
    reveal: "Take one off both sides, then halve: x is four.",
  }),
  "this line is not JSON",
  L({ k: "end" }),
].join("\n");

describe("script parsing", () => {
  it("builds chapters and scenes, keeps valid misconception ids and repairs bad scenes", () => {
    const v = parseVideo(SCRIPT);
    expect(v.title).toBe("Balancing equations");
    expect(v.chapters.map((c) => c.title)).toEqual(["The market scale", "Your turn"]);
    expect(v.chapters[0]!.addresses).toEqual(["eq-order-of-undoing"]);
    expect(v.chapters[0]!.scenes.map((s) => s.type)).toEqual([
      "title",
      "story",
      "balance",
      "quote",
    ]);
    expect(v.chapters[1]!.scenes[0]!.type).toBe("think");
  });

  it("gives every spoken line an id, with a separate reveal line for think scenes", () => {
    const v = parseVideo(SCRIPT);
    expect(linesOf(v.chapters[1]!, 1).map((l) => l.id)).toEqual(["c1s0", "c1s0r"]);
    expect(linesOf(v.chapters[0]!, 0)).toHaveLength(4);
  });

  it("parses the same video however the stream is split, announcing finished chapters", () => {
    const events: ScriptEvent[] = [];
    const b = new ScriptBuilder((e) => events.push(e));
    for (let i = 0; i < SCRIPT.length; i += 7) b.push(SCRIPT.slice(i, i + 7));
    const v = b.finish();
    expect(v).toEqual(parseVideo(SCRIPT));
    const done = events
      .filter((e) => e.k === "chapterDone")
      .map((e) => (e as { index: number }).index);
    expect(done).toEqual([0, 1]);
    expect(events.at(-1)?.k).toBe("end");
  });

  it("drops a chapter heading with no scenes without shifting indexes", () => {
    const v = parseVideo(
      [
        L({ k: "chapter", title: "Empty" }),
        L({ k: "chapter", title: "Real" }),
        L({ k: "scene", type: "quote", text: "Hi", say: "Hello." }),
        L({ k: "chapter", title: "Trailing" }),
      ].join("\n"),
    );
    expect(v.chapters.map((c) => c.title)).toEqual(["Real"]);
  });

  it("extends a video after its existing chapters", () => {
    const base = parseVideo(SCRIPT);
    const events: ScriptEvent[] = [];
    const b = new ScriptBuilder((e) => events.push(e), base);
    b.push(
      [
        L({ k: "chapter", title: "More practice" }),
        L({ k: "scene", type: "quote", text: "Keep it level", say: "Always keep it level." }),
        L({ k: "end" }),
      ].join("\n"),
    );
    const v = b.finish();
    expect(v.chapters.map((c) => c.title)).toEqual([
      "The market scale",
      "Your turn",
      "More practice",
    ]);
    expect(
      events.filter((e) => e.k === "chapterDone").map((e) => (e as { index: number }).index),
    ).toEqual([2]);
    expect(base.chapters).toHaveLength(2);
  });

  it("rejects number lines that cannot show their hop and tidies maths", () => {
    expect(
      repairScene({ type: "numberline", math: "1 + 40", start: 1, by: 40, say: "Hop." })!.type,
    ).toBe("quote");
    const ok = repairScene({
      type: "numberline",
      math: "-3 + 5",
      start: -3,
      by: 5,
      min: -50,
      max: 50,
      say: "Hop.",
    });
    expect(ok).toMatchObject({ type: "numberline", min: -4, max: 3, math: "−3 + 5" });
    expect(cleanMath("5 - 2*x")).toBe("5 − 2×x");
    expect(repairScene({ type: "steps", lines: ["x = 1"] })).toBeNull();
  });

  it("estimates length from the narration", () => {
    const words = Array.from({ length: 145 }, () => "word").join(" ");
    const v = parseVideo(
      [
        L({ k: "chapter", title: "A" }),
        L({ k: "scene", type: "quote", text: "x", say: words }),
      ].join("\n"),
    );
    expect(estimateVideoSeconds(v)).toBe(61);
  });
});

function student(): Data {
  const d = sampleStudent();
  d.profile = { ...d.profile!, sample: undefined, simpler: true, interests: ["Football"] };
  return d;
}

describe("tailoring", () => {
  it("tells Claude the student's level, interests, reading support, gaps and real wrong answers", () => {
    const d = student();
    d.attempts.push({
      t: Date.now(),
      skill: "eq-both-sides",
      item: "x",
      correct: false,
      misconception: "eq-move-no-sign-change",
      ms: 30000,
      ctx: "diagnostic",
      question: "Solve 5x + 2 = 3x + 10",
      answer: "x = 6",
    });
    const brief = studentBrief(d, "eq-both-sides");
    expect(brief).toContain("Abena, JHS 3");
    expect(brief).toContain("Interests: Football");
    expect(brief).toContain("Reading support: on");
    expect(brief).toContain('to "Solve 5x + 2 = 3x + 10" they chose "x = 6"');
    expect(brief).toContain("[eq-move-no-sign-change]");
    expect(brief).toContain("Foundations to rebuild first");
  });

  it("asks for long, chaptered, spoken-style videos in the scene format", () => {
    const d = student();
    const series: Series = {
      id: "s1",
      target: "eq-both-sides",
      createdAt: 0,
      intro: "",
      videos: fallbackOutline(["like-terms"], "eq-both-sides").videos,
    };
    const p = videoPrompt(d, series, 1);
    expect(p).toContain("600 to 800 words");
    expect(p).toContain("think scenes");
    expect(p).toContain("Write every number and symbol as words");
    expect(p).toContain('"k":"chapter"');
    expect(p).toContain("Already watched:");
    expect(p).toContain("- eq-move-no-sign-change:");
    expect(outlinePrompt(d, "eq-both-sides")).toContain("3 to 5 videos");
    expect(extendPrompt(d, series, 1, parseVideo(SCRIPT))).toContain("too short");
  });

  it("keeps a sensible series when Claude's plan is unusable", () => {
    const d = student();
    const bad = repairOutline(
      { videos: [{ title: "Only one", focus: ["nope"] }] },
      d,
      "eq-both-sides",
    );
    expect(bad.videos.length).toBeGreaterThanOrEqual(2);
    expect(bad.videos.at(-1)!.focus).toEqual(["eq-both-sides"]);
    const good = repairOutline(
      {
        intro: "Hi",
        videos: [
          { title: "A", focus: ["like-terms"], goal: "g", why: "w" },
          { title: "B", focus: ["eq-both-sides", "bogus"], goal: "g", why: "w" },
        ],
      },
      d,
      "eq-both-sides",
    );
    expect(good.videos.map((v) => v.focus)).toEqual([["like-terms"], ["eq-both-sides"]]);
  });
});

describe("saved data", () => {
  it("upgrades a first-version record, dropping the old lesson plan", () => {
    const old = {
      ...emptyData(),
      version: 1,
      plan: { steps: [] },
      style: "balance",
      profile: { name: "Kofi" },
    };
    const d = revive(old);
    expect(d.version).toBe(2);
    expect(d.series).toBeNull();
    expect(d.profile?.interests).toEqual([]);
    expect("plan" in d).toBe(false);
    expect(revive({ version: 9 })).toEqual(emptyData());
  });
});

describe("narration requests", () => {
  it("are named by voice and text", () => {
    const a = requestId("TTS", [{ id: "c0s0", text: "Hello" }]);
    expect(a).toBe(requestId("TTS", [{ id: "c0s0", text: "Hello" }]));
    expect(a).not.toBe(requestId("TTS", [{ id: "c0s0", text: "Hello!" }]));
    expect(a).not.toBe(requestId("Other", [{ id: "c0s0", text: "Hello" }]));
    expect(a).toMatch(/^n[0-9a-z]+$/);
  });
});
