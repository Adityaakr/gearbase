export type AgentRunnerConfig = {
  roomId: `0x${string}`;
};

export function startAgentRunner(_config: AgentRunnerConfig): never {
  throw new Error("agent runner is not implemented yet");
}
