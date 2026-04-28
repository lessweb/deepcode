import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ToolExecutionContext } from "../tools/executor";
import { handleEditTool } from "../tools/edit-handler";
import { handleReadTool } from "../tools/read-handler";
import { handleWriteTool } from "../tools/write-handler";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("Read returns snippet metadata and Edit can scope replacements by snippet_id", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "sample.txt");
  fs.writeFileSync(
    filePath,
    ["alpha", "target = 1", "omega", "beta", "target = 1", "done"].join("\n"),
    "utf8"
  );

  const sessionId = "snippet-scope";
  const readResult = await handleReadTool(
    { file_path: filePath, offset: 4, limit: 2 },
    createContext(sessionId, workspace)
  );

  assert.equal(readResult.ok, true);
  const snippet = (readResult.metadata?.snippet ?? null) as
    | { id: string; startLine: number; endLine: number }
    | null;
  assert.ok(snippet);
  assert.equal(snippet?.startLine, 4);
  assert.equal(snippet?.endLine, 5);

  const editResult = await handleEditTool(
    {
      snippet_id: snippet?.id,
      old_string: "target = 1",
      new_string: "target = 2"
    },
    createContext(sessionId, workspace)
  );

  assert.equal(editResult.ok, true);
  assert.equal(editResult.metadata?.file_path, filePath);
  assert.equal(editResult.metadata?.read_scope_type, "snippet");
  assert.equal(editResult.metadata?.cache_refreshed, true);
  assert.equal(editResult.metadata?.line_endings, "LF");
  assert.match(String(editResult.metadata?.diff_preview ?? ""), /\+target = 2/);
  assert.equal(
    fs.readFileSync(filePath, "utf8"),
    ["alpha", "target = 1", "omega", "beta", "target = 2", "done"].join("\n")
  );
});

test("Edit returns candidate match snippets when old_string is not unique", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "duplicate.txt");
  fs.writeFileSync(filePath, ["city", "city", "salary"].join("\n"), "utf8");

  const sessionId = "candidate-matches";
  await handleReadTool({ file_path: filePath }, createContext(sessionId, workspace));

  const editResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: "city",
      new_string: "location"
    },
    createContext(sessionId, workspace)
  );

  assert.equal(editResult.ok, false);
  assert.equal(
    editResult.error,
    "old_string is not unique; use snippet_id, replace_all, or provide more context."
  );
  const candidates = (editResult.metadata?.candidates ?? []) as Array<{
    snippet_id: string;
    start_line: number;
    end_line: number;
    preview: string;
  }>;
  assert.equal(candidates.length, 2);
  assert.ok(candidates[0]?.snippet_id);
  assert.equal(candidates[0]?.start_line, 1);
  assert.match(candidates[0]?.preview ?? "", /city/);
});

test("replace_all requires expected_occurrences for broad short-fragment replacements", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "openapi.yaml");
  const fragment = "        schema:\n          type: string";
  fs.writeFileSync(filePath, [fragment, fragment, fragment].join("\n---\n"), "utf8");

  const sessionId = "replace-all-guard";
  await handleReadTool({ file_path: filePath }, createContext(sessionId, workspace));

  const blockedResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: fragment,
      new_string: "        schema:\n          type: array",
      replace_all: true
    },
    createContext(sessionId, workspace)
  );

  assert.equal(blockedResult.ok, false);
  assert.match(
    blockedResult.error ?? "",
    /provide expected_occurrences to confirm this broader replacement/
  );

  const allowedResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: fragment,
      new_string: "        schema:\n          type: array",
      replace_all: true,
      expected_occurrences: 3
    },
    createContext(sessionId, workspace)
  );

  assert.equal(allowedResult.ok, true);
  assert.equal(
    fs.readFileSync(filePath, "utf8"),
    [
      "        schema:\n          type: array",
      "        schema:\n          type: array",
      "        schema:\n          type: array"
    ].join("\n---\n")
  );
});

