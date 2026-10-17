import type { VoicePref } from "../state";

/**
 * Speaks narration. Order of preference:
 *   1. a pre-generated AdwenTTS clip (audio/<voice>/<register>/<id>.mp3, listed in audio/manifest.json)
 *   2. the device's own speech voice, preferring West African English when the phone has one
 *   3. silence, with captions timed to reading speed
 */
export interface SpeakRequest {
  id: string;
  text: string;
  rate: number;
  voice: VoicePref;
  register: "standard" | "simple";
}

export interface Speech {
  /** Seconds the animation should plan for. */
  duration: number;
  /** Resolves when the speech ends (or is stopped). */
  done: Promise<void>;
  stop(): void;
}

let manifest: Set<string> | null = null;
let manifestLoaded: Promise<void> | null = null;

function loadManifest(): Promise<void> {
  // Only look for clips when the build bundled them (it adds <meta name="adwen-audio">).
  if (!document.querySelector('meta[name="adwen-audio"]')) {
    manifest = new Set();
    return Promise.resolve();
  }
  if (!manifestLoaded) {
    manifestLoaded = fetch("audio/manifest.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((files: string[]) => {
        manifest = new Set(Array.isArray(files) ? files : []);
      })
      .catch(() => {
        manifest = new Set();
      });
  }
  return manifestLoaded;
}

/** Reading-speed estimate for a line of narration. */
export function estimateSeconds(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).length;
  return words / (2.55 * rate) + 0.4;
}

function pickVoice(pref: VoicePref): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!voices.length) return null;
  const rank = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase();
    let score = 0;
    if (lang.includes("gh")) score += 50;
    else if (lang.includes("ng") || lang.includes("ke") || lang.includes("za")) score += 30;
    else if (lang.includes("gb")) score += 10;
    const name = v.name.toLowerCase();
    const femaleHint =
      /female|woman|zira|samantha|susan|hazel|libby|sonia|abeo|ama|akua|ezinne|serena|karen|moira|tessa/.test(
        name,
      );
    const maleHint =
      /\bmale\b|david|george|daniel|ryan|thomas|alex|fred|kwame|guy/.test(name) &&
      !/female/.test(name);
    if (pref === "female" && femaleHint) score += 20;
    if (pref === "male" && maleHint) score += 20;
    if (v.localService) score += 2;
    return score;
  };
  return [...voices].sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

export function speak(req: SpeakRequest): Speech {
  const est = estimateSeconds(req.text, req.rate);
  const file = `${req.voice === "male" ? "male" : "female"}/${req.register}/${req.id}.mp3`;

  if (manifest?.has(file)) {
    const audio = new Audio(`audio/${file}`);
    audio.playbackRate = req.rate;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    audio.addEventListener("ended", () => resolve());
    audio.addEventListener("error", () => resolve());
    void audio.play().catch(() => resolve());
    const dur =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration / req.rate : est;
    return {
      duration: dur,
      done,
      stop() {
        audio.pause();
        resolve();
      },
    };
  }

  if (typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined") {
    const u = new SpeechSynthesisUtterance(req.text);
    const v = pickVoice(req.voice);
    if (v) u.voice = v;
    u.lang = v?.lang ?? "en-GB";
    u.rate = req.rate;
    u.pitch = req.voice === "female" ? 1.08 : req.voice === "male" ? 0.9 : 1;
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    // Some phones never fire "end": fall back to a generous timer.
    const timer = setTimeout(() => resolve(), est * 1600 + 1500);
    u.onend = () => {
      clearTimeout(timer);
      resolve();
    };
    u.onerror = () => {
      clearTimeout(timer);
      setTimeout(resolve, est * 1000);
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return {
      duration: est,
      done,
      stop() {
        clearTimeout(timer);
        speechSynthesis.cancel();
        resolve();
      },
    };
  }

  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const timer = setTimeout(() => resolve(), est * 1000);
  return {
    duration: est,
    done,
    stop() {
      clearTimeout(timer);
      resolve();
    },
  };
}

export function warmUp(): void {
  void loadManifest();
  if (typeof speechSynthesis !== "undefined") speechSynthesis.getVoices();
}

export function stopAll(): void {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
