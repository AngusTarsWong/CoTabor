import React, { useState } from "react";
import { Flex } from "antd";
import { SwarmHeader } from "./components/SwarmHeader";
import { InterventionBanner } from "./components/InterventionBanner";
import { AgentCardList } from "./components/AgentCardList";
import { SwarmThoughtChain } from "./components/SwarmThoughtChain";
import { SwarmLaunchPad } from "./components/SwarmLaunchPad";
import { useSwarmRuntime } from "./useSwarmRuntime";

export const SwarmApp: React.FC = () => {
  const { snapshot, workflowNodes } = useSwarmRuntime();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const agents = snapshot?.agents ?? [];
  const isSwarmActive = agents.length > 0;

  const handleLaunch = (goal: string) => {
    chrome.storage.local
      .set({ swarmLaunchRequest: { goal, executionMode: "isolated_tabs", timestamp: Date.now() } })
      .catch(() => {});
  };

  if (!isSwarmActive) {
    return <SwarmLaunchPad onLaunch={handleLaunch} />;
  }

  const taskName = workflowNodes[0]?.nodeName ?? "蜂群任务";
  const isRunning = agents.some(a => a.status === "running" || a.status === "starting");

  return (
    <Flex
      vertical
      style={{ height: "100vh", background: "#f8fbff", overflow: "hidden" }}
    >
      <SwarmHeader
        taskName={taskName}
        agents={agents}
        isRunning={isRunning}
      />

      <InterventionBanner agents={agents} />

      <Flex flex={1} style={{ overflow: "hidden" }}>
        {/* Left: Agent card list (62%) */}
        <div
          style={{
            width: "62%",
            height: "100%",
            overflowY: "auto",
            padding: "16px 16px 16px 20px",
            borderRight: "1px solid #f0f0f0",
          }}
        >
          <AgentCardList
            agents={agents}
            selectedNodeId={selectedNodeId}
            onSelectAgent={setSelectedNodeId}
          />
        </div>

        {/* Right: ThoughtChain (38%) */}
        <div
          style={{
            width: "38%",
            height: "100%",
            overflowY: "auto",
            padding: "16px 20px 16px 16px",
            background: "#fff",
          }}
        >
          <SwarmThoughtChain
            agents={agents}
            workflowNodes={workflowNodes}
            selectedNodeId={selectedNodeId}
            onSelectAgent={setSelectedNodeId}
          />
        </div>
      </Flex>
    </Flex>
  );
};
