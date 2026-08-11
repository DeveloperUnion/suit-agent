import type { MockDatabase } from "@/lib/types";
import { createSeedDatabase, SEED_VERSION } from "@/lib/mock/seed";
import { bump } from "@/lib/store/revision";

/**
 * localStorage を裏に持つモックストア。
 *
 * DB を立てずに画面を検証するための一時的な実装であり、画面から直接触らせない。
 * 画面は lib/data/* の非同期 API のみを見る。将来 DB を入れるときは
 * lib/data/* の中身を差し替えれば済むようにしている。
 */

const STORAGE_KEY = `suit-agent:mock:v${SEED_VERSION}`;

let cache: MockDatabase | null = null;
let version = 0;
const listeners = new Set<() => void>();

function isBrowser() {
  return typeof window !== "undefined";
}

function read(): MockDatabase {
  if (cache) return cache;
  if (!isBrowser()) {
    cache = createSeedDatabase();
    return cache;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDatabase;
      if (parsed.version === SEED_VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // 壊れた JSON はシードで上書きする
  }
  cache = createSeedDatabase();
  write(cache);
  return cache;
}

function write(db: MockDatabase) {
  cache = db;
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // 容量超過時もメモリ上のキャッシュは維持する
    }
  }
}

function emit() {
  version += 1;
  for (const listener of listeners) listener();
  // DB へ移した領域と購読を共有する。画面は lib/store/revision の
  // 1 本だけを見ればよく、どちらのストアが動いたかを知らなくて済む。
  bump();
}

export function getDb(): MockDatabase {
  return read();
}

/** useSyncExternalStore 用。更新のたびに増える */
export function getVersion(): number {
  return version;
}

/** SSR 時のスナップショット。クライアント初回描画と必ず一致させる */
export function getServerVersion(): number {
  return 0;
}

/** 更新は必ずここを通す。書き込み後に購読者へ通知される */
export function mutateDb(updater: (db: MockDatabase) => MockDatabase): MockDatabase {
  const next = updater(read());
  write(next);
  emit();
  return next;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** シードの状態に戻す。壁打ち中に何度も使う */
export function resetDb(): MockDatabase {
  const fresh = createSeedDatabase();
  write(fresh);
  emit();
  return fresh;
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
