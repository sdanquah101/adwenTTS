/**
 * The claude.ai side of the app. On claude.ai the page can ask Claude to
 * write a video (`sample`), keep shared records (`db`), play files stored
 * with the page (`/_blob/<id>`) and message the Claude Code session that
 * records narration (`mcp`). Opened anywhere else, all of this is absent and
 * the app says so instead of pretending.
 */

export interface SampleOptions {
  onText?: (u: { text: string; delta: string }) => void;
  signal?: AbortSignal;
  modelTier?: "quick" | "default" | "complex";
  cache?: boolean | { gcTime: number };
}
export interface SampleFn {
  (input: string, opts?: SampleOptions): Promise<{ text: string; truncated: boolean }>;
  json<T = unknown>(input: string, opts?: SampleOptions): Promise<T>;
}
export interface SampleError {
  code: string;
  message?: string;
  text?: string;
}

export interface DocSnap {
  exists: boolean;
  version?: number;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<unknown>;
  update(data: Record<string, unknown>): Promise<unknown>;
  onSnapshot(next: (s: DocSnap) => void, error?: (e: { code: string }) => void): () => void;
}
export interface Db {
  doc(path: string): DocRef;
}
export interface Mcp {
  callTool(server: string, tool: string, input?: unknown): Promise<{ payload?: unknown }>;
}
export interface UserNs {
  id(): Promise<string>;
  isOwner(): boolean;
}

interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

const host = (): ClaudeHost | null => {
  const c = (window as unknown as { claude?: ClaudeHost }).claude;
  return c && typeof c.use === "function" ? c : null;
};

/** True when the page runs inside claude.ai (the capabilities may still be refused). */
export const onClaude = (): boolean => host() !== null;

const cache = new Map<string, Promise<unknown>>();
function use<T>(name: string): Promise<T | null> {
  const c = host();
  if (!c) return Promise.resolve(null);
  if (!cache.has(name))
    cache.set(
      name,
      c.use(name).catch(() => null),
    );
  return cache.get(name) as Promise<T | null>;
}

export const getSample = () => use<SampleFn>("sample");
export const getDb = () => use<Db>("db");
export const getMcp = () => use<Mcp>("mcp");
export const getUser = () => use<UserNs>("user");

export function errorCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String((e as SampleError).code) : "error";
}

// ---------------------------------------------------------------- the student's record

/** Each student's record lives in their own private folder of the page's database. */
async function stateDoc(): Promise<DocRef | null> {
  const [db, user] = await Promise.all([getDb(), getUser()]);
  if (!db || !user) return null;
  try {
    return db.doc(`data/users/${await user.id()}/record`);
  } catch {
    return null;
  }
}

export async function loadRemote(): Promise<unknown | null> {
  const ref = await stateDoc();
  if (!ref) return null;
  try {
    const snap = await ref.get();
    const json = snap.exists ? snap.data()?.json : undefined;
    return typeof json === "string" ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

let saveTimer: number | undefined;
let lastSaved = "";
/** Saves a copy of the record, at most every two seconds; localStorage stays the fast copy. */
export function saveRemote(data: unknown): void {
  if (!onClaude()) return;
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const json = JSON.stringify(data);
    if (json === lastSaved || json.length > 240_000) return;
    const ref = await stateDoc();
    if (!ref) return;
    try {
      await ref.set({ json, at: Date.now() });
      lastSaved = json;
    } catch {
      /* a refused or failed write leaves the local copy in charge */
    }
  }, 2000);
}
