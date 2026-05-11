import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDisableExtglobCommand,
  getShellKind,
  posixPathToWindowsPath,
  rewriteWindowsNullRedirect,
  windowsPathToPosixPath
} from "../tools/shell-utils";
import { isAbsoluteFilePath, normalizeFilePath } from "../tools/state";

test("Windows paths convert to Git Bash POSIX paths", () => {
  assert.equal(windowsPathToPosixPath("C:\\Users\\foo"), "/c/Users/foo");
  assert.equal(
    windowsPathToPosixPath("d:\\IdeaProjects\\guesswho-api"),
    "/d/IdeaProjects/guesswho-api"
  );
  assert.equal(windowsPathToPosixPath("\\\\server\\share\\dir"), "//server/share/dir");
});

test("Git Bash POSIX paths convert to native Windows paths", () => {
  assert.equal(posixPathToWindowsPath("/c/Users/foo"), "C:\\Users\\foo");
  assert.equal(
    posixPathToWindowsPath("/cygdrive/d/IdeaProjects/guesswho-api"),
    "D:\\IdeaProjects\\guesswho-api"
  );
  assert.equal(posixPathToWindowsPath("//server/share/dir"), "\\\\server\\share\\dir");
});

test("Windows nul redirects are rewritten for POSIX bash", () => {
  assert.equal(rewriteWindowsNullRedirect("cmd >nul"), "cmd >/dev/null");
  assert.equal(rewriteWindowsNullRedirect("cmd 2>NUL && next"), "cmd 2>/dev/null && next");
  assert.equal(rewriteWindowsNullRedirect("cmd &>nul\nnext"), "cmd &>/dev/null\nnext");
  assert.equal(rewriteWindowsNullRedirect("echo nullable"), "echo nullable");
});

test("Shell kind detection supports Windows bash.exe paths", () => {
  assert.equal(getShellKind("C:\\Program Files\\Git\\bin\\bash.exe"), "bash");
  assert.equal(getShellKind("/bin/zsh"), "zsh");
  assert.equal(
    buildDisableExtglobCommand("C:\\Program Files\\Git\\bin\\bash.exe"),
    "shopt -u extglob 2>/dev/null || true"
  );
  assert.equal(
    buildDisableExtglobCommand("/bin/zsh"),
    "setopt NO_EXTENDED_GLOB 2>/dev/null || true"
  );
});

test("File tool path normalization converts Git Bash drive paths on Windows", () => {
  assert.equal(
    normalizeFilePath("/d/IdeaProjects/guesswho-api/API_DOCUMENTATION.md", "win32"),
    "D:\\IdeaProjects\\guesswho-api\\API_DOCUMENTATION.md"
  );
  assert.equal(
    normalizeFilePath("/cygdrive/c/Users/foo/file.txt", "win32"),
    "C:\\Users\\foo\\file.txt"
  );
  assert.equal(normalizeFilePath("/dev/null", "win32"), "\\dev\\null");
});

test("File tool absolute checks accept Git Bash drive paths but reject root-relative POSIX paths on Windows", () => {
  assert.equal(
    isAbsoluteFilePath("/d/IdeaProjects/guesswho-api/API_DOCUMENTATION.md", "win32"),
    true
  );
  assert.equal(
    isAbsoluteFilePath("D:/IdeaProjects/guesswho-api/API_DOCUMENTATION.md", "win32"),
    true
  );
  assert.equal(isAbsoluteFilePath("/dev/null", "win32"), false);
  assert.equal(isAbsoluteFilePath("./API_DOCUMENTATION.md", "win32"), false);
});
