import { useEffect, useState } from "react";
import {
  detectHardware,
  downloadModel,
  ensureEngine,
  loadCuratedModels,
  onEngineDownloadProgress,
  onModelDownloadProgress,
  recommendModel,
} from "../../api/backend";
import type {
  CuratedModel,
  DownloadProgress,
  FriendlyError,
  HardwareProfile,
} from "../../api/types";
import { isFriendlyError } from "../../api/types";
import type { ServerConfig } from "../../api/types";
import { saveServerSetup, markSetupComplete } from "../../state/appState";
import "./onboarding.css";

type Step =
  | "detecting"
  | "recommendation"
  | "downloading"
  | "starting"
  | "error";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function bestVramBytes(hw: HardwareProfile): number {
  return hw.gpus.reduce((max, g) => Math.max(max, g.vram_bytes), 0);
}

function maxGpuLayersFor(hw: HardwareProfile): number {
  // Grobe Heuristik: ohne GPU keine Offload-Layer, sonst großzügig genug,
  // damit die Retry-Kaskade im Backend die tatsächliche Grenze empirisch
  // ermittelt (siehe engine::start_with_retry).
  return bestVramBytes(hw) > 0 ? 999 : 0;
}

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>("detecting");
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<CuratedModel[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [engineProgress, setEngineProgress] = useState<DownloadProgress | null>(null);
  const [modelProgress, setModelProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);

  const model = models.find((m) => m.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const hw = await detectHardware();
        if (cancelled) return;
        setHardware(hw);

        const loadedModels = await loadCuratedModels();
        const recommended = await recommendModel(
          loadedModels,
          hw.total_ram_bytes,
          bestVramBytes(hw),
        );
        if (cancelled) return;

        if (!recommended) {
          setError({
            message:
              "Es konnte kein passendes Modell für deinen Computer gefunden werden.",
            technical_detail: "recommend_model returned null",
          });
          setStep("error");
          return;
        }

        setModels(loadedModels);
        setRecommendedId(recommended.id);
        setSelectedId(recommended.id);
        setStep("recommendation");
      } catch (e) {
        if (cancelled) return;
        setError(
          isFriendlyError(e)
            ? e
            : {
                message: "Die Hardware-Erkennung ist fehlgeschlagen.",
                technical_detail: String(e),
              },
        );
        setStep("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStart() {
    if (!hardware || !model) return;
    setStep("downloading");
    setError(null);

    const unlistenEngine = await onEngineDownloadProgress(setEngineProgress);
    const unlistenModel = await onModelDownloadProgress(setModelProgress);

    try {
      const exePath = await ensureEngine(hardware.recommended_backend);
      const modelPath = await downloadModel(model);

      unlistenEngine();
      unlistenModel();

      setStep("starting");

      const config: ServerConfig = {
        model_path: modelPath,
        port: 8080,
        context_size: 4096,
        gpu_layers: 0,
        threads: hardware.cpu_threads,
        temperature: 0.7,
        top_p: 0.9,
        top_k: 40,
        repeat_penalty: 1.1,
        system_prompt: null,
      };
      const maxGpuLayers = maxGpuLayersFor(hardware);
      saveServerSetup(exePath, config, maxGpuLayers);
      markSetupComplete();
      onComplete();
    } catch (e) {
      unlistenEngine();
      unlistenModel();
      setError(
        isFriendlyError(e)
          ? e
          : {
              message: "Bei der Einrichtung ist etwas schiefgelaufen.",
              technical_detail: String(e),
            },
      );
      setStep("error");
    }
  }

  return (
    <div className="onboarding">
      {step === "detecting" && (
        <div className="onboarding-card">
          <h1>Willkommen</h1>
          <p>Wir schauen uns kurz deinen Computer an…</p>
          <div className="spinner" />
        </div>
      )}

      {step === "recommendation" && hardware && model && (
        <div className="onboarding-card onboarding-card-wide">
          <h1>Alles bereit</h1>
          <p className="hw-summary">
            Wir haben erkannt: {formatBytes(hardware.total_ram_bytes)}{" "}
            Arbeitsspeicher
            {hardware.gpus.length > 0 && (
              <>, eine Grafikkarte ({hardware.gpus[0].name})</>
            )}
            .
          </p>

          <div className="model-options">
            {models.map((m) => (
              <button
                key={m.id}
                className={`model-option ${m.id === selectedId ? "selected" : ""}`}
                onClick={() => setSelectedId(m.id)}
              >
                {m.id === recommendedId && (
                  <span className="model-option-badge">Empfohlen für deinen Computer</span>
                )}
                <h2>{m.label}</h2>
                <p>{m.description}</p>
                <p className="model-size">Downloadgröße: ca. {formatBytes(m.approxSizeBytes)}</p>
              </button>
            ))}
          </div>

          <p className="model-license">
            Lizenz ({model.license.name}): {model.license.summary}{" "}
            <a href={model.license.url} target="_blank" rel="noreferrer">
              Volltext ansehen
            </a>
          </p>

          <button className="primary-button" onClick={handleStart}>
            Jetzt einrichten
          </button>
          <p className="setup-hint">
            Das gewählte Modell lässt sich später im Erweiterten Modus (Zahnrad-Symbol) jederzeit
            wechseln.
          </p>
        </div>
      )}

      {step === "downloading" && (
        <div className="onboarding-card">
          <h1>Wird eingerichtet…</h1>
          {engineProgress && engineProgress.total_bytes > 0 && (
            <ProgressBar
              label="Programmkomponenten"
              progress={engineProgress}
            />
          )}
          {modelProgress && modelProgress.total_bytes > 0 && (
            <ProgressBar label="KI-Modell" progress={modelProgress} />
          )}
          {!engineProgress && !modelProgress && (
            <p>Der Download startet gleich…</p>
          )}
        </div>
      )}

      {step === "starting" && (
        <div className="onboarding-card">
          <h1>Fast fertig…</h1>
          <p>Das Sprachmodell wird gestartet.</p>
          <div className="spinner" />
        </div>
      )}

      {step === "error" && error && (
        <div className="onboarding-card">
          <h1>Das hat leider nicht geklappt</h1>
          <p className="error-message">{error.message}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Erneut versuchen
          </button>
          <details>
            <summary>Technische Details</summary>
            <pre>{error.technical_detail}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  label,
  progress,
}: {
  label: string;
  progress: DownloadProgress;
}) {
  const pct = Math.min(
    100,
    Math.round((progress.downloaded_bytes / progress.total_bytes) * 100),
  );
  return (
    <div className="progress-block">
      <div className="progress-label">
        <span>{label}</span>
        <span>
          {formatBytes(progress.downloaded_bytes)} von{" "}
          {formatBytes(progress.total_bytes)}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
