"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getServerVersion, getVersion, resetDb, subscribe } from "@/lib/store/mock-db";

/**
 * lib/data/* の非同期 API を購読付きで呼ぶためのフック。
 *
 * localStorage はクライアント専用のため、サーバー描画と初回クライアント描画では
 * 必ず loading（スケルトン）を返す。SSR とクライアントの初期スナップショットを
 * 一致させようとするより、この方が確実で読みやすい。
 */
export function useMockQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | undefined; loading: boolean } {
  const version = useSyncExternalStore(subscribe, getVersion, getServerVersion);
  const [state, setState] = useState<{ data: T | undefined; loading: boolean }>({
    data: undefined,
    loading: true,
  });

  useEffect(() => {
    let alive = true;
    loader().then((data) => {
      if (alive) setState({ data, loading: false });
    });
    return () => {
      alive = false;
    };
    // loader は毎レンダー新しい関数になるため、明示した deps と version でのみ再実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return state;
}

export function useResetMockDb(): () => void {
  return useCallback(() => {
    resetDb();
  }, []);
}
