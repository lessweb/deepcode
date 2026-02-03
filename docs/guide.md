# Deep Code Extension Guide

Complete technical guide for the Deep Code VS Code extension - an AI assistant powered by OpenAI-compatible models.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Code Structure](#code-structure)
- [Entry Points](#entry-points)
- [Core Components](#core-components)
- [Webview Communication Architecture](#webview-communication-architecture)
- [Data Flow](#data-flow)
- [Configuration](#configuration)
- [Dependencies](#dependencies)
- [UI Design](#ui-design)

---

## Overview

**Deep Code** is a VS Code extension that provides an AI chat interface in the sidebar. It supports any OpenAI-compatible API endpoint, making it flexible for use with OpenAI, Azure OpenAI, or self-hosted models.

### Key Characteristics

- Single-file implementation ([extension.ts](../src/extension.ts))
- Webview-based chat interface
- Markdown rendering for AI responses
- Simple configuration via JSON file
- Minimal dependencies

---

## Features

1. **AI Chat Interface** - Sidebar panel for conversing with AI models
2. **OpenAI Compatible** - Works with OpenAI, Azure OpenAI, and compatible APIs
3. **Markdown Rendering** - Supports code blocks, links, and formatted text in responses
4. **Simple Configuration** - Managed through `~/.deepcode/settings.json`
5. **Modern UI** - Dark theme with gradient backgrounds and smooth animations

---

## Code Structure

```
deepcode/
├── src/
│   └── extension.ts          # Main extension code (single file)
├── resources/
│   └── deepcoding_icon.png   # Extension icon
├── docs/
│   └── guide.md             # This documentation
├── package.json              # Extension manifest
└── tsconfig.json            # TypeScript configuration
```

---

## Entry Points

### 1. Extension Activation

**Location**: [extension.ts:389-394](../src/extension.ts#L389-L394)

```typescript
export function activate(context: vscode.ExtensionContext): void {
  const provider = new DeepcodingViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DeepcodingViewProvider.viewType, provider)
  );
}
```

- Called when VS Code activates the extension
- Registers `DeepcodingViewProvider` to display the chat interface
- View type: `"deepcoding.chatView"`

### 2. Extension Deactivation

**Location**: [extension.ts:396-398](../src/extension.ts#L396-L398)

```typescript
export function deactivate(): void {
  // no-op
}
```

- Called when the extension is deactivated
- Currently no cleanup needed

---

## Core Components

### DeepcodingViewProvider Class

**Location**: [extension.ts:20-387](../src/extension.ts#L20-L387)

The main class implementing `vscode.WebviewViewProvider`.

#### Key Methods

##### `resolveWebviewView()`

**Location**: [extension.ts:36-56](../src/extension.ts#L36-L56)

- Initializes the webview when the view is first shown
- Sets webview HTML content
- Registers message listener for user input

```typescript
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
      if (!prompt) return;
      await this.handlePrompt(prompt);
    }
  });
}
```

##### `handlePrompt()`

**Location**: [extension.ts:58-94](../src/extension.ts#L58-L94)

- Processes user prompts
- Calls OpenAI API
- Converts responses to Markdown HTML
- Sends results back to webview

```typescript
private async handlePrompt(prompt: string): Promise<void> {
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
```

##### `createOpenAIClient()`

**Location**: [extension.ts:96-114](../src/extension.ts#L96-L114)

- Reads configuration from settings file
- Creates OpenAI client with custom baseURL support

```typescript
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
```

##### `readSettings()`

**Location**: [extension.ts:116-130](../src/extension.ts#L116-L130)

- Reads configuration from `~/.deepcode/settings.json`
- Returns null if file doesn't exist or is invalid

```typescript
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
```

##### `getWebviewHtml()`

**Location**: [extension.ts:132-386](../src/extension.ts#L132-L386)

- Generates complete HTML for the chat interface
- Includes CSS styling and JavaScript logic
- Implements CSP (Content Security Policy) for security

---

## Webview Communication Architecture

The extension uses VS Code's Webview API for bidirectional communication between the extension backend and the UI frontend.

### Communication Flow Overview

1. **Frontend → Backend**: User interactions trigger backend processing
2. **Backend → Frontend**: Backend sends responses to update the UI

### Frontend → Backend: Triggering `handlePrompt()`

#### 📤 Frontend Sends Message

**Location**: [extension.ts:364](../src/extension.ts#L364)

```javascript
function sendPrompt() {
  const text = promptInput.value.trim();
  if (!text || sendButton.disabled) {
    return;
  }

  addBubble(text, "user");
  promptInput.value = "";
  vscode.postMessage({ type: "userPrompt", prompt: text });  // ← Send message
}
```

- `vscode.postMessage()` sends messages to the extension backend
- Message format: `{ type: "userPrompt", prompt: "user input" }`

#### 📥 Backend Receives Message

**Location**: [extension.ts:46-55](../src/extension.ts#L46-L55)

```typescript
webviewView.webview.onDidReceiveMessage(async (message) => {
  if (message?.type === "userPrompt") {  // ← Check message type
    const prompt = String(message.prompt || "").trim();
    if (!prompt) {
      return;
    }

    await this.handlePrompt(prompt);  // ← Trigger handlePrompt()
  }
});
```

- `webview.onDidReceiveMessage()` listens for messages from webview
- Calls `handlePrompt()` when receiving `userPrompt` type

### Backend → Frontend: Updating UI

#### 📤 Backend Sends Message

**Location**: [extension.ts:84](../src/extension.ts#L84), [extension.ts:92](../src/extension.ts#L92)

```typescript
// Send AI response
webview.postMessage({ type: "assistant", html });

// Send loading state
webview.postMessage({ type: "loading", value: false });
```

#### 📥 Frontend Receives Message

**Location**: [extension.ts:375-382](../src/extension.ts#L375-L382)

```javascript
window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "assistant") {
    addBubble(message.html || "", "assistant");  // ← Display AI response
  } else if (message.type === "loading") {
    setLoading(Boolean(message.value));  // ← Update loading state
  }
});
```

#### 🎨 UI Update Functions

**Location**: [extension.ts:339-349](../src/extension.ts#L339-L349)

```javascript
function addBubble(content, role) {
  const bubble = document.createElement("div");
  bubble.className = "bubble " + role;
  if (role === "assistant") {
    bubble.innerHTML = content;  // ← AI response (HTML)
  } else {
    bubble.textContent = content;  // ← User message (text)
  }
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}
```

**Location**: [extension.ts:351-354](../src/extension.ts#L351-L354)

```javascript
function setLoading(isLoading) {
  loading.classList.toggle("active", isLoading);
  sendButton.disabled = isLoading;
}
```

### Complete Message Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                  User Clicks Send Button                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Webview (Frontend JavaScript)                               │
│  vscode.postMessage({ type: "userPrompt", prompt: text })   │
└─────────────────────────────────────────────────────────────┘
                              ↓ (Cross-process communication)
┌─────────────────────────────────────────────────────────────┐
│  Extension Host (Backend TypeScript)                         │
│  webview.onDidReceiveMessage((message) => {                 │
│    if (message.type === "userPrompt") {                     │
│      handlePrompt(message.prompt)  ← Trigger handler        │
│    }                                                         │
│  })                                                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  handlePrompt() calls OpenAI API                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Extension Host                                              │
│  webview.postMessage({ type: "assistant", html })           │
└─────────────────────────────────────────────────────────────┘
                              ↓ (Cross-process communication)
┌─────────────────────────────────────────────────────────────┐
│  Webview (Frontend JavaScript)                               │
│  window.addEventListener("message", (event) => {            │
│    if (event.data.type === "assistant") {                   │
│      addBubble(event.data.html, "assistant")  ← Update DOM   │
│    }                                                         │
│  })                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Message Types Reference

#### Frontend → Backend

| Type | Payload | Description |
|------|---------|-------------|
| `userPrompt` | `{ prompt: string }` | User submits a prompt to the AI |

#### Backend → Frontend

| Type | Payload | Description |
|------|---------|-------------|
| `assistant` | `{ html: string }` | AI response in HTML format |
| `loading` | `{ value: boolean }` | Loading state indicator |

### Security Features

- Webview runs in a sandboxed environment
- `vscode` object acquired via `acquireVsCodeApi()` ([extension.ts:333](../src/extension.ts#L333))
- CSP (Content Security Policy) restricts script execution ([extension.ts:140](../src/extension.ts#L140))

---

## Data Flow

```
User Input
  ↓
Webview sends "userPrompt" message
  ↓
handlePrompt() processes request
  ↓
Create OpenAI client
  ↓
Call chat.completions.create()
  ↓
Render response as Markdown HTML
  ↓
Send "assistant" message to Webview
  ↓
Display in chat interface
```

---

## Configuration

### Settings File

**Location**: `~/.deepcode/settings.json`

```json
{
  "env": {
    "API_KEY": "your-api-key",
    "BASE_URL": "https://api.openai.com/v1",  // Optional
    "MODEL": "gpt-4o-mini"  // Optional, defaults to gpt-4o-mini
  }
}
```

### Configuration Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `API_KEY` | string | Yes | - | OpenAI API key or compatible service key |
| `BASE_URL` | string | No | OpenAI default | Custom API endpoint URL |
| `MODEL` | string | No | `gpt-4o-mini` | Model identifier to use |

### Example Configurations

#### OpenAI

```json
{
  "env": {
    "API_KEY": "sk-xxxxxxxxxxxx",
    "MODEL": "gpt-4o"
  }
}
```

#### Azure OpenAI

```json
{
  "env": {
    "API_KEY": "your-azure-key",
    "BASE_URL": "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
    "MODEL": "gpt-4"
  }
}
```

#### Self-Hosted (e.g., LocalAI)

```json
{
  "env": {
    "API_KEY": "not-needed",
    "BASE_URL": "http://localhost:8080/v1",
    "MODEL": "gpt-3.5-turbo"
  }
}
```

---

## Dependencies

From [package.json](../package.json):

### Runtime Dependencies

1. **openai** (v4.80.0)
   - OpenAI SDK for API calls
   - Supports custom base URLs for compatibility

2. **markdown-it** (v14.1.0)
   - Markdown parser and renderer
   - Converts AI responses to HTML

### Development Dependencies

1. **@types/vscode** (v1.85.0)
   - TypeScript definitions for VS Code API

2. **@types/markdown-it** (v14.1.1)
   - TypeScript definitions for markdown-it

3. **@types/node** (v20.12.7)
   - Node.js type definitions

4. **typescript** (v5.4.5)
   - TypeScript compiler

---

## UI Design

### Theme

- **Dark Theme**: Deep blue/purple gradient background
- **Color Palette**:
  - Background: `#0f1222`
  - Panels: `#151a2e`, `#1d2340`
  - Text: `#f5f7ff`
  - Accent: `#5bd0ff` (cyan), `#7cffc4` (mint)
  - Danger: `#ff7a8a`

### Layout

```
┌────────────────────────────┐
│ DEEP CODE (header)         │
├────────────────────────────┤
│                            │
│  ┌──────────────────────┐  │
│  │ User message        │  │  ← User bubble (right aligned)
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ AI response         │  │  ← Assistant bubble (left aligned)
│  │ with **markdown**   │  │
│  └──────────────────────┘  │
│                            │
│  [●] Thinking...           │  ← Loading indicator
├────────────────────────────┤
│ ┌────────────────────────┐ │
│ │ Write a prompt...      │ │  ← Textarea input
│ │                    [→] │ │  ← Send button
│ └────────────────────────┘ │
└────────────────────────────┘
```

### Features

- **Chat Bubbles**: Distinct styling for user vs assistant messages
- **Code Highlighting**: Syntax highlighting in code blocks
- **Loading State**: Animated spinner during API calls
- **Auto-Scroll**: Automatically scrolls to newest message
- **Keyboard Shortcut**: `Cmd/Ctrl + Enter` to send message

### CSS Highlights

**Location**: [extension.ts:143-309](../src/extension.ts#L143-L309)

- Gradient backgrounds with `radial-gradient`
- Box shadows with RGBA transparency
- Smooth animations for loading spinner
- Responsive textarea with focus states
- Modern border radius and spacing

---

## Example Flow

1. User types "What is TypeScript?" and clicks send
2. Frontend calls `vscode.postMessage({ type: "userPrompt", prompt: "What is TypeScript?" })`
3. Backend receives message via `onDidReceiveMessage` listener
4. Backend calls `handlePrompt("What is TypeScript?")`
5. Backend sends loading state: `webview.postMessage({ type: "loading", value: true })`
6. Frontend shows loading spinner
7. Backend calls OpenAI API and receives response
8. Backend converts response to HTML using markdown-it
9. Backend sends response: `webview.postMessage({ type: "assistant", html: "<p>...</p>" })`
10. Backend sends loading state: `webview.postMessage({ type: "loading", value: false })`
11. Frontend hides loading spinner and displays AI response bubble

---

## Summary

Deep Code is a streamlined VS Code extension that demonstrates:

- **Simple architecture**: Single-file implementation
- **Webview communication**: Bidirectional messaging pattern
- **API flexibility**: OpenAI-compatible endpoint support
- **Modern UI**: Polished chat interface with animations
- **Type safety**: Full TypeScript implementation

The extension serves as an excellent reference for building VS Code AI assistants with custom backends.
