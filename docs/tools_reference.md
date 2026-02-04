
# Built-in Tools Reference

## Table of Contents#

Open Table of Contents

## 1. Task#

**Purpose**: Launch specialized sub-agents for complex, multi-step tasks that require autonomous work.

**Available Agent Types**:

-   `general-purpose`: Research, code search, multi-step tasks (has access to all tools)
-   `statusline-setup`: Configure status line settings (Read, Edit)
-   `output-style-setup`: Create output styles (Read, Write, Edit, Glob, Grep)

**Parameters**:

-   `subagent_type`  (required): Which agent type to use
-   `prompt`  (required): Detailed task description for the agent
-   `description`  (required): Short 3-5 word description of the task

**When to Use**:

-   Complex tasks requiring multiple rounds of searching/reading
-   When you need an agent to work autonomously
-   Open-ended research tasks

**When NOT to Use**:

-   Reading a specific known file path (use Read instead)
-   Searching within 2-3 specific files (use Read instead)
-   Searching for specific class definitions (use Glob instead)

**Example**:

```
{
  "subagent_type": "general-purpose",
  "description": "Find authentication implementation",
  "prompt": "Search the codebase to find where user authentication is implemented. Look for login functions, JWT handling, and session management. Return the file paths and a summary of how authentication works."
}
```

**Key Notes**:

-   Launch multiple agents concurrently when possible (single message, multiple tool calls)
-   Agent returns one final message - cannot communicate back and forth
-   Agents are stateless - provide complete instructions upfront
-   Specify whether agent should write code or just research

----------

## 2. Bash#

**Purpose**: Execute shell commands in a persistent bash session.

**Parameters**:

-   `command`  (required): The shell command to execute
-   `description`  (optional but recommended): Clear 5-10 word description
-   `timeout`  (optional): Milliseconds before timeout (default: 120000ms, max: 600000ms)
-   `run_in_background`  (optional): Boolean to run command in background

**When to Use**:

-   Terminal operations: git, npm, docker, pytest, etc.
-   Commands that modify system state
-   Running builds, tests, servers

**When NOT to Use**:

-   File reading (use Read instead of cat/head/tail)
-   File editing (use Edit instead of sed/awk)
-   File writing (use Write instead of echo >)
-   File searching (use Glob instead of find/ls)
-   Content searching (use Grep instead of grep/rg)

**Examples**:

Basic command:

```
{
  "command": "git status",
  "description": "Check git repository status"
}
```

With timeout:

```
{
  "command": "npm run build",
  "description": "Build production bundle",
  "timeout": 300000
}
```

Background process:

```
{
  "command": "npm run dev",
  "description": "Start development server",
  "run_in_background": true
}
```

Chained commands (sequential with &&):

```
{
  "command": "git add . && git commit -m \"Update features\" && git push",
  "description": "Stage, commit, and push changes"
}
```

Command with paths containing spaces:

```
{
  "command": "cd \"/path/with spaces/\" && ls",
  "description": "List files in directory with spaces"
}
```

**Git Commit Best Practices**:

1.  Run  `git status`,  `git diff`, and  `git log`  in parallel
2.  Draft commit message following repo style
3.  Add files and commit with co-authorship footer:

```
git commit -m "$(cat <<'EOF'
Your commit message here.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Pull Request Creation**:

1.  Run  `git status`,  `git diff`, and  `git log [base-branch]...HEAD`  in parallel
2.  Draft PR summary from ALL commits (not just latest)
3.  Push and create PR:

```
gh pr create --title "PR title" --body "$(cat <<'EOF'
## Summary
- Bullet point 1
- Bullet point 2

## Test plan
- [ ] Test item 1
- [ ] Test item 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

----------

## 3. Glob#

**Purpose**: Fast file pattern matching for finding files by name patterns.

**Parameters**:

-   `pattern`  (required): Glob pattern to match files
-   `path`  (optional): Directory to search in (defaults to current working directory)

**Pattern Examples**:

-   `**/*.js`  - All JavaScript files recursively
-   `src/**/*.ts`  - All TypeScript files in src/
-   `*.{json,yaml}`  - All JSON and YAML files in current directory
-   `test/**/*test.js`  - All test files

**Examples**:

Find all TypeScript files:

```
{
  "pattern": "**/*.ts"
}
```

Find config files in specific directory:

```
{
  "pattern": "*.config.{js,ts}",
  "path": "/Users/project/root"
}
```

