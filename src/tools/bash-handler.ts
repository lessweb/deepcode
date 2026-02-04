import { execFile, type ExecFileException } from "child_process";
import { promisify } from "util";
import type { ToolExecutionContext, ToolExecutionResult } from "./executor";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 30000;
const sessionWorkingDirs = new Map<string, string>();

type ToolCommandResult = {
  ok: boolean;
  output: string;
  cwd: string | null;
  exitCode: number | null;
  signal: string | null;
  truncated: boolean;
};

export async function handleBashTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const command = typeof args.command === "string" ? args.command : "";
  if (!command.trim()) {
    return {
      ok: false,
      name: "bash",
      error: "Missing required \"command\" string."
    };
  }

  const startCwd = getSessionCwd(context.sessionId, context.projectRoot);
  const { shellPath, shellArgs, marker } = buildShellCommand(command);

  try {
    const { stdout = "", stderr = "" } = await execFileAsync(shellPath, shellArgs, {
      cwd: startCwd,
      env: process.env,
      maxBuffer: 10 * 1024 * 1024
    });
    const result = buildToolCommandResult(stdout, stderr, marker, 0, null);
    updateSessionCwd(context.sessionId, startCwd, result.cwd);
    return formatResult(result, "bash");
  } catch (error) {
    const execError = error as ExecFileException & { stdout?: string; stderr?: string };
    const stdout = typeof execError.stdout === "string" ? execError.stdout : "";
    const stderr = typeof execError.stderr === "string" ? execError.stderr : "";
    const exitCode = typeof execError.code === "number" ? execError.code : null;
    const signal = typeof execError.signal === "string" ? execError.signal : null;
    const result = buildToolCommandResult(stdout, stderr, marker, exitCode, signal);
    updateSessionCwd(context.sessionId, startCwd, result.cwd);

    const errorMessage = buildErrorMessage(execError, result.exitCode, result.signal);
    return formatResult(
      { ...result, ok: false },
      "bash",
      errorMessage
    );
  }
}

function getSessionCwd(sessionId: string, fallback: string): string {
  return sessionWorkingDirs.get(sessionId) ?? fallback;
}

function updateSessionCwd(sessionId: string, fallback: string, cwd: string | null): void {
  const nextCwd = cwd ?? fallback;
  sessionWorkingDirs.set(sessionId, nextCwd);
}

function buildShellCommand(command: string): {
  shellPath: string;
  shellArgs: string[];
  marker: string;
} {
  const shellPath = resolveShellPath();
  const marker = buildMarker();
  const initCommand = buildShellInitCommand(shellPath);
  const wrappedParts = [];
  if (initCommand) {
    wrappedParts.push(initCommand);
  }
  wrappedParts.push(
    command,
    "__DEEPCODE_STATUS__=$?",
    `printf '%s%s\\n' "${marker}" "$PWD"`,
    "exit $__DEEPCODE_STATUS__"
  );
  const wrappedCommand = wrappedParts.join("; ");
  return { shellPath, shellArgs: ["-lc", wrappedCommand], marker };
}

function resolveShellPath(): string {
  const envShell = process.env.SHELL;
  if (envShell && /\/(bash|zsh)$/.test(envShell)) {
    return envShell;
  }
  return "/bin/bash";
}

function buildShellInitCommand(shellPath: string): string | null {
  if (/\/zsh$/.test(shellPath)) {
    return [
      'ZSHRC="${ZDOTDIR:-$HOME}/.zshrc"',
      'if [ -f "$ZSHRC" ]; then . "$ZSHRC"; fi'
    ].join("; ");
  }
  if (/\/bash$/.test(shellPath)) {
    return [
      'BASHRC="${BASH_ENV:-$HOME/.bashrc}"',
      'if [ -f "$BASHRC" ]; then . "$BASHRC"; fi'
    ].join("; ");
  }
  return null;
}

function buildMarker(): string {
  const token = Math.random().toString(36).slice(2);
  return `__DEEPCODE_PWD__${token}__`;
}

function buildToolCommandResult(
  stdout: string,
  stderr: string,
  marker: string,
  exitCode: number | null,
  signal: string | null
): ToolCommandResult {
  const { output: cleanedStdout, cwd } = stripMarker(stdout, marker);
  const combined = joinOutput(cleanedStdout, stderr);
  const { text, truncated } = truncateOutput(combined);
  return {
    ok: exitCode === null || exitCode === 0,
    output: text,
    cwd,
    exitCode,
    signal,
    truncated
  };
}

function stripMarker(stdout: string, marker: string): { output: string; cwd: string | null } {
  if (!stdout) {
    return { output: "", cwd: null };
  }

  const lines = stdout.split(/\r?\n/);
  let markerIndex = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith(marker)) {
      markerIndex = i;
      break;
    }
  }

  if (markerIndex === -1) {
    return { output: stdout, cwd: null };
  }

  const markerLine = lines[markerIndex];
  const cwd = markerLine.slice(marker.length).trim() || null;
  lines.splice(markerIndex, 1);
  return { output: lines.join("\n"), cwd };
}

function joinOutput(stdout: string, stderr: string): string {
  const trimmedStdout = stdout ?? "";
  const trimmedStderr = stderr ?? "";
  if (trimmedStdout && trimmedStderr) {
    return `${trimmedStdout}\n${trimmedStderr}`;
  }
  return trimmedStdout || trimmedStderr;
}

function truncateOutput(output: string): { text: string; truncated: boolean } {
  if (output.length <= MAX_OUTPUT_CHARS) {
    return { text: output, truncated: false };
  }
  return { text: output.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

function buildErrorMessage(
  error: ExecFileException,
  exitCode: number | null,
  signal: string | null
): string {
  if (signal) {
    return `Command terminated by signal ${signal}.`;
  }
  if (exitCode !== null) {
    return `Command failed with exit code ${exitCode}.`;
  }
  return error.message || "Command failed.";
}

function formatResult(
  result: ToolCommandResult,
  name: string,
  errorMessage?: string
): ToolExecutionResult {
  const metadata: Record<string, unknown> = {
    exitCode: result.exitCode,
    signal: result.signal,
    cwd: result.cwd,
    truncated: result.truncated
  };

  const outputValue = result.output ? result.output : undefined;

  return {
    ok: result.ok,
    name,
    output: outputValue,
    error: errorMessage,
    metadata
  };
}
