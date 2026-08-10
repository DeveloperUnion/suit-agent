"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 画面幅で DOM 構造そのものを切り替えたい場面で使う。
 * CSS だけで済むところには使わない（同じ入力欄を二重に描画したくない箇所に限る）。
 * SSR では常に false を返すため、マウント後に確定する。
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Tailwind の md 未満 = スマートフォン想定 */
export function useIsPhone(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/**
 * Tailwind の lg 以上。useIsPhone の裏返しではない（768〜1023px はどちらにも入らない）。
 * サイドナビが常時表示されるかどうかの境目なので、
 * 「本文の横に何かを並べられるか」を判断する場面はこちらを使う。
 */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
