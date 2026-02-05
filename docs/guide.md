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

**Deep Code** is a VS Code extension that provides a sidebar AI chat interface with persistent sessions, tool execution, and OpenAI-compatible model support.

### Key Characteristics

- Multi-file architecture with a dedicated session manager
- Webview-based chat UI with HTML/CSS templates under `resources/`
- Persistent sessions stored under `~/.deepcode/projects/<projectCode>/`
- Tool execution pipeline (bash/read/write/edit)
- OpenAI-compatible API client (OpenAI, Azure OpenAI, or self-hosted)

---

## Features

1. **Sessioned Chat** - Multiple conversations with history and status
2. **OpenAI Compatible** - Works with OpenAI, Azure OpenAI, and compatible APIs
3. **Markdown Rendering** - AI responses rendered via markdown-it
4. **Tool Calls** - Supports `bash`, `read`, `write`, and `edit` tool execution
5. **Interrupt** - Stop active sessions from the UI
6. **Persistent Storage** - Sessions and messages stored on disk

---

## Code Structure

```
deepcode/
├── src/
│   ├── extension.ts          # VS Code activation + webview wiring
│   ├── session.ts            # Session manager and persistence
│   └── tools/                # Tool execution pipeline
│       ├── executor.ts
│       ├── bash-handler.ts
│       ├── read-handler.ts
│       ├── write-handler.ts
│       └── edit-handler.ts
├── resources/
│   ├── webview.html          # UI template
│   ├── webview.css           # UI styles
│   └── deepcoding_icon.png
├── docs/
│   └── guide.md
├── package.json
└── tsconfig.json
```

---

## Entry Points

### 1. Extension Activation

**Location**: `src/extension.ts`

- Registers `DeepcodingViewProvider` for the sidebar view
- View type: `"deepcoding.chatView"`

### 2. Extension Deactivation

**Location**: `src/extension.ts`

- Currently a no-op

---

## Core Components

### DeepcodingViewProvider

**Location**: `src/extension.ts`

Responsible for:

- Webview initialization and message handling
- Bridging UI events to `SessionManager`
- Sending rendered HTML responses to the UI

### SessionManager

**Location**: `src/session.ts`

Responsible for:

- Session creation, updates, and persistence
- Building OpenAI message payloads
- Tool-call loop execution and message appends
- Status tracking (`pending`, `processing`, `completed`, `failed`, `interrupted`)

Storage layout:

- `~/.deepcode/projects/<projectCode>/sessions-index.json`
- `~/.deepcode/projects/<projectCode>/<sessionId>.jsonl`

### ToolExecutor

**Location**: `src/tools/executor.ts`

Responsible for:

- Parsing tool calls from model responses
- Executing tool handlers (`bash`, `read`, `write`, `edit`)
- Formatting tool results into JSON strings for tool messages

---

## Webview Communication Architecture

The extension uses VS Code's Webview API for bidirectional communication between the extension backend and the UI frontend.

### Frontend → Backend Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `ready` | `{}` | Webview signals it is ready to receive data |
| `userPrompt` | `{ prompt: string }` | User submits a prompt |
| `interrupt` | `{}` | Interrupt the active session |
| `createNewSession` | `{}` | Start a new session |
| `selectSession` | `{ sessionId: string }` | Load a specific session |
| `backToList` | `{}` | Return to session list view |

### Backend → Frontend Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `initializeEmpty` | `{ sessions, status }` | Empty view with session list |
| `loadSession` | `{ sessionId, summary, status, sessions, messages }` | Load a session with messages |
| `showSessionsList` | `{ sessions }` | Update session list |
| `userMessage` | `{ html }` | Rendered user message |
| `assistant` | `{ html }` | Rendered assistant message |
| `loading` | `{ value: boolean }` | Toggle loading state |

### Communication Flow Overview

1. Webview sends `ready` and receives initial session data
2. User submits prompt (`userPrompt`)
3. Backend renders user message and calls `SessionManager.handleUserPrompt`
4. SessionManager builds messages, calls OpenAI, executes tools if needed
5. Backend streams assistant HTML updates to the webview
6. UI updates loading state and session list

---

## Data Flow

```
User Input
  ↓
Webview sends "userPrompt"
  ↓
SessionManager create/reply session
  ↓
Build OpenAI messages from session history
  ↓
Call chat.completions.create()
  ↓
Append assistant message
  ↓
If tool calls exist: execute tools, append tool messages, loop (bounded)
  ↓
Update session status and notify UI
```

---

## Configuration

### Settings File

**Location**: `~/.deepcode/settings.json`

```json
{
  "env": {
    "API_KEY": "your-api-key",
    "BASE_URL": "https://api.openai.com/v1",
    "MODEL": "gpt-4o-mini"
  }
}
```

### Configuration Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `API_KEY` | string | Yes | - | OpenAI API key or compatible service key |
| `BASE_URL` | string | No | OpenAI default | Custom API endpoint URL |
| `MODEL` | string | No | `gpt-4o-mini` | Model identifier to use |

---

## Dependencies

From `package.json`:

### Runtime Dependencies

1. **openai**
   - OpenAI SDK for API calls
   - Supports custom base URLs for compatibility

2. **markdown-it**
   - Markdown parser and renderer
   - Converts AI responses to HTML

### Development Dependencies

1. **@types/vscode**
   - TypeScript definitions for VS Code API

2. **@types/markdown-it**
   - TypeScript definitions for markdown-it

3. **@types/node**
   - Node.js type definitions

4. **typescript**
   - TypeScript compiler

---

## UI Design

### Theme

- Dark theme with gradient background
- Distinct user vs assistant message bubbles
- Loading indicator for in-progress requests

### UI Assets

- HTML template: `resources/webview.html`
- CSS styles: `resources/webview.css`

### Behaviors

- Auto-scrolls to newest messages
- Keyboard shortcut: `Cmd/Ctrl + Enter` to send
- Session list and session switching

### Assistant Message Bubble Types

- `role === "user"`: normal user bubble
- `role === "assistant"` and `meta.asThinking !== true`: normal assistant bubble; render `content` with Markdown
- `role === "assistant"` and `meta.asThinking === true`: Thinking bubble; show `● Thinking (+)` with collapsed-by-default content; expand to render `content` with Markdown
- `role === "tool"`: Tool bubble; show `● <b>${content.name}</b> ${meta.paramsMd} (+)` and expand to render `meta.resultMd` with Markdown; the dot is green when `content.ok === true`, otherwise red

---

## Summary

Deep Code is a VS Code AI assistant extension with:

- Session-based architecture and persistent storage
- Tool execution pipeline integrated into chat flows
- Webview UI that communicates via structured messages
- OpenAI-compatible API support with minimal dependencies
