import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";
import MarkdownIt from "markdown-it";
import { SessionManager, SessionMessage, type SkillInfo, type UserPromptContent } from "./session";
import { resolveSettings, type DeepcodingSettings } from "./settings";

const DEFAULT_MODEL = "deepseek-reasoner";
const DEFAULT_BASE_URL = "https://api.deepseek.com";

class DeepcodingViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "deepcode.chatView";

  private readonly context: vscode.ExtensionContext;
  private webviewView: vscode.WebviewView | undefined;
  private readonly md: MarkdownIt;
  private readonly sessionManager: SessionManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.md = new MarkdownIt({
      html: false,
      linkify: false,
      breaks: true
    });
    this.sessionManager = new SessionManager({
      projectRoot: this.getWorkspaceRoot(),
      createOpenAIClient: () => this.createOpenAIClient(),
      renderMarkdown: (text) => this.md.render(text),
      onAssistantMessage: (message: SessionMessage, shouldConnect: boolean) => {
        if (!this.webviewView) {
          return;
        }
        if (message.visible === false) {
          return;
        }
        if (message.role !== "tool") {
          const reasoningContent = (message.messageParams as any)?.reasoning_content;
          message.html = this.md.render(message.content || reasoningContent || "");
        }
        this.webviewView.webview.postMessage({ type: "appendMessage", message, shouldConnect });
      }
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getWebviewHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "ready") {
        // webview 已准备好，发送初始数据
        this.loadInitialSession();
        // 同时请求 skills 列表
        this.sendSkillsList();
      } else if (message?.type === "requestSkills") {
        // 请求 skills 列表
        this.sendSkillsList();
      } else if (message?.type === "userPrompt") {
        const prompt = String(message.prompt || "").trim();
        const images = Array.isArray(message.images)
          ? message.images.filter((image: unknown): image is string => typeof image === "string" && image.length > 0)
          : [];
        if (!prompt && images.length === 0) {
          return;
        }
        // 获取 skills
        const skills = message.skills || [];
        await this.handlePrompt(prompt, skills, images);
      } else if (message?.type === "interrupt") {
        // 中断当前会话
        const activeSessionId = this.sessionManager.getActiveSessionId();
        if (activeSessionId) {
          this.sessionManager.interruptSession(activeSessionId);
        }
      } else if (message?.type === "createNewSession") {
        await this.createNewSession();
      } else if (message?.type === "selectSession") {
        const sessionId = String(message.sessionId || "").trim();
        if (sessionId) {
          this.loadSession(sessionId);
          await this.sendSkillsList(sessionId);
        }
      } else if (message?.type === "backToList") {
        this.showSessionsList();
      }
    });
  }

  private async loadInitialSession(): Promise<void> {
    const sessions = this.sessionManager.listSessions();
    const sessionsList = sessions.map((s) => ({
      id: s.id,
      summary: s.summary || "Untitled",
      createTime: s.createTime,
      updateTime: s.updateTime,
      status: s.status
    }));

    if (sessions.length === 0) {
      // 没有历史会话，显示新对话界面
      this.sendMessage({
        type: "initializeEmpty",
        sessions: sessionsList,
        status: null
      });
      return;
    }

    // 显示最新的对话
    const latestSession = sessions[0];
    this.loadSession(latestSession.id);
  }

  private loadSession(sessionId: string): void {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    // 设置为活动会话
    this.sessionManager.setActiveSessionId(sessionId);

    const messages = this.sessionManager.listSessionMessages(sessionId);

    // 获取所有会话列表
    const sessions = this.sessionManager.listSessions();
    const sessionsList = sessions.map((s) => ({
      id: s.id,
      summary: s.summary || "Untitled",
      createTime: s.createTime,
      updateTime: s.updateTime,
      status: s.status
    }));

    // 发送对话信息到 webview
    this.sendMessage({
      type: "loadSession",
      sessionId,
      summary: session.summary || "Untitled",
      status: session.status,
      sessions: sessionsList,
      messages: messages
        .filter((m) => m.visible)
        .map((m) => ({
          role: m.role,
          content: m.content,
          html: m.role !== "tool" ? this.md.render(
            m.content || (m.messageParams as any)?.reasoning_content || ""
          ) : undefined,
          meta: m.meta
        }))
    });
  }

  private showSessionsList(): void {
    const sessions = this.sessionManager.listSessions();
    this.sendMessage({
      type: "showSessionsList",
      sessions: sessions.map((s) => ({
        id: s.id,
        summary: s.summary || "Untitled",
        createTime: s.createTime,
        updateTime: s.updateTime,
        status: s.status
      }))
    });
  }

  private async createNewSession(): Promise<void> {
    // 清除当前活动会话
    this.sessionManager.setActiveSessionId(null);

    // 获取所有会话列表
    const sessions = this.sessionManager.listSessions();
    const sessionsList = sessions.map((s) => ({
      id: s.id,
      summary: s.summary || "Untitled",
      createTime: s.createTime,
      updateTime: s.updateTime,
      status: s.status
    }));

    this.sendMessage({
      type: "initializeEmpty",
      sessions: sessionsList,
      status: null
    });
    await this.sendSkillsList();
  }

  private sendMessage(message: any): void {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.postMessage(message);
  }

  private async sendSkillsList(sessionId?: string): Promise<void> {
    if (!this.webviewView) {
      return;
    }
    const skills = await this.sessionManager.listSkills(sessionId ?? this.sessionManager.getActiveSessionId() ?? undefined);
    this.sendMessage({ type: "skillsList", skills });
  }

  private async handlePrompt(prompt: string, skills?: SkillInfo[], imageUrls?: string[]): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const webview = this.webviewView.webview;
    const normalizedImages = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
    const displayPrompt = prompt || (normalizedImages.length > 0 ? "粘贴的图像" : "");

    // 先显示用户消息（原始文本，不做 HTML 格式化）
    webview.postMessage({ type: "userMessage", content: displayPrompt });

    webview.postMessage({ type: "loading", value: true });

    try {
      const userPrompt: UserPromptContent = { text: prompt, skills, imageUrls: normalizedImages };
      await this.sessionManager.handleUserPrompt(userPrompt);
      await this.sendSkillsList();

      const activeSessionId = this.sessionManager.getActiveSessionId();
      const activeSession = activeSessionId ? this.sessionManager.getSession(activeSessionId) : null;
      if (activeSessionId && activeSession) {
        webview.postMessage({
          type: "sessionStatus",
          sessionId: activeSessionId,
          status: activeSession.status
        });
      }

      // 发送更新后的会话列表（可能创建了新会话）
      const sessions = this.sessionManager.listSessions();
      const sessionsList = sessions.map((s) => ({
        id: s.id,
        summary: s.summary || "Untitled",
        createTime: s.createTime,
        updateTime: s.updateTime,
        status: s.status
      }));
      webview.postMessage({
        type: "showSessionsList",
        sessions: sessionsList
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      webview.postMessage({
        type: "assistant",
        html: this.md.render(`Request failed: ${message}`)
      });
    } finally {
      webview.postMessage({ type: "loading", value: false });
    }
  }

  private createOpenAIClient(): { client: OpenAI | null; model: string; thinkingEnabled: boolean; notify?: string } {
    const settings = resolveSettings(this.readSettings(), {
      model: DEFAULT_MODEL,
      baseURL: DEFAULT_BASE_URL
    });

    const { apiKey, baseURL, model, thinkingEnabled, notify } = settings;

    if (!apiKey) {
      return { client: null, model, thinkingEnabled, notify };
    }

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined
    });

    return { client, model, thinkingEnabled, notify };
  }

  private readSettings(): DeepcodingSettings | null {
    try {
      const settingsPath = path.join(os.homedir(), ".deepcode", "settings.json");
      if (!fs.existsSync(settingsPath)) {
        return null;
      }

      const raw = fs.readFileSync(settingsPath, "utf8");
      return JSON.parse(raw) as DeepcodingSettings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to read ~/.deepcode/settings.json: ${message}`);
      return null;
    }
  }

  private getWorkspaceRoot(): string {
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (workspace) {
      return workspace.uri.fsPath;
    }
    return process.cwd();
  }

  private getWebviewHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const csp = webview.cspSource;

    // 读取 HTML 模板文件
    const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'webview.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    // 获取 CSS 文件 URI
    const cssPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'webview.css');
    const cssUri = webview.asWebviewUri(cssPath);
    const attachmentsJsPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'prompt-attachments.js');
    const attachmentsJsUri = webview.asWebviewUri(attachmentsJsPath);

    // 获取 Logo 文件 URI
    const iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'deepcoding_icon.png');
    const iconUri = webview.asWebviewUri(iconPath);

    // 替换占位符
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{cspSource\}\}/g, csp);
    html = html.replace(/\{\{cssUri\}\}/g, cssUri.toString());
    html = html.replace(/\{\{attachmentsJsUri\}\}/g, attachmentsJsUri.toString());
    html = html.replace(/\{\{iconUri\}\}/g, iconUri.toString());

    return html;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DeepcodingViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DeepcodingViewProvider.viewType, provider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("deepcode.openView", async () => {
      await vscode.commands.executeCommand("workbench.view.extension.deepcode");
      await vscode.commands.executeCommand("deepcode.chatView.focus");
    })
  );
}

export function deactivate(): void {
  // no-op
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
