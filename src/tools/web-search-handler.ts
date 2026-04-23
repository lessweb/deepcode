import { randomUUID } from "crypto";
import { spawn } from "child_process";
import type OpenAI from "openai";
import type { CreateOpenAIClient, ToolExecutionContext, ToolExecutionResult } from "./executor";

const MAX_OUTPUT_CHARS = 30000;
const MAX_CAPTURE_CHARS = 10 * 1024 * 1024;
const WEB_SEARCH_TOOL_ACTIVITY_PREFIX = "WebSearch:";

type SearchLanguage = "en" | "zh";

type SearchDecision = {
  dominantLanguage: SearchLanguage;
  reason: string;
};

type SearchPreparation = {
  resolvedQuery: string;
  decision: SearchDecision;
  translated: boolean;
};

type LLMClientContext = {
  client: OpenAI;
  model: string;
  thinkingEnabled: boolean;
  notify?: string;
  webSearchTool?: string;
};

export async function handleWebSearchTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const query = typeof args.query === "string" ? args.query : "";
  if (!query.trim()) {
    return {
      ok: false,
      name: "WebSearch",
      error: "Missing required \"query\" string."
    };
  }

  const llmContext = context.createOpenAIClient?.();
  const scriptPath = llmContext?.webSearchTool?.trim();
  if (scriptPath) {
    return executeConfiguredWebSearch(query, scriptPath, context);
  }

  if (!hasUsableClient(llmContext)) {
    return {
      ok: false,
      name: "WebSearch",
      error:
        "WebSearch default mode requires a valid LLM configuration in ~/.deepcode/settings.json."
    };
  }

  return executeDefaultWebSearch(query, llmContext, context);
}

function hasUsableClient(value: ReturnType<CreateOpenAIClient> | undefined): value is LLMClientContext {
  return Boolean(value?.client);
}

async function executeConfiguredWebSearch(
  query: string,
  scriptPath: string,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const execution = await runWebSearchScript(scriptPath, query, context);
  const output = execution.stdout.slice(0, MAX_OUTPUT_CHARS);
  const truncated = execution.stdout.length > MAX_OUTPUT_CHARS;

  if (execution.error) {
    return {
      ok: false,
      name: "WebSearch",
      error: execution.error,
      output: output || undefined,
      metadata: {
        exitCode: execution.exitCode,
        signal: execution.signal,
        stderr: execution.stderr || undefined,
        truncated
      }
    };
  }

  if (execution.exitCode !== 0 || execution.signal !== null) {
    return {
      ok: false,
      name: "WebSearch",
      error: buildCommandError(execution.exitCode, execution.signal),
      output: output || undefined,
      metadata: {
        exitCode: execution.exitCode,
        signal: execution.signal,
        stderr: execution.stderr || undefined,
        truncated
      }
    };
  }

  return {
    ok: true,
    name: "WebSearch",
    output: output || undefined,
    metadata: {
      exitCode: execution.exitCode,
      signal: execution.signal,
      truncated,
      stderr: execution.stderr || undefined
    }
  };
}

