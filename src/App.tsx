import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Onboarding from "./components/onboarding/Onboarding";
import Chat from "./components/chat/Chat";
import AdvancedPanel from "./components/advanced/AdvancedPanel";
import UpdateBanner from "./components/shared/UpdateBanner";
import { isSetupComplete, loadServerSetup, saveServerSetup, loadEngineRepo } from "./state/appState";
import { detectHardware, ensureEngine, serverStatus, startServer, stopServer } from "./api/backend";
import { isFriendlyError } from "./api/types";
import type { ServerConfig } from "./api/types";
import { translateError } from "./api/errorTranslation";

type AppPhase = "onboarding" | "starting-server" | "ready" | "error";

interface RunningSetup {
  exePath: string;
  config: ServerConfig;
  maxGpuLayers: number;
}

function App() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<AppPhase>(
    isSetupComplete() ? "starting-server" : "onboarding",
  );
  const [setup, setSetup] = useState<RunningSetup | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== "starting-server") return;

    const stored = loadServerSetup();
    if (!stored) {
      setPhase("onboarding");
      return;
    }

    let cancelled = false;

    async function boot() {
      try {
        const status = await serverStatus();
        if (!status.running) {
          await startServer(stored!.exePath, stored!.config, stored!.maxGpuLayers);
        }
        if (cancelled) return;
        setSetup(stored);
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        setStartError(
          isFriendlyError(e) ? translateError(e) : t("app.modelStartFailed"),
        );
        setPhase("error");
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  async function handleApplyAdvanced(newConfig: ServerConfig, modelPath: string) {
    if (!setup) return;
    setApplying(true);
    setApplyError(null);

    const previousSetup = setup;

    try {
      const configToApply: ServerConfig = { ...newConfig, model_path: modelPath };
      await stopServer();

      // Falls sich der Server-Port geändert hat, könnte im Erweiterten Modus
      // theoretisch auch ein anderes Backend gewünscht sein — wir nutzen aber
      // weiterhin die bereits installierte Engine, nur mit neuer Engine-Quelle
      // für zukünftige Updates (ensureEngine ist idempotent, lädt nichts neu
      // herunter, wenn die exe bereits existiert).
      const hardware = await detectHardware();
      const repo = loadEngineRepo();
      const exePath = await ensureEngine(hardware.recommended_backend, repo ?? undefined);

      await startServer(exePath, configToApply, setup.maxGpuLayers);

      const updatedSetup: RunningSetup = {
        exePath,
        config: configToApply,
        maxGpuLayers: setup.maxGpuLayers,
      };
      saveServerSetup(exePath, configToApply, setup.maxGpuLayers);
      setSetup(updatedSetup);
      setAdvancedOpen(false);
    } catch (e) {
      // Der alte Server wurde bereits gestoppt, bevor der neue Start
      // versucht wurde — ohne Fallback bliebe der Nutzer ohne laufenden
      // Server zurück, obwohl vorher alles funktionierte. Wir versuchen
      // daher, die zuletzt bekannte funktionierende Konfiguration wieder
      // herzustellen, und zeigen den eigentlichen Fehler zusätzlich an.
      try {
        await startServer(
          previousSetup.exePath,
          previousSetup.config,
          previousSetup.maxGpuLayers,
        );
      } catch {
        // Auch der Fallback ist gescheitert — dann bleibt nur die
        // Fehlermeldung, der Nutzer muss die App neu starten.
      }
      setApplyError(isFriendlyError(e) ? translateError(e) : t("app.applyFailed"));
    } finally {
      setApplying(false);
    }
  }

  if (phase === "onboarding") {
    return <Onboarding onComplete={() => setPhase("starting-server")} />;
  }

  if (phase === "starting-server") {
    return (
      <main className="app">
        <h1>{t("app.title")}</h1>
        <p>{t("app.startingModel")}</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="app">
        <h1>{t("app.somethingWrong")}</h1>
        <p>{startError}</p>
      </main>
    );
  }

  return (
    <>
      <Chat port={setup!.config.port} systemPrompt={setup!.config.system_prompt} />
      <button
        className="settings-gear-button"
        onClick={() => setAdvancedOpen(true)}
        aria-label={t("app.advancedSettingsLabel")}
        title={t("app.advancedSettingsLabel")}
      >
        ⚙
      </button>
      <AdvancedPanel
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        config={setup!.config}
        onApply={handleApplyAdvanced}
        applying={applying}
        applyError={applyError}
      />
      <UpdateBanner />
    </>
  );
}

export default App;