test("Edit accepts a unique loose-escape match when only escaping differs", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "query.py");
  fs.writeFileSync(filePath, "params['city_json'] = f'\"{city}\"'\n", "utf8");

  const sessionId = "closest-match";
  await handleReadTool({ file_path: filePath }, createContext(sessionId, workspace));

  const editResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: "params['city_json'] = f'\\\\\"{city}\\\\\"'",
      new_string: "params['city_json'] = city"
    },
    createContext(sessionId, workspace, {
      createOpenAIClient: () => ({
        client: {
          chat: {
            completions: {
              create: async () => ({
                choices: [
                  {
                    message: {
                      content:
                        "<response>" +
                        "<corrected_old_string><![CDATA[params['city_json'] = f'\"{city}\"']]></corrected_old_string>" +
                        "<corrected_new_string><![CDATA[params['city_json'] = city]]></corrected_new_string>" +
                        "</response>"
                    }
                  }
                ]
              })
            }
          }
        } as any,
        model: "test-model",
        thinkingEnabled: false
      })
    })
  );

  assert.equal(editResult.ok, true);
  assert.equal(editResult.metadata?.matched_via, "llm_escape_correction");
  assert.equal(fs.readFileSync(filePath, "utf8"), "params['city_json'] = city\n");
});

test("Write repairs JSON object content for .json files", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "package.json");

  const writeResult = await handleWriteTool(
    {
      file_path: filePath,
      content: {
        name: "demo",
        private: true
      } as unknown as string
    },
    createContext("write-json-object", workspace)
  );

  assert.equal(writeResult.ok, true);
  assert.equal(writeResult.metadata?.type, "create");
  assert.equal(writeResult.metadata?.file_path, filePath);
  assert.equal(writeResult.metadata?.cache_refreshed, true);
  assert.equal(writeResult.metadata?.line_endings, "LF");
  assert.equal(writeResult.metadata?.input_repaired, true);
  assert.match(String(writeResult.metadata?.diff_preview ?? ""), /\+\s*"name": "demo"|^\+\{/m);
  assert.equal(
    fs.readFileSync(filePath, "utf8"),
    '{\n  "name": "demo",\n  "private": true\n}'
  );
});

test("Write updates file state so a follow-up Edit can succeed without another Read", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "note.txt");

  const writeResult = await handleWriteTool(
    {
      file_path: filePath,
      content: "alpha\nbeta\n"
    },
    createContext("write-then-edit", workspace)
  );

  assert.equal(writeResult.ok, true);
  assert.equal(writeResult.metadata?.type, "create");
  assert.equal(writeResult.metadata?.cache_refreshed, true);

  const editResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: "beta",
      new_string: "gamma"
    },
    createContext("write-then-edit", workspace)
  );

  assert.equal(editResult.ok, true);
  assert.equal(editResult.metadata?.read_scope_type, "full");
  assert.match(String(editResult.metadata?.diff_preview ?? ""), /-beta/);
  assert.match(String(editResult.metadata?.diff_preview ?? ""), /\+gamma/);
  assert.equal(fs.readFileSync(filePath, "utf8"), "alpha\ngamma\n");
});

test("Write requires a full read before overwriting an existing file", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "config.txt");
  fs.writeFileSync(filePath, "line1\nline2\nline3\n", "utf8");

  const sessionId = "write-full-read";
  await handleReadTool({ file_path: filePath, offset: 2, limit: 1 }, createContext(sessionId, workspace));

  const blockedResult = await handleWriteTool(
    {
      file_path: filePath,
      content: "rewritten"
    },
    createContext(sessionId, workspace)
  );

  assert.equal(blockedResult.ok, false);
  assert.equal(blockedResult.error, "Must read the full existing file before writing.");
});

