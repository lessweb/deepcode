import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ToolExecutionContext } from "../tools/executor";
import { handleEditTool } from "../tools/edit-handler";
import { handleReadTool } from "../tools/read-handler";

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
