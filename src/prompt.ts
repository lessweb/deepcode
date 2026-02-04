import * as fs from "fs";
import * as path from "path";

const SYSTEM_PROMPT_BASE = `You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.`;

function readToolDocs(projectRoot: string): string {
  const toolsDir = path.join(projectRoot, "docs", "tools");
  if (!fs.existsSync(toolsDir)) {
    return "";
  }

  const entries = fs.readdirSync(toolsDir);
  const docs = entries
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => {
      const fullPath = path.join(toolsDir, entry);
      try {
        return fs.readFileSync(fullPath, "utf8").trim();
      } catch {
        return "";
      }
    })
    .filter((content) => content.length > 0);

  return docs.join("\n\n");
}

export function getSystemPrompt(projectRoot: string): string {
  const toolDocs = readToolDocs(projectRoot);
  if (!toolDocs) {
    return SYSTEM_PROMPT_BASE;
  }
  return `${SYSTEM_PROMPT_BASE}\n\n# Available Tools\n\n${toolDocs}`;
}

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export function getTools(): ToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "bash",
        description: "Execute shell commands in a persistent bash session.",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to execute"
            },
            description: {
              type: "string",
              description:
                "Clear, concise description of what this command does in active voice. Never use words like \"complex\" or \"risk\" in the description - just describe what it does."
            }
          },
          required: ["command"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "read",
        description: "Read files from the filesystem (text, images, PDFs, notebooks).",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to file"
            },
            offset: {
              type: "number",
              description: "Line number to start reading from"
            },
            limit: {
              type: "number",
              description: "Number of lines to read"
            },
            pages: {
              type: "string",
              description:
                "Page range for PDF files (e.g., \"1-5\", \"3\", \"10-20\"). Only applicable to PDF files."
            }
          },
          required: ["file_path"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "write",
        description: "Write or overwrite files.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to file"
            },
            content: {
              type: "string",
              description: "Complete file content"
            }
          },
          required: ["file_path", "content"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "edit",
        description: "Perform exact string replacements in files.",
        parameters: {
          type: "object",
          properties: {
            file_path: {
              type: "string",
              description: "Absolute path to file"
            },
            old_string: {
              type: "string",
              description: "Exact text to replace"
            },
            new_string: {
              type: "string",
              description: "Replacement text (must differ from old_string)"
            },
            replace_all: {
              type: "boolean",
              description: "Replace all occurences of old_string (default false)",
              default: false
            }
          },
          required: ["file_path", "old_string", "new_string"],
          additionalProperties: false
        }
      }
    }
  ];
}