async function executeDefaultWebSearch(
  query: string,
  llmContext: LLMClientContext,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  try {
    const prepared = await prepareSearchQuery(query, llmContext);
    const prompt = buildSearchPrompt(prepared.resolvedQuery);
    const output = await runLLMWebSearch(prompt, prepared.resolvedQuery, llmContext, context);

    return {
      ok: true,
      name: "WebSearch",
      output,
      metadata: {
        originalQuery: query,
        resolvedQuery: prepared.resolvedQuery,
        translated: prepared.translated,
        dominantLanguage: prepared.decision.dominantLanguage,
        languageReason: prepared.decision.reason
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "WebSearch",
      error: `WebSearch default mode failed: ${message}`
    };
  }
}

async function runWebSearchScript(
  scriptPath: string,
  query: string,
  context: ToolExecutionContext
): Promise<{ stdout: string; stderr: string; exitCode: number | null; signal: string | null; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(scriptPath, [query], {
      cwd: context.projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const pid = child.pid;
    if (typeof pid === "number") {
      context.onProcessStart?.(pid, formatWebSearchActivityLabel(query));
    }

    let stdout = "";
    let stderr = "";
    let error: string | undefined;

    child.stdout?.on("data", (chunk: string | Buffer) => {
      stdout = appendChunk(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: string | Buffer) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on("error", (spawnError) => {
      error = spawnError.message;
    });

    child.on("close", (code, signal) => {
      if (typeof pid === "number") {
        context.onProcessExit?.(pid);
      }
      resolve({
        stdout,
        stderr,
        exitCode: typeof code === "number" ? code : null,
        signal: signal ?? null,
        error
      });
    });
  });
}

async function prepareSearchQuery(query: string, llmContext: LLMClientContext): Promise<SearchPreparation> {
  const decision = await decideSearchLanguage(query, llmContext);
  const containsChinese = containsChineseChar(query);

  if (decision.dominantLanguage === "en" && containsChinese) {
    const translatedQuery = await translateQuery(query, "English", llmContext);
    if (translatedQuery) {
      return {
        resolvedQuery: translatedQuery,
        decision,
        translated: true
      };
    }
  }

  if (decision.dominantLanguage === "zh" && !containsChinese) {
    const translatedQuery = await translateQuery(query, "Chinese", llmContext);
    if (translatedQuery) {
      return {
        resolvedQuery: translatedQuery,
        decision,
        translated: true
      };
    }
  }

  return {
    resolvedQuery: query,
    decision,
    translated: false
  };
}

function containsChineseChar(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

async function decideSearchLanguage(
  query: string,
  llmContext: LLMClientContext
): Promise<SearchDecision> {
  const prompt = `Decide whether the topic below has more useful online material in English or Chinese.

Topic:
\`\`\`text
${query}
\`\`\`

Return strict JSON:
{"dominant_language":"en"|"zh","reason":"one short sentence"}
Do not include markdown or any extra text.`;

  const result = parseJsonResponse(await chat(llmContext, prompt));
  const dominantLanguage = result.dominant_language;

  if (dominantLanguage !== "en" && dominantLanguage !== "zh") {
    throw new Error(`Unexpected dominant language: ${String(dominantLanguage)}`);
  }

  return {
    dominantLanguage,
    reason: typeof result.reason === "string" ? result.reason : ""
  };
}

async function translateQuery(
  query: string,
  targetLanguage: "English" | "Chinese",
  llmContext: LLMClientContext
): Promise<string> {
  const prompt = `Translate the query text below into ${targetLanguage}.

Requirements:
- Preserve product names, library names, API names, versions, and abbreviations when appropriate.
- Return only the translated query, without quotes or explanation.

Query:
\`\`\`text
${query}
\`\`\``;

  return stripCodeFence(await chat(llmContext, prompt)).trim().replace(/^['"]|['"]$/g, "");
}

async function chat(llmContext: LLMClientContext, prompt: string): Promise<string> {
  const response = await llmContext.client.chat.completions.create({
    model: llmContext.model,
    messages: [{ role: "user", content: prompt }]
  });

  const content = response.choices?.[0]?.message?.content as unknown;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return (content as Array<{ text?: string }>)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function parseJsonResponse(text: string): Record<string, unknown> {
  const cleaned = stripCodeFence(text).trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error(`Failed to parse JSON response: ${cleaned || "<empty>"}`);
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:[\w-]+)?\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function buildSearchPrompt(query: string): string {
  return `Use web search to answer the user's query with up-to-date information.

<query>
${query}
</query>

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is mandatory. Never skip including sources in your response.`;
}

async function runLLMWebSearch(
  prompt: string,
  query: string,
  llmContext: LLMClientContext,
  context: ToolExecutionContext
): Promise<string> {
  const activityId = `web-search-${randomUUID()}`;
  context.onProcessStart?.(activityId, formatWebSearchActivityLabel(query));
  try {
    let primaryError: Error | null = null;
    try {
      const response = await llmContext.client.responses.create({
        model: llmContext.model,
        input: prompt,
        tools: [{ type: "web_search_preview", search_context_size: "medium" }]
      });
      const text = getOpenAIResponseText(response);
      if (text) {
        return text;
      }
      primaryError = new Error("The responses API returned an empty web search response.");
    } catch (error) {
      primaryError = error instanceof Error ? error : new Error(String(error));
    }

    const fallback = await runChatCompletionsWebSearch(prompt, llmContext).catch((fallbackError) => {
      const primaryMessage = primaryError?.message ?? "Unknown responses API failure";
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`${primaryMessage}; fallback failed: ${fallbackMessage}`);
    });
    if (fallback) {
      return fallback;
    }
  } finally {
    context.onProcessExit?.(activityId);
  }

  throw new Error("The web search response was empty.");
}

async function runChatCompletionsWebSearch(
  prompt: string,
  llmContext: LLMClientContext
): Promise<string> {
  const response = await llmContext.client.chat.completions.create({
    model: llmContext.model,
    messages: [{ role: "user", content: prompt }],
    web_search_options: {
      search_context_size: "medium"
    }
  });

  const content = response.choices?.[0]?.message?.content as unknown;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return (content as Array<{ text?: string }>)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function getOpenAIResponseText(response: unknown): string {
  const record = response as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: unknown; text?: unknown }> }>;
  };

  if (typeof record.output_text === "string" && record.output_text.trim()) {
    return record.output_text.trim();
  }

  const chunks: string[] = [];
  for (const item of record.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string" &&
        content.text
      ) {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function appendChunk(existing: string, chunk: string | Buffer): string {
  if (existing.length >= MAX_CAPTURE_CHARS) {
    return existing;
  }
  const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
  const remaining = MAX_CAPTURE_CHARS - existing.length;
  return `${existing}${text.slice(0, remaining)}`;
}

function formatWebSearchActivityLabel(query: string): string {
  const normalizedQuery = query.replace(/\s+/g, " ").trim();
  const maxQueryLength = 180;
  const clippedQuery =
    normalizedQuery.length > maxQueryLength
      ? `${normalizedQuery.slice(0, maxQueryLength - 3)}...`
      : normalizedQuery;
  return `${WEB_SEARCH_TOOL_ACTIVITY_PREFIX} ${clippedQuery}`;
}

function buildCommandError(exitCode: number | null, signal: string | null): string {
  if (signal) {
    return `WebSearch command terminated by signal ${signal}.`;
  }
  if (exitCode !== null) {
    return `WebSearch command failed with exit code ${exitCode}.`;
  }
  return "WebSearch command failed.";
}