Find React components:

```
{
  "pattern": "src/components/**/*.tsx"
}
```

**Key Notes**:

-   Returns files sorted by modification time
-   Works with any codebase size
-   Faster than bash find command
-   Use for open-ended searches with Agent tool

----------

## 4. Grep#

**Purpose**: Powerful content search built on ripgrep for finding text/code patterns in files.

**Parameters**:

-   `pattern`  (required): Regular expression to search for
-   `path`  (optional): File or directory to search (defaults to current directory)
-   `output_mode`  (optional): “content” (lines), “files_with_matches” (paths), “count” (counts)
-   `glob`  (optional): Filter files by glob pattern (e.g., “*.js”)
-   `type`  (optional): Filter by file type (e.g., “js”, “py”, “rust”)
-   `-A`  (optional): Lines to show after match (requires output_mode: “content”)
-   `-B`  (optional): Lines to show before match (requires output_mode: “content”)
-   `-C`  (optional): Lines to show before and after match (requires output_mode: “content”)
-   `-i`  (optional): Case insensitive search (boolean)
-   `-n`  (optional): Show line numbers (requires output_mode: “content”)
-   `multiline`  (optional): Enable multiline matching where . matches newlines (boolean)
-   `head_limit`  (optional): Limit output to first N results

**Pattern Syntax**:

-   Uses ripgrep (not grep)
-   Literal braces need escaping:  `interface\\{\\}`  to find  `interface{}`
-   Standard regex:  `log.*Error`,  `function\\s+\\w+`

**Examples**:

Find files containing pattern:

```
{
  "pattern": "function authenticate",
  "output_mode": "files_with_matches"
}
```

Show matching lines with context:

```
{
  "pattern": "TODO",
  "output_mode": "content",
  "-n": true,
  "-C": 2
}
```

Case-insensitive search in TypeScript files:

```
{
  "pattern": "errorhandler",
  "-i": true,
  "type": "ts",
  "output_mode": "content"
}
```

Count occurrences:

```
{
  "pattern": "console\\.log",
  "output_mode": "count"
}
```

Search with glob filter:

```
{
  "pattern": "import.*React",
  "glob": "*.tsx",
  "output_mode": "content"
}
```

Multiline pattern matching:

```
{
  "pattern": "struct \\{[\\s\\S]*?field",
  "multiline": true,
  "output_mode": "content"
}
```

Limited results:

```
{
  "pattern": "export function",
  "output_mode": "content",
  "head_limit": 10
}
```

----------

## 5. Read, 6. Edit, 7. Write#

### Read#

**Purpose**: Read files from the filesystem.

**Parameters**:

-   `file_path`  (required): Absolute path to file
-   `offset`  (optional): Line number to start reading from
-   `limit`  (optional): Number of lines to read

**Supported File Types**:

-   Text files
-   Images (PNG, JPG) - displayed visually
-   PDFs - processed page by page
-   Jupyter notebooks (.ipynb) - all cells with outputs

**Examples**:

Read entire file:

```
{
  "file_path": "/Users/vivektrivedy/Desktop/personal_website/vtrivedy_website/src/config.ts"
}
```

Read specific line range:

```
{
  "file_path": "/path/to/large/file.log",
  "offset": 1000,
  "limit": 100
}
```

Read image:

```
{
  "file_path": "/var/folders/tmp/Screenshot.png"
}
```

**Key Notes**:

-   Returns content with line numbers (cat -n format)
-   Lines longer than 2000 characters are truncated
-   Default reads up to 2000 lines from start
-   Batch multiple Read calls in one response for performance

----------

### Edit#

**Purpose**: Perform exact string replacements in files.

**Parameters**:

-   `file_path`  (required): Absolute path to file
-   `old_string`  (required): Exact text to replace
-   `new_string`  (required): Replacement text (must differ from old_string)
-   `replace_all`  (optional): Replace all occurrences (default: false)

**Requirements**:

-   MUST read file with Read tool first
-   `old_string`  must be unique in file (unless using  `replace_all`)
-   Preserve exact indentation from Read output (exclude line number prefix)

**Line Number Prefix Format**:

```
[spaces][line_number][tab][actual_content]
```

Only include  `[actual_content]`  in old_string/new_string.

**Examples**:

Simple replacement:

```
{
  "file_path": "/path/to/file.ts",
  "old_string": "const port = 3000;",
  "new_string": "const port = 4321;"
}
```

Multi-line replacement:

