"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";

/** 下端からこの距離以内にいれば「最新を追っている」とみなす */
const NEAR_BOTTOM_PX = 64;

/**
 * チャットログの最下部追従。
 *
 * 常に最下部へ飛ばすと、過去のやり取りを読み返している最中に引きずり戻されて
 * 読めなくなる。底の近くに居るときだけ追い、離れたら追うのをやめて
 * 「新着」の合図だけ出す。
 *
 * Radix の ScrollArea ではなく素の overflow-y-auto に付ける前提。
 * ScrollArea は実際にスクロールする Viewport 要素への ref を外に出しておらず、
 * ここで欲しい scrollHeight / scrollTop に素直に触れないため。
 */
export function useStickToBottom(deps: readonly unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const stickingRef = useRef(true);
  const firstRunRef = useRef(true);
  /** 追従を切っている間に増えた分。「新着 ↓」を出すために表示へ反映する */
  const [hasNew, setHasNew] = useState(false);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickingRef.current = atBottom;
    if (atBottom) setHasNew(false);
  }, []);

  const scrollToBottom = useCallback(
    (instant = false) => {
      const el = ref.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: instant || reduceMotion ? "auto" : "smooth" });
      stickingRef.current = true;
      setHasNew(false);
    },
    [reduceMotion],
  );

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (!stickingRef.current) {
      setHasNew(true);
      return;
    }
    // 開いた直後だけは滑らせない。既読の会話が流れていくように見えるため
    const instant = firstRunRef.current;
    firstRunRef.current = false;
    scrollToBottom(instant);
    // 呼び出し側が渡した依存（件数・キーボードの高さなど）でのみ走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, onScroll, hasNew, scrollToBottom };
}
