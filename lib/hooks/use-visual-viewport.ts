"use client";

import { useEffect, useState } from "react";

export type ViewportRect = {
  /** ソフトキーボードを除いた、いま実際に見えている高さ */
  height: number;
  /**
   * レイアウトビューポートから見た、見えている領域の上端。
   *
   * **position: fixed の基準はレイアウトビューポートなので、この値をそのまま当てる。**
   * ここに window.scrollY を足していたことがあり、背後のページを 400px スクロールした
   * 状態でパネルを開くと、パネルが 400px 下から始まって下端（入力欄）が画面外へ出た。
   * スマホの Chrome は一覧を下まで見てから話しかけるので、まともに踏む。
   */
  offsetTop: number;
};

/**
 * いま見えている領域（visual viewport）の実測値。
 *
 * ソフトキーボードは dvh を動かさない。Android Chrome は viewport の
 * interactive-widget=resizes-content（app/layout.tsx）で縮んでくれるが、
 * iOS Safari はこれを実装しておらず、キーボードは visual viewport だけを縮め、
 * さらに入力欄へのフォーカスで見えている領域をずらす。
 * 全画面の fixed パネルはこれで画面外へずれるため、実測を当てて貼り直す。
 *
 * window.scrollTo(0, 0) で押し戻す手もあるが、背後のページのスクロール位置を
 * 壊すので採らない。こちらは document のスクロールに一切触らない。
 *
 * **ここが返すのは visual viewport の値だけで、document のスクロール量は混ぜない。**
 * 混ぜると、キーボードが出ていない場面（＝ほとんどの場面）でパネルがずれる。
 *
 * resizes-content が効いている環境では offsetTop は 0、height はほぼ画面高に
 * なるため、当てても無害。
 */
export function useVisualViewport(enabled: boolean): ViewportRect | null {
  const [rect, setRect] = useState<ViewportRect | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const update = () => {
      // resize と scroll は指の動きに合わせて連射されるので 1 フレームに畳む
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setRect({ height: vv.height, offsetTop: vv.offsetTop });
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);

  // 閉じている間は前回の実測を返さない。開き直した最初の 1 フレームは h-dvh が受ける
  return enabled ? rect : null;
}
