import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import OpenAI from "openai";
import MarkdownIt from "markdown-it";

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

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.md = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true
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
      if (message?.type === "userPrompt") {
        const prompt = String(message.prompt || "").trim();
        if (!prompt) {
          return;
        }

        await this.handlePrompt(prompt);
      }
    });
  }

  private async handlePrompt(prompt: string): Promise<void> {
    if (!this.webviewView) {
      return;
    }

    const webview = this.webviewView.webview;
    webview.postMessage({ type: "loading", value: true });

    try {
      const { client, model } = this.createOpenAIClient();
      if (!client) {
        webview.postMessage({
          type: "assistant",
          html: this.md.render("OpenAI API key not found. Please configure ~/.deepcode/settings.json.")
        });
        return;
      }

      const response = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }]
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      const html = this.md.render(content || "(empty response)");

      webview.postMessage({ type: "assistant", html });
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
