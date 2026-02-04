export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolExecutionContext = {
  sessionId: string;
  projectRoot: string;
  toolCall: ToolCall;
};

export type ToolExecutionResult = {
  ok: boolean;
  name: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<ToolExecutionResult>;

export type ToolCallExecution = {
  toolCallId: string;
  content: string;
};

export class ToolExecutor {
  private readonly projectRoot: string;
  private readonly toolHandlers = new Map<string, ToolHandler>();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.registerToolHandlers();
  }

  async executeToolCalls(sessionId: string, toolCalls: unknown[]): Promise<ToolCallExecution[]> {
    const parsedCalls = toolCalls
      .map((toolCall) => this.parseToolCall(toolCall))
      .filter((toolCall): toolCall is ToolCall => Boolean(toolCall));

    const executions: ToolCallExecution[] = [];
    for (const toolCall of parsedCalls) {
      const result = await this.executeToolCall(sessionId, toolCall);
      executions.push({
        toolCallId: toolCall.id,
        content: this.formatToolResult(result)
      });
    }
    return executions;
  }

  private registerToolHandlers(): void {
    this.toolHandlers.set("bash", this.handleBashTool.bind(this));
    this.toolHandlers.set("read", this.handleReadTool.bind(this));
    this.toolHandlers.set("write", this.handleWriteTool.bind(this));
    this.toolHandlers.set("edit", this.handleEditTool.bind(this));
  }

  private parseToolCall(toolCall: unknown): ToolCall | null {
    if (!toolCall || typeof toolCall !== "object") {
      return null;
    }

    const record = toolCall as {
      id?: unknown;
      type?: unknown;
      function?: { name?: unknown; arguments?: unknown };
    };

    if (typeof record.id !== "string") {
      return null;
    }

    const functionRecord = record.function;
    if (!functionRecord || typeof functionRecord !== "object") {
      return null;
    }

    if (typeof functionRecord.name !== "string") {
      return null;
    }

    const rawArguments =
      typeof functionRecord.arguments === "string" ? functionRecord.arguments : "";

    return {
      id: record.id,
      type: "function",
      function: {
        name: functionRecord.name,
        arguments: rawArguments
      }
    };
  }

  private async executeToolCall(sessionId: string, toolCall: ToolCall): Promise<ToolExecutionResult> {
    const toolName = toolCall.function.name;
    const handler = this.toolHandlers.get(toolName);
    if (!handler) {
      return {
        ok: false,
        name: toolName,
        error: `Unknown tool: ${toolName}`
      };
    }

    const parsedArgs = this.parseToolArguments(toolCall.function.arguments);
    if (!parsedArgs.ok) {
      return {
        ok: false,
        name: toolName,
        error: parsedArgs.error
      };
    }

    try {
      return await handler(parsedArgs.args, {
        sessionId,
        projectRoot: this.projectRoot,
        toolCall
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        name: toolName,
        error: message
      };
    }
  }

  private parseToolArguments(
    rawArguments: string
  ): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
    if (!rawArguments) {
      return { ok: true, args: {} };
    }

    try {
      const parsed = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { ok: false, error: "Tool arguments must be a JSON object." };
      }
      return { ok: true, args: parsed as Record<string, unknown> };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Failed to parse tool arguments: ${message}` };
    }
  }

  private formatToolResult(result: ToolExecutionResult): string {
    const payload: Record<string, unknown> = {
      ok: result.ok,
      name: result.name
    };

    if (typeof result.output !== "undefined") {
      payload.output = result.output;
    }

    if (result.error) {
      payload.error = result.error;
    }

    if (result.metadata && Object.keys(result.metadata).length > 0) {
      payload.metadata = result.metadata;
    }

    return JSON.stringify(payload);
  }

  private async handleBashTool(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    return {
      ok: false,
      name: "bash",
      error: "Tool not implemented yet."
    };
  }

  private async handleReadTool(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    return {
      ok: false,
      name: "read",
      error: "Tool not implemented yet."
    };
  }

  private async handleWriteTool(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    return {
      ok: false,
      name: "write",
      error: "Tool not implemented yet."
    };
  }

  private async handleEditTool(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    return {
      ok: false,
      name: "edit",
      error: "Tool not implemented yet."
    };
  }
}
