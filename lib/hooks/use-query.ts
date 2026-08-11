"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getRevision, getServerRevision, subscribeRevision } from "@/lib/store/revision";

/**
 * lib/data/* の非同期 API を購読付きで呼ぶためのフック。
 *
 * 購読先は lib/store/revision の 1 本だけ。localStorage を見ている領域も
 * Supabase へ移した領域も、書き込み後に等しく bump() するので、
 * 画面はどちらのストアが動いたかを知らなくて済む。
 *
 * サーバー描画と初回クライアント描画では必ず loading（スケルトン）を返す。
 * SSR とクライアントの初期スナップショットを一致させようとするより、
 * この方が確実で読みやすい。
 */
export function useQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): { data: T | undefined; loading: boolean } {
  const version = useSyncExternalStore(subscribeRevision, getRevision, getServerRevision);
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
