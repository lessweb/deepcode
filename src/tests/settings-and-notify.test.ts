import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNotifyEnv, formatDurationSeconds, launchNotifyScript, type NotifySpawn } from "../notify";
import { resolveSettings } from "../settings";

test("resolveSettings reads top-level thinkingEnabled and notify", () => {
  const resolved = resolveSettings(
    {
      env: {
        MODEL: "deepseek-v3.2",
        BASE_URL: "https://example.com/v1",
        API_KEY: "sk-test"
      },
      thinkingEnabled: true,
      notify: "  /tmp/notify.sh  "
    },
    {
      model: "default-model",
      baseURL: "https://default.example.com"
    }
  );

  assert.equal(resolved.model, "deepseek-v3.2");
  assert.equal(resolved.baseURL, "https://example.com/v1");
  assert.equal(resolved.apiKey, "sk-test");
  assert.equal(resolved.thinkingEnabled, true);
  assert.equal(resolved.notify, "/tmp/notify.sh");
});

test("resolveSettings still accepts legacy env.THINKING when thinkingEnabled is absent", () => {
  const resolved = resolveSettings(
    {
      env: {
        THINKING: "enabled"
      }
    },
    {
      model: "default-model",
      baseURL: "https://default.example.com"
    }
  );

  assert.equal(resolved.thinkingEnabled, true);
  assert.equal(resolved.model, "default-model");
  assert.equal(resolved.baseURL, "https://default.example.com");
});

test("formatDurationSeconds preserves sub-second precision and trims trailing zeros", () => {
  assert.equal(formatDurationSeconds(0), "0");
  assert.equal(formatDurationSeconds(1250), "1");
  assert.equal(formatDurationSeconds(4000), "4");
});

test("buildNotifyEnv injects DURATION", () => {
  const env = buildNotifyEnv(2750, { HOME: "/tmp/home" });
  assert.equal(env.HOME, "/tmp/home");
  assert.equal(env.DURATION, "2");
});

test("launchNotifyScript passes DURATION and falls back to /bin/sh for non-executable scripts", () => {
  const calls: Array<{
    command: string;
    args: string[];
    options: { cwd?: string | URL; env?: NodeJS.ProcessEnv };
  }> = [];

  const spawnProcess: NotifySpawn = (command, args, options) => {
    calls.push({ command, args, options: { cwd: options.cwd, env: options.env } });

    return {
      once(event, listener) {
        if (event === "error" && calls.length === 1) {
          listener({ code: "EACCES" } as NodeJS.ErrnoException);
        }
        return this;
      },
      unref() {
        return undefined;
      }
    };
  };

  launchNotifyScript("/tmp/notify.sh", 2750, "/tmp/project", spawnProcess);

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.command, "/tmp/notify.sh");
  assert.deepEqual(calls[0]?.args, []);
  assert.equal(calls[0]?.options.cwd, "/tmp/project");
  assert.equal(calls[0]?.options.env?.DURATION, "2");
  assert.equal(calls[1]?.command, "/bin/sh");
  assert.deepEqual(calls[1]?.args, ["/tmp/notify.sh"]);
  assert.equal(calls[1]?.options.cwd, "/tmp/project");
  assert.equal(calls[1]?.options.env?.DURATION, "2");
});
