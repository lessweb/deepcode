import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import type OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionContentPart } from "openai/resources/chat/completions";
import { getSystemPrompt, getTools } from "./prompt";
import { ToolExecutor } from "./tools/executor";

const MAX_SESSION_ENTRIES = 50;

export type SessionStatus = "failed" | "pending" | "processing" | "completed" | "interrupted";

export type SessionEntry = {
  id: string;
  summary: string | null;
  assistantReply: string | null;
  assistantThinking: string | null;
  assistantRefusal: string | null;
  toolCalls: unknown[] | null;
  status: SessionStatus;
  failReason: string | null;
  usage: unknown | null;
  createTime: string;
  updateTime: string;
};

export type SessionsIndex = {
  version: 1;
  entries: SessionEntry[];
  originalPath: string;
};

export type SessionMessageRole = "system" | "user" | "assistant" | "tool";

export type MessageMeta = {
  function?: unknown;
  paramsMd?: string;
  resultMd?: string;
  asThinking?: boolean;
};

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: SessionMessageRole;
  content: string | null;
  contentParams: unknown | null;
  messageParams: unknown | null;
  compacted: boolean;
  visible: boolean;
  createTime: string;
  updateTime: string;
  meta?: MessageMeta;
  html?: string;
};

export type UserPromptContent = {
  text?: string;
  imageUrls?: string[];
  skills?: SkillInfo[];
};

export type SkillInfo = {
  name: string;
  path: string;
};

type CreateOpenAIClient = () => { client: OpenAI | null; model: string };

type SessionManagerOptions = {
  projectRoot: string;
  createOpenAIClient: CreateOpenAIClient;
  renderMarkdown: (text: string) => string;
  onAssistantMessage: (message: SessionMessage, shouldConnect: boolean) => void;
};

export class SessionManager {
  private readonly projectRoot: string;
  private readonly createOpenAIClient: CreateOpenAIClient;
  private readonly onAssistantMessage: (message: SessionMessage, shouldConnect: boolean) => void;
  private activeSessionId: string | null = null;
  private readonly sessionControllers = new Map<string, AbortController>();
  private readonly toolExecutor: ToolExecutor;

  constructor(options: SessionManagerOptions) {
    this.projectRoot = options.projectRoot;
    this.createOpenAIClient = options.createOpenAIClient;
    this.onAssistantMessage = options.onAssistantMessage;
    this.toolExecutor = new ToolExecutor(this.projectRoot);
  }

