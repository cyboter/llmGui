import type { ChatSession } from "./chatTypes";

const SESSIONS_KEY = "llmgui.chatSessions";

export function loadSessions(): ChatSession[] {
  const raw = localStorage.getItem(SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function createSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: "Neuer Chat",
    messages: [],
    createdAt: Date.now(),
  };
}