```
{
  "file_path": "/path/to/component.tsx",
  "old_string": "export default function Header() {\n  return <h1>Old Title</h1>;\n}",
  "new_string": "export default function Header() {\n  return <h1>New Title</h1>;\n}"
}
```

Replace all occurrences (renaming):

```
{
  "file_path": "/path/to/file.ts",
  "old_string": "oldFunctionName",
  "new_string": "newFunctionName",
  "replace_all": true
}
```

**Common Mistakes to Avoid**:

-   ❌ Including line numbers in old_string:  `"25\tconst x = 5;"`
-   ✅ Correct:  `"const x = 5;"`
-   ❌ Wrong indentation:  `" function foo()"`  when file has tabs
-   ✅ Match exact whitespace from Read output

----------

### Write#

**Purpose**: Write or overwrite files.

**Parameters**:

-   `file_path`  (required): Absolute path to file
-   `content`  (required): Complete file content

**Requirements**:

-   For existing files: MUST read with Read tool first
-   Prefer Edit over Write for existing files
-   Only create new files when absolutely necessary

**Examples**:

Create new file:

```
{
  "file_path": "/path/to/new/file.ts",
  "content": "export const API_URL = 'https://api.example.com';\n"
}
```

Overwrite existing file:

```
{
  "file_path": "/path/to/existing/config.json",
  "content": "{\n  \"version\": \"2.0\",\n  \"enabled\": true\n}\n"
}
```

----------

## 8. NotebookEdit#

**Purpose**: Edit Jupyter notebook (.ipynb) cells.

**Parameters**:

-   `notebook_path`  (required): Absolute path to notebook
-   `new_source`  (required): New cell content
-   `cell_id`  (optional): ID of cell to edit (for insert: new cell inserted after this ID)
-   `cell_type`  (optional): “code” or “markdown” (required for insert mode)
-   `edit_mode`  (optional): “replace” (default), “insert”, “delete”

**Examples**:

Replace cell content:

```
{
  "notebook_path": "/path/to/notebook.ipynb",
  "cell_id": "abc123",
  "new_source": "import pandas as pd\ndf = pd.read_csv('data.csv')\ndf.head()"
}
```

Insert new code cell:

```
{
  "notebook_path": "/path/to/notebook.ipynb",
  "cell_id": "xyz789",
  "cell_type": "code",
  "edit_mode": "insert",
  "new_source": "# New analysis step\nresult = df.groupby('category').sum()"
}
```

Delete cell:

```
{
  "notebook_path": "/path/to/notebook.ipynb",
  "cell_id": "def456",
  "edit_mode": "delete",
  "new_source": ""
}
```

----------

## 9. WebFetch, 10. WebSearch#

### WebFetch#

**Purpose**: Fetch and process web content with AI analysis.

**Parameters**:

-   `url`  (required): Fully-formed valid URL
-   `prompt`  (required): What information to extract from the page

**Features**:

-   Converts HTML to markdown
-   Auto-upgrades HTTP to HTTPS
-   15-minute cache for repeated requests
-   Handles redirects (requires new request with redirect URL)

**Examples**:

Fetch documentation:

```
{
  "url": "https://docs.astro.build/en/getting-started/",
  "prompt": "Extract the commands needed to create a new Astro project and start the dev server"
}
```

Analyze article:

```
{
  "url": "https://example.com/blog/best-practices",
  "prompt": "Summarize the key best practices mentioned in this article"
}
```

Check API reference:

```
{
  "url": "https://api-docs.example.com/v2/authentication",
  "prompt": "What are the authentication methods supported and their required parameters?"
}
```

**Key Notes**:

-   Prefer MCP-provided web fetch tools if available (start with “mcp__”)
-   Read-only operation
-   Results may be summarized for large content
-   When redirected to different host, make new request with redirect URL

----------

### WebSearch#

**Purpose**: Search the web for current information beyond Claude’s knowledge cutoff.

**Parameters**:

-   `query`  (required): Search query string (min 2 characters)
-   `allowed_domains`  (optional): Array of domains to include
-   `blocked_domains`  (optional): Array of domains to exclude

**Availability**: US only

**Examples**:

Basic search:

```
{
  "query": "Astro 4.0 new features 2025"
}
```

Search specific domains:

```
{
  "query": "TypeScript best practices",
  "allowed_domains": ["typescript-lang.org", "github.com"]
}
```

Exclude domains:

