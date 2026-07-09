import { useEffect, useState } from "react";
import Onboarding from "./components/onboarding/Onboarding";
import Chat from "./components/chat/Chat";
import { isSetupComplete, loadServerSetup } from "./state/appState";
import { serverStatus, startServer } from "./api/backend";
import { isFriendlyError } from "./api/types";

type AppPhase = "onboarding" | "starting-server" | "ready" | "error";

function App() {
  const [phase, setPhase] = useState<AppPhase>(
    isSetupComplete() ? "starting-server" : "onboarding",
  );
  const [port, setPort] = useState<number | null>(null);
  const [systemPrompt, setSystemPrompt] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "starting-server") return;

    const setup = loadServerSetup();
    if (!setup) {
      setPhase("onboarding");
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        const status = await serverStatus();
        if (!status.running) {
          await startServer(setup!.exePath, setup!.config, setup!.maxGpuLayers);
        }
        if (cancelled) return;
        setPort(setup!.config.port);
        setSystemPrompt(setup!.config.system_prompt);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setStartError(
          isFriendlyError(e) ? e.message : "Das Sprachmodell konnte nicht gestartet werden.",
        );
        setPhase("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  if (phase === "onboarding") {
    return <Onboarding onComplete={() => setPhase("starting-server")} />;
  }

  if (phase === "starting-server") {
    return (
      <main className="app">
        <h1>LLM GUI</h1>
        <p>Das Sprachmodell wird gestartet…</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="app">
        <h1>Etwas ist schiefgelaufen</h1>
        <p>{startError}</p>
      </main>
    );
  }

  return <Chat port={port!} systemPrompt={systemPrompt} />;
}

export default App;
