"use client";

import { AgentFab } from "@/components/agent/agent-fab";
import { AgentPanel } from "@/components/agent/agent-panel";

/** 入口と本体。どちらも fixed なので、置く場所はレイアウトに影響しない */
export function AgentDock() {
  return (
    <>
      <AgentFab />
      <AgentPanel />
    </>
  );
}
