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

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deep Code</title>
  <style>
    :root {
      --bg: #0f1222;
      --panel: #151a2e;
      --panel-2: #1d2340;
      --text: #f5f7ff;
      --muted: #a5acc7;
      --accent: #5bd0ff;
      --accent-2: #7cffc4;
      --danger: #ff7a8a;
      --shadow: rgba(11, 14, 28, 0.35);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      background: radial-gradient(120% 120% at 10% 10%, #1a2342 0%, #0f1222 55%, #0b0d1a 100%);
      color: var(--text);
      font-family: "Avenir Next", "Segoe UI", sans-serif;
    }

    .app {
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 14px 16px;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: var(--muted);
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .bubble {
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--panel);
      box-shadow: 0 10px 25px var(--shadow);
      line-height: 1.5;
      font-size: 13px;
    }

    .bubble.user {
      align-self: flex-end;
      background: linear-gradient(135deg, #263062 0%, #202951 60%, #1c2346 100%);
      color: var(--text);
      border: 1px solid rgba(91, 208, 255, 0.3);
    }

    .bubble.assistant {
      align-self: flex-start;
      background: var(--panel-2);
      border: 1px solid rgba(124, 255, 196, 0.25);
    }

    .bubble.assistant pre {
      background: rgba(10, 13, 26, 0.8);
      padding: 10px;
      border-radius: 10px;
      overflow-x: auto;
      color: #e9f5ff;
    }

    .bubble.assistant code {
      font-family: "JetBrains Mono", "Fira Code", monospace;
      font-size: 12px;
    }

    .composer {
      padding: 12px 16px 16px;
      background: linear-gradient(180deg, rgba(12, 14, 24, 0.2) 0%, rgba(12, 14, 24, 0.9) 100%);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
    }

    .input-wrap {
      position: relative;
    }

    textarea {
      width: 100%;
      min-height: 72px;
      resize: vertical;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(21, 26, 46, 0.95);
      color: var(--text);
      padding: 10px 12px 28px 12px;
      font-size: 13px;
      line-height: 1.4;
      outline: none;
    }

    textarea:focus {
      border-color: rgba(91, 208, 255, 0.7);
      box-shadow: 0 0 0 2px rgba(91, 208, 255, 0.15);
    }

    .send-button {
      position: absolute;
      right: 10px;
      bottom: 10px;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: none;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
      cursor: pointer;
      display: grid;
      place-items: center;
      box-shadow: 0 12px 25px rgba(91, 208, 255, 0.3);
    }

    .send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    .send-icon {
      width: 12px;
      height: 12px;
      fill: #0b0d1a;
    }

    .loading {
      display: none;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      padding: 0 16px 10px;
    }

    .loading.active {
      display: flex;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-top-color: var(--accent);
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">Deep Code</div>
    <div class="messages" id="messages"></div>
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <span>Thinking...</span>
    </div>
    <div class="composer">
      <div class="input-wrap">
        <textarea id="prompt" placeholder="Write a prompt..." rows="3"></textarea>
        <button class="send-button" id="send" title="Send">
          <svg class="send-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12L22 2l-4 20-6-6-5 4 2-7-7-2z" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const messages = document.getElementById("messages");
    const promptInput = document.getElementById("prompt");
    const sendButton = document.getElementById("send");
    const loading = document.getElementById("loading");

    function addBubble(content, role) {
      const bubble = document.createElement("div");
      bubble.className = "bubble " + role;
      if (role === "assistant") {
        bubble.innerHTML = content;
      } else {
        bubble.textContent = content;
      }
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function setLoading(isLoading) {
      loading.classList.toggle("active", isLoading);
      sendButton.disabled = isLoading;
    }

    function sendPrompt() {
      const text = promptInput.value.trim();
      if (!text || sendButton.disabled) {
        return;
      }

      addBubble(text, "user");
      promptInput.value = "";
      vscode.postMessage({ type: "userPrompt", prompt: text });
    }

    sendButton.addEventListener("click", sendPrompt);
    promptInput.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        sendPrompt();
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "assistant") {
        addBubble(message.html || "", "assistant");
      } else if (message.type === "loading") {
        setLoading(Boolean(message.value));
      }
    });
  </script>
</body>
</html>`;
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
