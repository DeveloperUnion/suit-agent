"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import type { IsoDate, ItemTypeId, OrderPurpose, Uuid } from "@/lib/types";
import type { OrderItemFabric } from "@/lib/data/orders";

/**
 * 会話から拾った注文の下書き。
 *
 * **金額は持たない。**税込の売上金額は紙にも会話にも無い唯一の必須項目で、
 * 人が画面で入れる（道具にも引数が無いので、構造的に載らない）。
 *
 * 受け渡しに URL を使わないのは、生地の組成のような会話由来の文字列が
 * 履歴に残るため。README の「markdown レンダラは入れない」（仕込んだ文字列で
 * 情報を外へ運ぶ経路を開かない）と同じ系列の判断。URL には「開く」という
 * 事実だけを `?order=new` で載せる。リロードしても、正しい顧客の空の
 * 登録画面には着地する。
 *
 * AgentProvider に相乗りさせないのは、あちらが「いま見ている対象」という
 * 別の関心事だから。
 */
export type OrderDraft = {
  /**
   * 消費の判定と useEffect の依存に使う。
   *
   * **中身が同じ下書きを 2 回渡されても取り違えない**ようにするためで、
   * これが無いと「同じ内容だから同じ下書き」と見なして 2 回目が開かない。
   */
  id: string;
  customerId: Uuid;
  orderedAt?: IsoDate;
  arrivedAt?: IsoDate;
  purpose?: OrderPurpose;
  items?: ItemTypeId[];
  fabric?: OrderItemFabric;
  /** 会話のどこから拾ったか。ダイアログの上に 1 行出す */
  quote?: string;
};

type Store = {
  setOrderDraft: (draft: OrderDraft) => void;
  /**
   * その顧客の下書きを取り出して**消す**。
   *
   * 消さないと、次にそのカルテを手で開いたときに前の下書きがまた出る。
   * 「会話で言ったことが、関係ない場面で勝手に入っている」は事故に見える。
   */
  consumeOrderDraft: (customerId: Uuid) => OrderDraft | null;
};

const Ctx = createContext<Store | null>(null);

export function OrderDraftProvider({ children }: { children: React.ReactNode }) {
  // ref に置く。**state にすると、下書きを積んだ瞬間にツリー全体が再描画される** —
  // 会話パネルは layout 直下にあるので、カルテの入力中でも起きる。
  const draft = useRef<OrderDraft | null>(null);
  const [, force] = useState(0);

  const setOrderDraft = useCallback((next: OrderDraft) => {
    draft.current = next;
    // 画面遷移は呼び側（カード）がやる。ここでは再描画のきっかけだけ作る
    force((n) => n + 1);
  }, []);

  const consumeOrderDraft = useCallback((customerId: Uuid) => {
    const current = draft.current;
    if (!current || current.customerId !== customerId) return null;
    draft.current = null;
    return current;
  }, []);

  return <Ctx.Provider value={{ setOrderDraft, consumeOrderDraft }}>{children}</Ctx.Provider>;
}

/**
 * Provider の外でも落ちないようにする。
 *
 * 会話パネルは layout 直下にあるが、テストや Storybook のように
 * Provider を挟まない木でカードだけを描くことがある。
 */
export function useOrderDraft(): Store {
  return (
    useContext(Ctx) ?? {
      setOrderDraft: () => {},
      consumeOrderDraft: () => null,
    }
  );
}
