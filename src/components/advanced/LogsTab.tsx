import { useEffect, useRef, useState } from "react";
import { serverLogs } from "../../api/backend";

const POLL_INTERVAL_MS = 1500;

export default function LogsTab() {
  const [logs, setLogs] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const lines = await serverLogs();
        if (!cancelled) setLogs(lines);
      } catch {
        // Server evtl. nicht gestartet — Logs bleiben leer, kein Fehler nötig.
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleCopy() {
    await navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="logs-tab">
      <div className="logs-toolbar">
        <span className="hint">Live-Ausgabe des Sprachmodell-Servers, nützlich für Fehlersuche.</span>
        <button className="secondary-button" onClick={handleCopy}>
          {copied ? "Kopiert!" : "Kopieren"}
        </button>
      </div>
      <div className="logs-output">
        {logs.length === 0 && <div className="hint">Noch keine Log-Zeilen.</div>}
        {logs.map((line, i) => (
          <div key={i} className="log-line">
            {line}
          </div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
