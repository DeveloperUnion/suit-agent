"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/** いま見ている対象。増えるなら kind を足す */
export type AgentContextRef = {
  kind: "customer";
  id: string;
  /** チップに出す表示名 */
  label: string;
};

type AgentStore = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** 画面が宣言した文脈。人が × で外したあとは null になる */
  contextRef: AgentContextRef | null;
  /** 画面側から登録する。人が外した文脈を上書きし直さないよう register 経由でだけ触る */
  registerContext: (ref: AgentContextRef | null) => void;
  dismissContext: () => void;
};

const AgentStoreContext = createContext<AgentStore | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [contextRef, setContextRef] = useState<AgentContextRef | null>(null);
  /** × で外した文脈の id。同じ画面に居る間は復活させない */
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  const registerContext = useCallback((ref: AgentContextRef | null) => {
    setContextRef(ref);
    // 別の顧客へ移ったら、外した記憶は捨てる
    setDismissedId((prev) => (prev && ref?.id === prev ? prev : null));
  }, []);

  const dismissContext = useCallback(() => {
    setContextRef((prev) => {
      if (prev) setDismissedId(prev.id);
      return null;
    });
  }, []);

  const value = useMemo<AgentStore>(
    () => ({
      open,
      setOpen,
      contextRef: contextRef && contextRef.id === dismissedId ? null : contextRef,
      registerContext,
      dismissContext,
    }),
    [open, contextRef, dismissedId, registerContext, dismissContext],
  );

  return <AgentStoreContext.Provider value={value}>{children}</AgentStoreContext.Provider>;
}

export function useAgent(): AgentStore {
  const store = useContext(AgentStoreContext);
  if (!store) throw new Error("useAgent は AgentProvider の内側でだけ使えます");
  return store;
}

/**
 * この画面が「いまの文脈」であることを宣言する。
 *
 * パネルは layout 直下に 1 つあるだけで、画面からは props が届かない。
 * かといって usePathname を正規表現で解析すると、ルートが増えるたびに壊れるうえ
 * 表示名（顧客名）が取れない。画面側から名乗ってもらう形にする。
 * アンマウントで自動的に外れる。
 */
export function useAgentContext(ref: AgentContextRef | null): void {
  const { registerContext } = useAgent();
  const kind = ref?.kind;
  const id = ref?.id;
  const label = ref?.label;

  useEffect(() => {
    registerContext(kind && id && label ? { kind, id, label } : null);
    return () => registerContext(null);
  }, [kind, id, label, registerContext]);
}
