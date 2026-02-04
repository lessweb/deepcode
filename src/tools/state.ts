const readFilesBySession = new Map<string, Set<string>>();

export function markFileRead(sessionId: string, filePath: string): void {
  if (!sessionId || !filePath) {
    return;
  }
  let set = readFilesBySession.get(sessionId);
  if (!set) {
    set = new Set<string>();
    readFilesBySession.set(sessionId, set);
  }
  set.add(filePath);
}

export function wasFileRead(sessionId: string, filePath: string): boolean {
  if (!sessionId || !filePath) {
    return false;
  }
  return readFilesBySession.get(sessionId)?.has(filePath) ?? false;
}
