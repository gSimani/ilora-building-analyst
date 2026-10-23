/**
 * Wire format between the analyst page (the MCP client) and the brain.
 * The Nemotron brain converts it to chat messages; the offline planner reads it directly.
 */
export type TextBlock = { text: string };
export type ToolUseBlock = { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } };
export type ToolResultBlock = {
  toolResult: { toolUseId: string; status?: "success" | "error"; content: ({ json: unknown } | { text: string })[] };
};
export type Block = TextBlock | ToolUseBlock | ToolResultBlock;
export type Message = { role: "user" | "assistant"; content: Block[] };

/** A tool as returned by MCP tools/list. */
export type McpTool = { name: string; description?: string; inputSchema: Record<string, unknown> };

/** "ask" answers one question; "review" runs the multi-step portfolio review on the larger model. */
export type BrainRequest = { messages: Message[]; tools: McpTool[]; mode?: "ask" | "review" };
export type BrainReply =
  | { stop: "tool_use"; message: Message; toolUse: ToolUseBlock["toolUse"]; brain: string; ms: number }
  | { stop: "end_turn"; message: Message; text: string; brain: string; ms: number };

export interface Brain {
  name: string;
  next(req: BrainRequest): Promise<Omit<BrainReply, "brain" | "ms">>;
}