test("Write can overwrite an existing empty file without a prior read", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "empty.txt");
  fs.writeFileSync(filePath, "", "utf8");

  const writeResult = await handleWriteTool(
    {
      file_path: filePath,
      content: "initialized\n"
    },
    createContext("write-empty-existing", workspace)
  );

  assert.equal(writeResult.ok, true);
  assert.equal(writeResult.metadata?.type, "update");
  assert.equal(writeResult.metadata?.cache_refreshed, true);
  assert.match(String(writeResult.metadata?.diff_preview ?? ""), /\+initialized/);
  assert.equal(fs.readFileSync(filePath, "utf8"), "initialized\n");
});

test("Edit rejects stale reads after the file changes on disk", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "stale.txt");
  fs.writeFileSync(filePath, "before\n", "utf8");

  const sessionId = "stale-edit";
  await handleReadTool({ file_path: filePath }, createContext(sessionId, workspace));

  fs.writeFileSync(filePath, "after\n", "utf8");
  const futureTime = new Date(Date.now() + 2000);
  fs.utimesSync(filePath, futureTime, futureTime);

  const editResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: "after",
      new_string: "final"
    },
    createContext(sessionId, workspace)
  );

  assert.equal(editResult.ok, false);
  assert.equal(editResult.error, "File has been modified since read. Read it again before editing.");
});

test("Write preserves the exact trailing newline policy from the provided content", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "newline.txt");

  const writeResult = await handleWriteTool(
    {
      file_path: filePath,
      content: "no trailing newline"
    },
    createContext("write-no-newline", workspace)
  );

  assert.equal(writeResult.ok, true);
  assert.match(String(writeResult.metadata?.diff_preview ?? ""), /\+no trailing newline/);
  assert.equal(fs.readFileSync(filePath, "utf8"), "no trailing newline");
});

test("Edit preserves CRLF line endings for existing files", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "windows.txt");
  fs.writeFileSync(filePath, "alpha\r\nbeta\r\n", "utf8");

  const sessionId = "crlf-edit";
  await handleReadTool({ file_path: filePath }, createContext(sessionId, workspace));

  const editResult = await handleEditTool(
    {
      file_path: filePath,
      old_string: "beta",
      new_string: "gamma"
    },
    createContext(sessionId, workspace)
  );

  assert.equal(editResult.ok, true);
  assert.equal(editResult.metadata?.line_endings, "CRLF");
  assert.equal(fs.readFileSync(filePath, "utf8"), "alpha\r\ngamma\r\n");
});

test("Read returns an acknowledgement for images and attaches the image as a follow-up system message", async () => {
  const workspace = createTempWorkspace();
  const filePath = path.join(workspace, "pixel.png");
  fs.writeFileSync(
    filePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0X8AAAAASUVORK5CYII=",
      "base64"
    )
  );

  const readResult = await handleReadTool(
    { file_path: filePath },
    createContext("image-read", workspace)
  );

  assert.equal(readResult.ok, true);
  assert.equal(readResult.output, "File loaded.");
  assert.equal(readResult.metadata?.mime, "image/png");
  assert.equal(Array.isArray(readResult.followUpMessages), true);
  assert.equal(readResult.followUpMessages?.length, 1);

  const followUpMessage = readResult.followUpMessages?.[0];
  assert.equal(followUpMessage?.role, "system");
  assert.match(followUpMessage?.content ?? "", /pixel\.png/);
  const contentParams = Array.isArray(followUpMessage?.contentParams)
    ? followUpMessage.contentParams
    : [];
  assert.equal(contentParams.length, 1);
  assert.equal((contentParams[0] as { type?: unknown }).type, "image_url");
  assert.match(
    String(
      ((contentParams[0] as { image_url?: { url?: unknown } }).image_url?.url ?? "")
    ),
    /^data:image\/png;base64,/
  );
});

function createContext(
  sessionId: string,
  projectRoot: string,
  overrides: Partial<ToolExecutionContext> = {}
): ToolExecutionContext {
  return {
    sessionId,
    projectRoot,
    toolCall: {
      id: "test-tool-call",
      type: "function",
      function: {
        name: "test",
        arguments: "{}"
      }
    },
    ...overrides
  };
}

function createTempWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-tools-"));
  tempDirs.push(dir);
  return dir;
}