```
{
  "query": "React hooks tutorial",
  "blocked_domains": ["pinterest.com", "youtube.com"]
}
```

**Key Notes**:

-   Consider current date when forming queries
-   Returns search result blocks
-   Use for information beyond January 2025 knowledge cutoff

----------

## 11. TodoWrite#

**Purpose**: Create and manage structured task lists for tracking progress.

**Parameters**:

-   `todos`  (required): Array of todo objects with:
    -   `content`  (required): Imperative form (e.g., “Run tests”)
    -   `activeForm`  (required): Present continuous form (e.g., “Running tests”)
    -   `status`  (required): “pending”, “in_progress”, or “completed”

**When to Use**:

-   Complex multi-step tasks (3+ steps)
-   Non-trivial complex tasks requiring planning
-   User explicitly requests todo list
-   User provides multiple tasks
-   After receiving new instructions (capture requirements)
-   When starting work (mark as in_progress BEFORE beginning)
-   After completing tasks (mark completed, add follow-ups)

**When NOT to Use**:

-   Single straightforward task
-   Trivial tasks providing no organizational benefit
-   Tasks completable in <3 trivial steps
-   Purely conversational/informational requests

**Critical Rules**:

-   EXACTLY ONE task must be “in_progress” at any time
-   Mark tasks completed IMMEDIATELY after finishing (no batching)
-   Only mark completed when FULLY accomplished
-   Keep task in_progress if: tests failing, implementation partial, unresolved errors, missing dependencies
-   Remove irrelevant tasks entirely

**Examples**:

Create initial todo list:

```
{
  "todos": [
    {
      "content": "Search codebase for authentication logic",
      "activeForm": "Searching codebase for authentication logic",
      "status": "in_progress"
    },
    {
      "content": "Implement OAuth2 flow",
      "activeForm": "Implementing OAuth2 flow",
      "status": "pending"
    },
    {
      "content": "Add authentication tests",
      "activeForm": "Adding authentication tests",
      "status": "pending"
    }
  ]
}
```

Update progress:

```
{
  "todos": [
    {
      "content": "Search codebase for authentication logic",
      "activeForm": "Searching codebase for authentication logic",
      "status": "completed"
    },
    {
      "content": "Implement OAuth2 flow",
      "activeForm": "Implementing OAuth2 flow",
      "status": "in_progress"
    },
    {
      "content": "Add authentication tests",
      "activeForm": "Adding authentication tests",
      "status": "pending"
    }
  ]
}
```

----------

## 12. ExitPlanMode#

**Purpose**: Exit plan mode after presenting an implementation plan.

**Parameters**:

-   `plan`  (required): The implementation plan (supports markdown)

**When to Use**:

-   ONLY for tasks requiring code implementation planning
-   After finishing planning implementation steps

**When NOT to Use**:

-   Research tasks (gathering information, searching, reading, understanding codebase)

**Example**:

```
{
  "plan": "## Implementation Plan\n\n1. Create authentication middleware in `src/middleware/auth.ts`\n2. Add JWT verification logic\n3. Protect API routes with middleware\n4. Add tests for authentication flow\n\nShall I proceed with this plan?"
}
```

----------

## 13. BashOutput, 14. KillShell#

### BashOutput#

**Purpose**: Retrieve output from running or completed background bash shells.

**Parameters**:

-   `bash_id`  (required): ID of the background shell
-   `filter`  (optional): Regular expression to filter output lines

**Returns**:

-   Only new output since last check
-   stdout and stderr
-   Shell status

**Example**:

```
{
  "bash_id": "shell_12345",
  "filter": "ERROR|WARN"
}
```

**Key Notes**:

-   Find shell IDs with  `/bashes`  command
-   Filtered lines are consumed (no longer available to read)

----------

### KillShell#

**Purpose**: Terminate a running background bash shell.

**Parameters**:

-   `shell_id`  (required): ID of shell to terminate

**Example**:

```
{
  "shell_id": "shell_12345"
}
```

----------

## 15. SlashCommand#

**Purpose**: Execute slash commands within the conversation.

**Parameters**:

-   `command`  (required): Slash command with arguments (e.g., “/review-pr 123”)

**Restrictions**:

-   Only available commands can be executed
-   Don’t use if command with same name is already running
-   Check command-message tags for running status

**Example**:

----------

## Tool Usage Patterns & Best Practices#

### Batch Operations#

**Always batch independent tool calls in a single response for optimal performance.**

