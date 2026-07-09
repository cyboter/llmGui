import type { ChatMessage } from "./chatTypes";

interface StreamChatOptions {
  port: number;
  messages: ChatMessage[];
  systemPrompt?: string | null;
  temperature: number;
  topP: number;
  onToken: (token: string) => void;
  signal: AbortSignal;
}

/// Streamt eine Chat-Antwort per Server-Sent-Events von llama-server's
/// OpenAI-kompatiblen `/v1/chat/completions`-Endpunkt. Der Endpunkt sendet
/// `data: {...}`-Zeilen, terminiert durch `data: [DONE]` — reiner Fetch mit
/// ReadableStream reicht hier aus, eine EventSource-Bibliothek ist nicht
/// nötig, da wir per POST anfragen (EventSource unterstützt nur GET).
export async function streamChat({
  port,
  messages,
  systemPrompt,
  temperature,
  topP,
  onToken,
  signal,
}: StreamChatOptions): Promise<void> {
  const apiMessages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: apiMessages,
      temperature,
      top_p: topP,
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Server antwortete mit Status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;

      const payload = trimmed.slice("data:".length).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload);
        const token = parsed.choices?.[0]?.delta?.content;
        if (typeof token === "string" && token.length > 0) {
          onToken(token);
        }
      } catch {
        // Unvollständige/ungültige Chunks werden übersprungen statt den
        // gesamten Stream abzubrechen.
      }
    }
  }
}
