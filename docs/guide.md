# Deep Code Extension Guide

Technical guide for the Deep Code VS Code extension as implemented in the current codebase.

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

**Deep Code** is a VS Code sidebar extension that provides a persistent AI chat interface with tool execution, skill loading, and support for DeepSeek defaults as well as OpenAI-compatible APIs.

### Key Characteristics

- Webview-based chat UI with HTML/CSS templates under `resources/`
- Persistent sessions stored under `~/.deepcode/projects/<projectCode>/`
- Tool execution pipeline for `bash`, `read`, `write`, `edit`, and `AskUserQuestion`
- Skill discovery from `~/.agents/skills/` and `./.deepcode/skills/`
- DeepSeek-first defaults with configurable OpenAI-compatible API settings

---

## Features

1. **Sessioned Chat** - Multiple conversations with persisted history and status
2. **Skills** - Discover, select, auto-match, and inject skill documents into a session
3. **Tool Calls** - Supports shell, file operations, and structured user clarification
4. **Markdown Rendering** - Assistant responses are rendered with `markdown-it`
5. **Interrupt** - Stop an active session from the UI
6. **Persistent Storage** - Session index and message history are stored on disk

---

## Code Structure

```text
deepcode/
├── src/
│   ├── extension.ts                 # VS Code activation + webview wiring
│   ├── session.ts                   # Session manager, storage, status, skills
│   ├── prompt.ts                    # System prompt and tool definitions
│   └── tools/
│       ├── executor.ts              # Tool dispatch
│       ├── bash-handler.ts          # Persistent shell execution
│       ├── read-handler.ts          # File, image, notebook, and PDF reads
│       ├── write-handler.ts         # Full-file writes
│       ├── edit-handler.ts          # Scoped replacements
│       ├── ask-user-question-handler.ts
│       └── state.ts                 # Read/snippet tracking for tool safety
├── resources/
│   ├── webview.html                 # Webview markup and frontend logic
│   ├── webview.css                  # Webview styles
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
- Registers the `deepcode.openView` command
- View type: `"deepcode.chatView"`

### 2. Extension Deactivation

**Location**: `src/extension.ts`

- Currently a no-op

---

## Core Components

### DeepcodingViewProvider

**Location**: `src/extension.ts`

Responsible for:

- Webview initialization and backend/frontend message handling
- Creating the OpenAI-compatible client from `~/.deepcode/settings.json`
- Rendering assistant Markdown to HTML before sending it to the UI
- Loading sessions, updating session status, and sending skill lists

### SessionManager

**Location**: `src/session.ts`

Responsible for:

- Session creation, updates, persistence, and active-session tracking
- Building OpenAI chat payloads from session history
- Injecting the system prompt, optional `AGENTS.md` instructions, and selected skills
- Running the tool-call loop and appending assistant/tool/system messages
- Status tracking (`pending`, `processing`, `waiting_for_user`, `completed`, `failed`, `interrupted`)

Instruction lookup order:

- `./.deepcode/AGENTS.md`
- `~/.deepcode/AGENTS.md`

Storage layout:

- `~/.deepcode/projects/<projectCode>/sessions-index.json`
- `~/.deepcode/projects/<projectCode>/<sessionId>.jsonl`

### ToolExecutor

**Location**: `src/tools/executor.ts`

Responsible for:

- Parsing tool calls from model responses
- Executing tool handlers (`bash`, `read`, `write`, `edit`, `AskUserQuestion`)
- Formatting tool results into JSON strings for tool messages

### Webview Frontend

**Location**: `resources/webview.html`

Responsible for:

- Rendering chat bubbles for user, assistant, system, and tool messages
- Managing session selection, prompt history, and loading state
- Rendering skill selection UI and AskUserQuestion forms

---

## Webview Communication Architecture

The extension uses VS Code's Webview API for bidirectional communication between the extension backend and the UI frontend.

### Frontend -> Backend Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `ready` | `{}` | Webview signals it is ready to receive initial state |
| `requestSkills` | `{}` | Request the currently available skill list |
| `userPrompt` | `{ prompt: string, skills?: SkillInfo[] }` | Submit a prompt with optional selected skills |
| `interrupt` | `{}` | Interrupt the active session |
| `createNewSession` | `{}` | Start a new session |
| `selectSession` | `{ sessionId: string }` | Load a specific session |
| `backToList` | `{}` | Return to the session list view |

### Backend -> Frontend Message Types

| Type | Payload | Description |
|------|---------|-------------|
| `initializeEmpty` | `{ sessions, status }` | Show an empty composer state |
| `loadSession` | `{ sessionId, summary, status, sessions, messages }` | Load a session and its visible messages |
| `showSessionsList` | `{ sessions }` | Refresh the session dropdown data |
| `skillsList` | `{ skills }` | Update the available skill list |
| `sessionStatus` | `{ sessionId, status }` | Update the status of the current session |
| `userMessage` | `{ content }` | Append the raw user text bubble |
| `assistant` | `{ html }` | Append a direct assistant HTML message, typically for failures |
| `appendMessage` | `{ message, shouldConnect }` | Append a structured session message generated during execution |
| `loading` | `{ value: boolean }` | Toggle the loading indicator |

### Communication Flow Overview

1. Webview sends `ready`
2. Backend replies with the latest session or an empty state
3. Webview requests skills with `requestSkills`
4. User submits a prompt through `userPrompt`
5. Backend posts `userMessage`, sets `loading`, and hands off to `SessionManager`
6. `SessionManager` calls the model, appends messages, executes tools, and updates status
7. Backend pushes incremental updates with `appendMessage`, `sessionStatus`, `showSessionsList`, and `skillsList`

---

## Data Flow

```text
User Input
  ↓
