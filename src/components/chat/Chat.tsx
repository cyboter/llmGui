import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ChatSession } from "./chatTypes";
import { createSession, loadSessions, saveSessions } from "./chatStorage";
import { streamChat } from "./streamChat";
import "./chat.css";

interface ChatProps {
  port: number;
  systemPrompt?: string | null;
}

export default function Chat({ port, systemPrompt }: ChatProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const loaded = loadSessions();
    return loaded.length > 0 ? loaded : [createSession()];
  });
  const [activeId, setActiveId] = useState(sessions[0].id);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessions, activeId]);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  function updateActiveSession(updater: (session: ChatSession) => ChatSession) {
    setSessions((prev) =>
      prev.map((s) => (s.id === active.id ? updater(s) : s)),
    );
  }

  function handleNewChat() {
    const session = createSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    const isFirstMessage = active.messages.length === 0;
    updateActiveSession((s) => ({
      ...s,
      title: isFirstMessage ? text.slice(0, 40) : s.title,
      messages: [...s.messages, userMessage, assistantMessage],
    }));
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        port,
        messages: [...active.messages, userMessage],
        systemPrompt,
        temperature: 0.7,
        topP: 0.9,
        signal: controller.signal,
        onToken: (token) => {
          updateActiveSession((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, content: m.content + token }
                : m,
            ),
          }));
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        updateActiveSession((s) => ({
          ...s,
          messages: s.messages.map((m) =>
            m.id === assistantMessage.id
              ? {
                  ...m,
                  content: m.content || t("chat.responseError"),
                }
              : m,
          ),
        }));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar">
        <button className="new-chat-button" onClick={handleNewChat}>
          {t("chat.newChat")}
        </button>
        <div className="chat-list">
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`chat-list-item ${s.id === active.id ? "active" : ""}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.title}
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-main">
        <div className="messages">
          {active.messages.length === 0 && (
            <div className="empty-state">{t("chat.emptyState")}</div>
          )}
          {active.messages.map((m) => (
            <div key={m.id} className={`message message-${m.role}`}>
              <div className="message-bubble">
                {m.content || (isStreaming && m.role === "assistant" ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.messagePlaceholder")}
            rows={2}
            disabled={isStreaming}
          />
          <button
            className="primary-button"
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
          >
            {t("chat.send")}
          </button>
        </div>
      </main>
    </div>
  );
}
