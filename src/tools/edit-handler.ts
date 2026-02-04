import * as fs from "fs";
import * as path from "path";
import type { ToolExecutionContext, ToolExecutionResult } from "./executor";
import { wasFileRead } from "./state";

export async function handleEditTool(
  args: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const filePath = typeof args.file_path === "string" ? args.file_path : "";
  if (!filePath.trim()) {
    return {
      ok: false,
      name: "edit",
      error: "Missing required \"file_path\" string."
    };
  }

  if (!path.isAbsolute(filePath)) {
    return {
      ok: false,
      name: "edit",
      error: "file_path must be an absolute path."
    };
  }

  const oldString = typeof args.old_string === "string" ? args.old_string : null;
  const newString = typeof args.new_string === "string" ? args.new_string : null;
  if (oldString === null) {
    return {
      ok: false,
      name: "edit",
      error: "Missing required \"old_string\" string."
    };
  }
  if (newString === null) {
    return {
      ok: false,
      name: "edit",
      error: "Missing required \"new_string\" string."
    };
  }
  if (oldString === "") {
    return {
      ok: false,
      name: "edit",
      error: "old_string must not be empty."
    };
  }
  if (oldString === newString) {
    return {
      ok: false,
      name: "edit",
      error: "new_string must differ from old_string."
    };
  }

  if (!wasFileRead(context.sessionId, filePath)) {
    return {
      ok: false,
      name: "edit",
      error: "Must read file before editing."
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      name: "edit",
      error: `File not found: ${filePath}`
    };
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "edit",
      error: `Failed to stat file: ${message}`
    };
  }

  if (stat.isDirectory()) {
    return {
      ok: false,
      name: "edit",
      error: "file_path points to a directory."
    };
  }

  const replaceAll = typeof args.replace_all === "boolean" ? args.replace_all : false;

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const matches = countOccurrences(raw, oldString);
    if (matches === 0) {
      return {
        ok: false,
        name: "edit",
        error: "old_string not found in file."
      };
    }
    if (!replaceAll && matches > 1) {
      return {
        ok: false,
        name: "edit",
        error: "old_string is not unique; use replace_all or provide more context."
      };
    }

    const updated = replaceAll ? raw.split(oldString).join(newString) : raw.replace(oldString, newString);
    fs.writeFileSync(filePath, updated, "utf8");
    const replacedCount = replaceAll ? matches : 1;
    return {
      ok: true,
      name: "edit",
      output: `Replaced ${replacedCount} occurrence(s) in ${filePath}.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      name: "edit",
      error: message
    };
  }
}

function countOccurrences(source: string, needle: string): number {
  if (!source || !needle) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(needle, index);
    if (found === -1) {
      break;
    }
    count += 1;
    index = found + needle.length;
  }
  return count;
}