Webview sends "userPrompt" with optional selected skills
  ↓
SessionManager creates or updates the session
  ↓
Inject system prompt, optional `AGENTS.md` instructions, and loaded skills
  ↓
Build chat.completions payload from session history
  ↓
Call chat.completions.create()
  ↓
Append assistant message
  ↓
If tool calls exist: execute tools, append tool messages, loop
  ↓
If AskUserQuestion is returned: set status to waiting_for_user
  ↓
Persist state and notify the webview
```

---

## Configuration

### Settings File

**Location**: `~/.deepcode/settings.json`

```json
{
  "env": {
    "API_KEY": "sk-...",
    "BASE_URL": "https://api.deepseek.com",
    "MODEL": "deepseek-reasoner"
  },
  "thinkingEnabled": true,
  "notify": "~/.deepcode/notify.sh"
}
```

### Configuration Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `env.API_KEY` | string | Yes | - | API key for the configured provider |
| `env.BASE_URL` | string | No | `https://api.deepseek.com` | Base URL for a DeepSeek or other OpenAI-compatible endpoint |
| `env.MODEL` | string | No | `deepseek-reasoner` | Model identifier passed to `chat.completions.create()` |
| `thinkingEnabled` | boolean | No | false | Enables the optional `thinking` request field when set to `true` |
| `notify` | string | No | - | Executable script path triggered when a task ends in `completed` or `failed`, with `DURATION` set to the elapsed seconds |

---

## Dependencies

From `package.json`:

### Runtime Dependencies

1. **openai**
   - OpenAI SDK used for chat completion calls
   - Works with DeepSeek defaults and other compatible base URLs

2. **markdown-it**
   - Markdown parser and renderer
   - Converts assistant responses into HTML for the webview

3. **gray-matter**
   - Parses skill frontmatter from `SKILL.md`
   - Used when discovering skill name and description metadata

4. **ignore**
   - Applies `.gitignore`-style matching in the read tool
   - Helps avoid ambiguous or ignored file-path matches

### Development Dependencies

1. **@types/vscode**
   - TypeScript definitions for the VS Code API

2. **@types/markdown-it**
   - TypeScript definitions for `markdown-it`

3. **@types/node**
   - Node.js type definitions

4. **typescript**
   - TypeScript compiler

---

## UI Design

### Theme

- Uses VS Code theme variables rather than a fixed custom theme
- Distinct bubble treatments for user, assistant, system, and tool messages
- Loading indicator for in-progress requests

### UI Assets

- HTML template: `resources/webview.html`
- CSS styles: `resources/webview.css`

### Behaviors

- Auto-scrolls to the newest messages
- `Enter` sends the prompt
- `Shift + Enter` inserts a newline
- `ArrowUp` and `ArrowDown` navigate prompt history when the caret is at the boundary
- Session list, session switching, and new-session creation
- Skill picker in the composer

### Message Bubble Types

- `role === "user"`: plain text user bubble
- `role === "assistant"` and `meta.asThinking !== true`: standard assistant bubble with rendered Markdown HTML
- `role === "assistant"` and `meta.asThinking === true`: collapsible `Thinking` bubble
- `role === "system"` with `meta.skill`: collapsible skill bubble that shows the loaded skill name and description
- `role === "tool"`: collapsible tool bubble with success or error state; `AskUserQuestion` tool output renders an interactive form when the session status is `waiting_for_user`

---

## Summary

Deep Code is a VS Code AI assistant extension with:

- Session-based persistence under `~/.deepcode`
- A webview chat UI driven by structured backend/frontend messages
- DeepSeek-oriented defaults with configurable OpenAI-compatible API access
- Skill discovery and loading for session-specific behavior
- A multi-step tool execution loop including structured user clarification
