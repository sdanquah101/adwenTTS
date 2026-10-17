/**
 * Install-to-home-screen support. Active only in the installable build
 * (the page links a web app manifest); the single-file and preview builds skip it.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** Chrome/Edge on Android or desktop: we can show the install dialog from a button. */
  canPrompt: boolean;
  /** iPhone/iPad Safari: installing needs Share, then Add to Home Screen. */
  ios: boolean;
  /** Already running as an installed app. */
  standalone: boolean;
  /** This build can be installed at all. */
  available: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

const hasManifest = () => !!document.querySelector('link[rel="manifest"]');

export function isStandalone(): boolean {
  return (
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function initPwa(): void {
  if (!hasManifest()) return;
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* offline support unavailable; the app still works online */
      });
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    persistStorage();
    notify();
  });
}

export function installState(): InstallState {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  const standalone = isStandalone();
  return {
    canPrompt: !!deferred && !standalone,
    ios: ios && !standalone,
    standalone,
    available: hasManifest(),
  };
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  await ev.prompt();
  const choice = await ev.userChoice;
  notify();
  return choice.outcome === "accepted";
}

export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ask the browser not to clear this app's saved progress when the phone is low on space. */
export function persistStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    /* not supported */
  }
}
