import { spawn, type SpawnOptions } from "child_process";

type NotifyChildProcess = {
  once(event: "error", listener: (error: NodeJS.ErrnoException) => void): NotifyChildProcess;
  unref(): void;
};

export type NotifySpawn = (
  command: string,
  args: string[],
  options: Pick<SpawnOptions, "cwd" | "detached" | "env" | "stdio">
) => NotifyChildProcess;

export function formatDurationSeconds(durationMs: number): string {
  const safeMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  return String(Math.floor(safeMs / 1000));
}

export function buildNotifyEnv(
  durationMs: number,
  baseEnv: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    DURATION: formatDurationSeconds(durationMs)
  };
}

export function launchNotifyScript(
  notifyPath: string | undefined,
  durationMs: number,
  workingDirectory?: string,
  spawnProcess: NotifySpawn = spawn as unknown as NotifySpawn
): void {
  const commandPath = notifyPath?.trim();
  if (!commandPath) {
    return;
  }

  const options = {
    cwd: workingDirectory,
    detached: process.platform !== "win32",
    env: buildNotifyEnv(durationMs),
    stdio: "ignore" as const
  };

  try {
    const child = spawnProcess(commandPath, [], options);
    child.once("error", (error) => {
      if (process.platform === "win32") {
        return;
      }
      if (error.code !== "EACCES" && error.code !== "ENOEXEC") {
        return;
      }

      // Fall back to /bin/sh so plain shell scripts still run without execute permissions.
      try {
        const fallbackChild = spawnProcess("/bin/sh", [commandPath], options);
        fallbackChild.once("error", () => undefined);
        fallbackChild.unref();
      } catch {
        // Ignore notification failures.
      }
    });
    child.unref();
  } catch {
    // Ignore notification failures.
  }
}
