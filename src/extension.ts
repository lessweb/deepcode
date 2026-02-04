import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";
import MarkdownIt from "markdown-it";
import { SessionManager, type UserPromptContent } from "./session";

type DeepcodingEnv = {
  MODEL?: string;
  BASE_URL?: string;
  API_KEY?: string;
};

type DeepcodingSettings = {
  env?: DeepcodingEnv;
};

const DEFAULT_MODEL = "gpt-4o-mini";

class DeepcodingViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "deepcoding.chatView";

  private readonly context: vscode.ExtensionContext;
  private webviewView: vscode.WebviewView | undefined;
  private readonly md: MarkdownIt;
  private readonly sessionManager: SessionManager;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true
    });
    this.sessionManager = new SessionManager({
      projectRoot: this.getWorkspaceRoot(),
      createOpenAIClient: () => this.createOpenAIClient(),
      renderMarkdown: (text) => this.md.render(text),
      onAssistantMessage: (html) => {
        if (!this.webviewView) {
          return;
        }
        this.webviewView.webview.postMessage({ type: "assistant", html });
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
      } else if (message?.type === "userPrompt") {
        const prompt = String(message.prompt || "").trim();
        if (!prompt) {
          return;
        }
        await this.handlePrompt(prompt);
      } else if (message?.type === "createNewSession") {
        await this.createNewSession();
      } else if (message?.type === "selectSession") {
        const sessionId = String(message.sessionId || "").trim();
        if (sessionId) {
          this.loadSession(sessionId);
        }
      } else if (message?.type === "backToList") {
        this.showSessionsList();
      }
    });
  }

  private async loadInitialSession(): Promise<void> {
    const sessions = this.sessionManager.listSessions();
    if (sessions.length === 0) {
      // 没有历史会话，显示新对话界面
      this.sendMessage({ type: "initializeEmpty" });
      return;
    }

    // 显示最新的对话
    const latestSession = sessions[sessions.length - 1];
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

    // 发送对话信息到 webview
    this.sendMessage({
      type: "loadSession",
      sessionId,
      summary: session.summary || "Untitled",
      messages: messages
        .filter((m) => m.visible)
        .map((m) => ({
          role: m.role,
          content: m.content,
          html: m.role === "assistant" ? this.md.render(m.content || "") : null
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
    this.sendMessage({ type: "initializeEmpty" });
  }

  private sendMessage(message: any): void {
    if (!this.webviewView) {
      return;
    }
    this.webviewView.webview.postMessage(message);
  }

  private async handlePrompt(prompt: string): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const webview = this.webviewView.webview;
    webview.postMessage({ type: "loading", value: true });

    try {
      const userPrompt: UserPromptContent = { text: prompt };
      await this.sessionManager.handleUserPrompt(userPrompt);
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

  private createOpenAIClient(): { client: OpenAI | null; model: string } {
    const settings = this.readSettings();
    const env = settings?.env || {};

    const apiKey = env.API_KEY?.trim();
    const baseURL = env.BASE_URL?.trim();
    const model = env.MODEL?.trim() || DEFAULT_MODEL;

    if (!apiKey) {
      return { client: null, model };
    }

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || undefined
    });

    return { client, model };
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

    // 替换占位符
    html = html.replace(/\{\{nonce\}\}/g, nonce);
    html = html.replace(/\{\{cspSource\}\}/g, csp);

    return html;
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DeepcodingViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DeepcodingViewProvider.viewType, provider)
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
