import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type OpenAI from "openai";
import type { ToolExecutionContext } from "../tools/executor";
import { handleWebSearchTool } from "../tools/web-search-handler";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("WebSearch executes the configured script with the query as one argument", async () => {
  const workspace = createTempWorkspace();
  const scriptPath = path.join(workspace, "web-search.sh");
  fs.writeFileSync(
    scriptPath,
    [
      "#!/bin/sh",
      "printf 'query=%s\\n' \"$1\"",
      "printf 'cwd=%s\\n' \"$PWD\""
    ].join("\n"),
    "utf8"
  );
  fs.chmodSync(scriptPath, 0o755);

  const starts: Array<{ id: string | number; command: string }> = [];
  const exits: Array<string | number> = [];
  const result = await handleWebSearchTool(
    { query: "latest node release" },
    createContext(workspace, {
      webSearchTool: scriptPath,
      onProcessStart: (id, command) => starts.push({ id, command }),
      onProcessExit: (id) => exits.push(id)
    })
  );
  const realWorkspace = fs.realpathSync(workspace);

  assert.equal(result.ok, true);
  assert.equal(
    result.output,
    `query=latest node release\ncwd=${realWorkspace}\n`
  );
  assert.equal(starts.length, 1);
  assert.match(starts[0].command, /^WebSearch: latest node release$/);
  assert.deepEqual(exits, [starts[0].id]);
});

test("WebSearch falls back to the configured LLM when no script is configured", async () => {
  const workspace = createTempWorkspace();
  const starts: Array<{ id: string | number; command: string }> = [];
  const exits: Array<string | number> = [];

  const fakeClient = {
    chat: {
      completions: {
        create: async ({ messages, web_search_options }: { messages: Array<{ content: string }>; web_search_options?: unknown }) => {
          const prompt = messages[0]?.content ?? "";
          if (web_search_options) {
            return {
              choices: [
                {
                  message: {
                    content:
                      "Node.js 24 is the latest release.\n\nSources:\n- [Node.js Releases](https://nodejs.org/en/about/previous-releases)"
                  }
                }
              ]
            };
          }
          if (prompt.includes("Return strict JSON:")) {
            return {
              choices: [
                {
                  message: {
                    content: "{\"dominant_language\":\"en\",\"reason\":\"Most Node.js release notes are published in English.\"}"
                  }
                }
              ]
            };
          }
          throw new Error(`Unexpected chat prompt: ${prompt}`);
        }
      }
    },
    responses: {
      create: async () => ({
        output_text:
          "Node.js 24 is the latest release.\n\nSources:\n- [Node.js Releases](https://nodejs.org/en/about/previous-releases)"
      })
    }
  } as unknown as OpenAI;

  const result = await handleWebSearchTool(
    { query: "latest node release" },
    createContext(workspace, {
      client: fakeClient,
      onProcessStart: (id, command) => starts.push({ id, command }),
      onProcessExit: (id) => exits.push(id)
    })
  );

  assert.equal(result.ok, true);
  assert.match(result.output ?? "", /Node\.js 24 is the latest release/);
  assert.equal(result.metadata?.resolvedQuery, "latest node release");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].id, exits[0]);
  assert.equal(starts[0].command, "WebSearch: latest node release");
});

test("WebSearch returns a configuration error when neither a script nor an LLM client is available", async () => {
  const workspace = createTempWorkspace();
  const result = await handleWebSearchTool(
    { query: "latest node release" },
    createContext(workspace)
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.error,
    "WebSearch default mode requires a valid LLM configuration in ~/.deepcode/settings.json."
  );
});

function createContext(
  projectRoot: string,
  options: {
    client?: OpenAI | null;
    webSearchTool?: string;
    onProcessStart?: (processId: string | number, command: string) => void;
    onProcessExit?: (processId: string | number) => void;
  } = {}
): ToolExecutionContext {
  return {
    sessionId: "web-search-test",
    projectRoot,
    toolCall: {
      id: "tool-call-id",
      type: "function",
      function: {
        name: "WebSearch",
        arguments: "{}"
      }
    },
    createOpenAIClient: () => ({
      client: options.client ?? null,
      model: "test-model",
      thinkingEnabled: false,
      webSearchTool: options.webSearchTool
    }),
    onProcessStart: options.onProcessStart,
    onProcessExit: options.onProcessExit
  };
}

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-web-search-"));
  tempDirs.push(dir);
  return dir;
}