Example - Multiple file reads:

```
Call Read on file1.ts, file2.ts, file3.ts in single message
```

Example - Parallel git commands:

```
Call Bash("git status") and Bash("git diff") in single message
```

### File Operations Workflow#

1.  **Search for files**: Use Glob (not find/ls)
2.  **Search content**: Use Grep (not bash grep/rg)
3.  **Read files**: Use Read (not cat/head/tail)
4.  **Edit files**: Use Edit (not sed/awk)
5.  **Write files**: Use Write (not echo >/heredoc)

### Complex Task Workflow#

1.  Use TodoWrite to plan and track tasks
2.  Use Task agent for multi-step research
3.  Use Bash for terminal operations only
4.  Batch independent operations together
5.  Mark todos completed immediately after finishing

### Background Process Management#

1.  Start process:  `Bash`  with  `run_in_background: true`
2.  Monitor output:  `BashOutput`  with bash_id
3.  Filter if needed: Use  `filter`  parameter with regex
4.  Terminate when done:  `KillShell`  with shell_id

### Searching Strategy#

-   **Known file paths**: Use Read directly
-   **File name patterns**: Use Glob
-   **Content in specific files**: Read then search locally
-   **Content across codebase**: Use Grep
-   **Complex multi-round search**: Use Task with general-purpose agent

### Communication#

-   Output text directly to user (not bash echo)
-   Use markdown formatting for readability
-   Include file references as links:  `[filename.ts](src/filename.ts)`  or  `[filename.ts:42](src/filename.ts#L42)`
-   Be concise and direct (avoid preamble/postamble)

----------

## Examples: Complete Workflows#

### Workflow 1: Add New Feature#

```
1. TodoWrite: Plan the feature tasks
2. Grep: Find related existing implementations
3. Read: Read relevant files (batch multiple)
4. Edit: Modify existing files (or Write for new files)
5. Bash: Run tests
6. TodoWrite: Mark tasks completed
7. Bash: Commit changes (if requested)
```

### Workflow 2: Debug Issue#

```
1. TodoWrite: Create debugging task list
2. Grep: Search for error messages/patterns
3. Read: Read files with issues (batch multiple)
4. Bash: Run failing tests/reproduce issue
5. Edit: Apply fixes
6. Bash: Verify fix with tests
7. TodoWrite: Mark completed
```

### Workflow 3: Research Codebase#

```
1. Task: Launch general-purpose agent with research prompt
   (Agent will autonomously use Grep, Glob, Read to explore)
2. Agent returns findings
3. Present summary to user
```

### Workflow 4: Refactor Code#

```
1. TodoWrite: Break down refactoring tasks
2. Grep: Find all occurrences of code to refactor
3. Read: Read affected files (batch multiple)
4. Edit: Apply refactoring with replace_all for renames
5. Bash: Run tests and type checking
6. TodoWrite: Mark tasks completed
```

----------

## Tool Selection Quick Reference#

Task

Use This Tool

NOT This

Find files by name

Glob

Bash(find/ls)

Search content

Grep

Bash(grep/rg)

Read file

Read

Bash(cat/head/tail)

Edit file

Edit

Bash(sed/awk)

Create file

Write

Bash(echo >)

Run tests/builds

Bash

N/A

Multi-step research

Task

Multiple manual searches

Track complex tasks

TodoWrite

Comments/memory

Fetch web content

WebFetch

Bash(curl)

Search web

WebSearch

WebFetch with search engine

Background process

Bash(run_in_background) + BashOutput

Bash with &

----------

## Common Antipatterns to Avoid#

❌  **Don’t**: Use bash for file operations

✅  **Do**: Use Read tool

```
{"file_path": "src/config.ts"}
```

❌  **Don’t**: Use echo for communication

```
echo "Now processing files..."
```

✅  **Do**: Output text directly to user

❌  **Don’t**: Make sequential tool calls when independent

```
Call Read on file1, wait, then Read on file2, wait, then Read on file3
```

✅  **Do**: Batch independent calls

```
Call Read on file1, file2, file3 in single message
```

❌  **Don’t**: Forget to use TodoWrite for complex tasks

```
Start working without planning
```

✅  **Do**: Plan first with TodoWrite

❌  **Don’t**: Mark todos completed before actually finishing

```
{"status": "completed"} // but tests are failing
```

✅  **Do**: Only mark completed when fully done

```
{"status": "in_progress"} // keep working until tests pass
```