  async listSkills(): Promise<SkillInfo[]> {
    const homeDir = os.homedir();
    const claudeRoot = path.join(homeDir, ".claude", "skills");
    const deepcodeRoot = path.join(homeDir, ".deepcode", "skills");
    const skillsByName = new Map<string, SkillInfo>();

    const collectSkills = (root: string, displayRoot: string): SkillInfo[] => {
      if (!fs.existsSync(root)) {
        return [];
      }
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true });
      } catch {
        return [];
      }

      const results: SkillInfo[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }
        const skillName = entry.name;
        const skillPath = path.join(root, skillName, "SKILL.md");
        try {
          if (!fs.existsSync(skillPath)) {
            continue;
          }
          const stat = fs.statSync(skillPath);
          if (!stat.isFile()) {
            continue;
          }
        } catch {
          continue;
        }
        results.push({
          name: skillName.replace(/_/g, '-'),
          path: `${displayRoot}/${skillName}/SKILL.md`,
        });
      }
      return results;
    };

    for (const skill of collectSkills(claudeRoot, "~/.claude/skills")) {
      skillsByName.set(skill.name, skill);
    }
    for (const skill of collectSkills(deepcodeRoot, "~/.deepcode/skills")) {
      skillsByName.set(skill.name, skill);
    }

    return Array.from(skillsByName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  private resolveSkillPath(skillPath: string): string {
    if (skillPath.startsWith("~/")) {
      return path.join(os.homedir(), skillPath.slice(2));
    }
    if (skillPath.startsWith("~\\")) {
      return path.join(os.homedir(), skillPath.slice(2));
    }
    if (path.isAbsolute(skillPath)) {
      return skillPath;
    }
    return path.join(os.homedir(), skillPath);
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  setActiveSessionId(sessionId: string | null): void {
    this.activeSessionId = sessionId;
  }

  async handleUserPrompt(userPrompt: UserPromptContent): Promise<void> {
    if (!this.activeSessionId || !this.getSession(this.activeSessionId)) {
      await this.createSession(userPrompt);
    } else {
      await this.replySession(this.activeSessionId, userPrompt);
    }
  }

  async createSession(userPrompt: UserPromptContent): Promise<string> {
    if (userPrompt.text && userPrompt.text.startsWith("/")) {
      // like '/code-review\n', then listSkills and find skill with name 'code-review', if found, put skill into userPrompt.skills, and remove the first line from userPrompt.text
      const lines = userPrompt.text.split("\n");
      const firstLine = lines[0].trim();
      if (firstLine.startsWith("/")) {
        const skillName = firstLine.slice(1).trim();
        const skills = await this.listSkills();
        const matchedSkill = skills.find((skill) => skill.name === skillName);
        if (matchedSkill) {
          userPrompt.skills = [...(userPrompt.skills ?? []), matchedSkill];
          userPrompt.text = lines.slice(1).join("\n").trim();
        }
      }
    }
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();
    const index = this.loadSessionsIndex();
    const entry: SessionEntry = {
      id: sessionId,
      summary: userPrompt.text ? userPrompt.text.slice(0, 100) : "[Image Prompt]",
      assistantReply: null,
      assistantThinking: null,
      assistantRefusal: null,
      toolCalls: null,
      status: "pending",
      failReason: null,
      usage: null,
      createTime: now,
      updateTime: now
    };
    index.entries.push(entry);
    const sortedEntries = index.entries
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(a.updateTime);
        const bTime = Date.parse(b.updateTime);
        if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
          return b.updateTime.localeCompare(a.updateTime);
        }
        return bTime - aTime;
      });
    const keptEntries = sortedEntries.slice(0, MAX_SESSION_ENTRIES);
    const keptIds = new Set(keptEntries.map((item) => item.id));
    const droppedEntries = sortedEntries.filter((item) => !keptIds.has(item.id));
    index.entries = keptEntries;
    this.saveSessionsIndex(index);
    this.removeSessionMessages(droppedEntries.map((item) => item.id));

    const systemPrompt = getSystemPrompt(this.projectRoot);
    const systemMessage = this.buildSystemMessage(sessionId, systemPrompt);
    this.appendSessionMessage(sessionId, systemMessage);

    if (userPrompt.skills && userPrompt.skills.length > 0) {
      for (const skill of userPrompt.skills) {
        const skillMd = fs.readFileSync(this.resolveSkillPath(skill.path), "utf8");
        const skillPrompt = `Use the skill document below to assist the user:\n
<${skill.name}-skill path="${skill.path}">
${skillMd}
</${skill.name}-skill>`;
        const skillMessage = this.buildSystemMessage(sessionId, skillPrompt);
        this.appendSessionMessage(sessionId, skillMessage);
      }
    }

    const userMessage = this.buildUserMessage(sessionId, userPrompt);
    this.appendSessionMessage(sessionId, userMessage);

    this.activeSessionId = sessionId;
    await this.activateSession(sessionId);
    return sessionId;
  }

  async replySession(sessionId: string, userPrompt: UserPromptContent): Promise<void> {
    const now = new Date().toISOString();
    const updated = this.updateSessionEntry(sessionId, (entry) => ({
      ...entry,
      status: "pending",
      failReason: null,
      updateTime: now
    }));

    if (!updated) {
      await this.createSession(userPrompt);
      return;
    }

    if (userPrompt.skills && userPrompt.skills.length > 0) {
      for (const skill of userPrompt.skills) {
        const skillMd = fs.readFileSync(this.resolveSkillPath(skill.path), "utf8");
        const skillPrompt = `Use the skill document below to assist the user:\n
<${skill.name}-skill path="${skill.path}">
${skillMd}
</${skill.name}-skill>`;
        const skillMessage = this.buildSystemMessage(sessionId, skillPrompt);
        this.appendSessionMessage(sessionId, skillMessage);
      }
    }

    const userMessage = this.buildUserMessage(sessionId, userPrompt);
    this.appendSessionMessage(sessionId, userMessage);
    this.activeSessionId = sessionId;
    await this.activateSession(sessionId);
  }

  async activateSession(sessionId: string): Promise<void> {
    const { client, model } = this.createOpenAIClient();
    const now = new Date().toISOString();

    if (!client) {
      this.updateSessionEntry(sessionId, (entry) => ({
        ...entry,
        status: "failed",
        failReason: "OpenAI API key not found",
        updateTime: now
      }));
      this.onAssistantMessage(
        this.buildAssistantMessage(sessionId, "OpenAI API key not found. Please configure ~/.deepcode/settings.json.", null),
        false,
      );
      return;
    }

    this.updateSessionEntry(sessionId, (entry) => ({
      ...entry,
      status: "processing",
      updateTime: now
    }));

    const controller = new AbortController();
    this.sessionControllers.set(sessionId, controller);

    try {
      const maxIterations = 30;
      let toolCalls: unknown[] | null = null;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (this.isInterrupted(sessionId)) {
          return;
        }

        const session = this.getSession(sessionId);
        if (session?.status === "interrupted" || session?.status === "failed") {
          return;
        }

        const messages = this.buildOpenAIMessages(this.listSessionMessages(sessionId));
        const response = await client.chat.completions.create(
            {
              model,
              messages,
              tools: getTools()
            },
            { signal: controller.signal }
        );

        const message = response.choices?.[0]?.message;
        const content = message?.content ?? "";
        const rawToolCalls = (message as { tool_calls?: unknown[] } | undefined)?.tool_calls ?? null;
        toolCalls = Array.isArray(rawToolCalls) && rawToolCalls.length > 0 ? rawToolCalls : null;
        const thinking =
            (message as { reasoning_content?: string } | undefined)?.reasoning_content ?? null;
        const refusal = (message as { refusal?: string } | undefined)?.refusal ?? null;
        // const html = content ? this.renderMarkdown(content) : "";

        if (this.isInterrupted(sessionId)) {
          return;
        }
        const assistantMessage = this.buildAssistantMessage(sessionId, content, toolCalls);
        this.appendSessionMessage(sessionId, assistantMessage);
        this.onAssistantMessage(assistantMessage, true);

        if (toolCalls) {
          await this.appendToolMessages(sessionId, toolCalls);
        }

        if (this.isInterrupted(sessionId)) {
          return;
        }

        this.updateSessionEntry(sessionId, (entry) => ({
          ...entry,
          assistantReply: content,
          assistantThinking: thinking,
          assistantRefusal: refusal,
          toolCalls,
          usage: response.usage ?? null,
          status: refusal ? "failed" : toolCalls ? "processing" : "completed",
          failReason: refusal ? refusal : entry.failReason,
          updateTime: new Date().toISOString()
        }));

        if (refusal) {
          return;
        }

        if (!toolCalls) {
          return;
        }
      }

      this.updateSessionEntry(sessionId, (entry) => ({
        ...entry,
        status: "completed",
        updateTime: new Date().toISOString()
      }));
      this.onAssistantMessage(
        this.buildAssistantMessage(sessionId, "The AI agent has taken several steps but hasn't reached a conclusion yet. Do you want to continue?", null),
        false,
      )
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof Error && error.name === "AbortError";
      this.updateSessionEntry(sessionId, (entry) => ({
        ...entry,
        status: aborted ? "interrupted" : "failed",
        failReason: errMessage,
        updateTime: new Date().toISOString()
      }));

      if (!aborted) {
        this.onAssistantMessage(
          this.buildAssistantMessage(sessionId, `Request failed: ${errMessage}`, null),
          false,
        );
      }
    } finally {
      this.sessionControllers.delete(sessionId);
    }
  }

  interruptSession(sessionId: string): void {
    const controller = this.sessionControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.sessionControllers.delete(sessionId);
    }

    const now = new Date().toISOString();
    this.updateSessionEntry(sessionId, (entry) => ({
      ...entry,
      status: "interrupted",
      failReason: "interrupted",
      updateTime: now
    }));

    this.onAssistantMessage(
      this.buildUserMessage(sessionId, { text: "Interrupted." }),
      false,
    );
  }

  private isInterrupted(sessionId: string): boolean {
    return !this.sessionControllers.has(sessionId);
  }

  listSessions(): SessionEntry[] {
    const index = this.loadSessionsIndex();
    return index.entries;
  }

  getSession(sessionId: string): SessionEntry | null {
    const index = this.loadSessionsIndex();
    return index.entries.find((entry) => entry.id === sessionId) ?? null;
  }

  listSessionMessages(sessionId: string): SessionMessage[] {
    const messagePath = this.getSessionMessagesPath(sessionId);
    if (!fs.existsSync(messagePath)) {
      return [];
    }

    const raw = fs.readFileSync(messagePath, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const messages: SessionMessage[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as SessionMessage;
        messages.push(parsed);
      } catch {
        // ignore malformed line
      }
    }
    return messages;
  }

  private getProjectCode(projectRoot: string): string {
    return projectRoot.replace(/[\\/]/g, "-").replace(/:/g, "");
  }

  private getProjectStorage(): {
    projectCode: string;
    projectDir: string;
    sessionsIndexPath: string;
  } {
    const projectCode = this.getProjectCode(this.projectRoot);
    const projectDir = path.join(os.homedir(), ".deepcode", "projects", projectCode);
    const sessionsIndexPath = path.join(projectDir, "sessions-index.json");
    return { projectCode, projectDir, sessionsIndexPath };
  }

  private ensureProjectDir(): string {
    const { projectDir } = this.getProjectStorage();
    fs.mkdirSync(projectDir, { recursive: true });
    return projectDir;
  }

  private loadSessionsIndex(): SessionsIndex {
    const { sessionsIndexPath } = this.getProjectStorage();
    this.ensureProjectDir();

    if (!fs.existsSync(sessionsIndexPath)) {
      return { version: 1, entries: [], originalPath: this.projectRoot };
    }

    try {
      const raw = fs.readFileSync(sessionsIndexPath, "utf8");
      const parsed = JSON.parse(raw) as SessionsIndex;
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      return {
        version: 1,
        entries,
        originalPath: parsed.originalPath || this.projectRoot
      };
    } catch {
      return { version: 1, entries: [], originalPath: this.projectRoot };
    }
  }

  private saveSessionsIndex(index: SessionsIndex): void {
    const { sessionsIndexPath } = this.getProjectStorage();
    this.ensureProjectDir();
    const normalized: SessionsIndex = {
      version: 1,
      entries: index.entries,
      originalPath: this.projectRoot
    };
    fs.writeFileSync(sessionsIndexPath, JSON.stringify(normalized, null, 2), "utf8");
  }

  private getSessionMessagesPath(sessionId: string): string {
    const { projectDir } = this.getProjectStorage();
    return path.join(projectDir, `${sessionId}.jsonl`);
  }

  private removeSessionMessages(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      const messagePath = this.getSessionMessagesPath(sessionId);
      try {
        if (fs.existsSync(messagePath)) {
          fs.unlinkSync(messagePath);
        }
      } catch {
        // ignore delete failures
      }
    }
  }

  private appendSessionMessage(sessionId: string, message: SessionMessage): void {
    this.ensureProjectDir();
    const messagePath = this.getSessionMessagesPath(sessionId);
    fs.appendFileSync(messagePath, `${JSON.stringify(message)}\n`, "utf8");
  }

  private updateSessionEntry(
      sessionId: string,
      updater: (entry: SessionEntry) => SessionEntry
  ): SessionEntry | null {
    const index = this.loadSessionsIndex();
    const entryIndex = index.entries.findIndex((entry) => entry.id === sessionId);
    if (entryIndex === -1) {
      return null;
    }

    const updated = updater({ ...index.entries[entryIndex] });
    index.entries[entryIndex] = updated;
    this.saveSessionsIndex(index);
    return updated;
  }

  private buildUserMessage(sessionId: string, prompt: UserPromptContent): SessionMessage {
    const now = new Date().toISOString();
    const imageParams =
        prompt.imageUrls
            ?.filter((url) => Boolean(url))
            .map((url) => ({
              type: "image_url",
              image_url: { url }
            })) ?? [];

    return {
      id: crypto.randomUUID(),
      sessionId,
      role: "user",
      content: prompt.text ?? "",
      contentParams: imageParams.length > 0 ? imageParams : null,
      messageParams: null,
      compacted: false,
      visible: true,
      createTime: now,
      updateTime: now
    };
  }

  private buildSystemMessage(sessionId: string, content: string): SessionMessage {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      sessionId,
      role: "system",
      content,
      contentParams: null,
      messageParams: null,
      compacted: false,
      visible: false,
      createTime: now,
      updateTime: now
    };
  }

  private buildAssistantMessage(
      sessionId: string,
      content: string | null,
      toolCalls: unknown[] | null
  ): SessionMessage {
    const now = new Date().toISOString();
    const messageParams = toolCalls ? { tool_calls: toolCalls } : null;
    return {
      id: crypto.randomUUID(),
      sessionId,
      role: "assistant",
      content,
      contentParams: null,
      messageParams,
      compacted: false,
      visible: (content || "").trim() || toolCalls ? true : false,
      createTime: now,
      updateTime: now,
      meta: toolCalls ? { asThinking: true } : undefined
    };
  }

  private buildToolMessage(
    sessionId: string,
    toolCallId: string,
    content: string,
    toolFunction: unknown | null
  ): SessionMessage {
    const now = new Date().toISOString();
    const paramsMd = this.buildToolParamsSnippet(toolFunction);
    const resultMd = this.buildToolResultSnippet(content);
    const isInvisibleExecution = this.isInvisibleExecution(content);
    return {
      id: crypto.randomUUID(),
      sessionId,
      role: "tool",
      content,
      contentParams: null,
      messageParams: { tool_call_id: toolCallId },
      compacted: false,
      visible: !isInvisibleExecution,
      createTime: now,
      updateTime: now,
      meta: {
        function: toolFunction ?? undefined,
        paramsMd,
        resultMd
      }
    };
  }

  private async appendToolMessages(sessionId: string, toolCalls: unknown[]): Promise<void> {
    const toolExecutions = await this.toolExecutor.executeToolCalls(sessionId, toolCalls);
    if (this.isInterrupted(sessionId)) {
      return;
    }
    for (const execution of toolExecutions) {
      const toolFunction = this.findToolFunction(toolCalls, execution.toolCallId);
      const toolMessage = this.buildToolMessage(
        sessionId,
        execution.toolCallId,
        execution.content,
        toolFunction
      );
      this.appendSessionMessage(sessionId, toolMessage);
      this.onAssistantMessage(toolMessage, true);
    }
  }

  private buildOpenAIMessages(messages: SessionMessage[]): ChatCompletionMessageParam[] {
    return messages
        .filter((message) => !message.compacted)
        .map((message) => {
          const base: ChatCompletionMessageParam = {
            role: message.role,
            content: message.content ?? ""
          } as ChatCompletionMessageParam;

          const messageParams = message.messageParams as
              | { tool_calls?: unknown[]; tool_call_id?: string }
              | null
              | undefined;
          if (messageParams?.tool_calls) {
            (base as { tool_calls?: unknown[] }).tool_calls = messageParams.tool_calls;
          }
          if (messageParams?.tool_call_id) {
            (base as { tool_call_id?: string }).tool_call_id = messageParams.tool_call_id;
          }

          if (message.role === "user" && message.contentParams) {
            const contentParts: ChatCompletionContentPart[] = [];
            if (message.content) {
              contentParts.push({ type: "text", text: message.content });
            }
            const params = Array.isArray(message.contentParams)
                ? message.contentParams
                : [message.contentParams];
            for (const param of params) {
              if (param && typeof param === "object") {
                contentParts.push(param as ChatCompletionContentPart);
              }
            }
            const contentValue: string | ChatCompletionContentPart[] =
                contentParts.length > 0 ? contentParts : message.content ?? "";
            (base as { content: string | ChatCompletionContentPart[] }).content = contentValue;
          }

          return base;
        });
  }

  private findToolFunction(toolCalls: unknown[], toolCallId: string): unknown | null {
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== "object") {
        continue;
      }
      const record = toolCall as { id?: unknown; function?: unknown };
      if (record.id === toolCallId) {
        return record.function ?? null;
      }
    }
    return null;
  }

  private buildToolParamsSnippet(toolFunction: unknown | null): string {
    if (!toolFunction || typeof toolFunction !== "object") {
      return "";
    }
    const args = (toolFunction as { arguments?: unknown }).arguments;
    const toolName = (toolFunction as { name?: unknown }).name;
    if (typeof args !== "string") {
      return "";
    }
    const trimmed = args.trim();
    if (!trimmed) {
      return "";
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const firstKey = Object.keys(parsed)[0];
        if (firstKey) {
          const value = (parsed as Record<string, unknown>)[firstKey];
          const text = typeof value === "string" ? value : JSON.stringify(value);
          if (toolName === "read" && text.startsWith(this.projectRoot)) {
            return text.slice(this.projectRoot.length).replace(/^[\\/]/, "");
          } else {
            return text;
          }
        }
      }
    } catch {
      // fall back to raw string
    }
    return trimmed;
  }

  private buildToolResultSnippet(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) {
      return "";
    }

    const maxLength = 2000;

    try {
      const parsed = JSON.parse(content) as { output?: unknown };
      if (parsed.output !== undefined) {
        if (typeof parsed.output === "string") {
          return this.formatToolResultSnippet(parsed.output, maxLength);
        }
        return this.formatToolResultSnippet(JSON.stringify(parsed.output), maxLength);
      }
    } catch {
      // fall back to raw content
    }

    return this.formatToolResultSnippet(content, maxLength);
  }

  private formatToolResultSnippet(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}... (total ${value.length} chars)`;
  }

  private isInvisibleExecution(content: string): boolean {
    if (!content.trim()) {
      return false;
    }
    try {
      const parsed = JSON.parse(content) as { name?: unknown; ok?: unknown };
      return parsed.name === "bash" && parsed.ok !== true;
    } catch {
      return false;
    }
  }
}
