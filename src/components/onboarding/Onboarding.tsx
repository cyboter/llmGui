import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  HardwareProfile,
} from "../../api/types";
import { isFriendlyError } from "../../api/types";
import type { ServerConfig } from "../../api/types";
import { translateError } from "../../api/errorTranslation";
import { saveServerSetup, markSetupComplete } from "../../state/appState";
import "./onboarding.css";

type Step =
  | "detecting"
  | "recommendation"
  | "downloading"
  | "starting"
  | "error";

interface DisplayError {
  message: string;
  technicalDetail: string;
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
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("detecting");
  const [hardware, setHardware] = useState<HardwareProfile | null>(null);
  const [models, setModels] = useState<CuratedModel[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [engineProgress, setEngineProgress] = useState<DownloadProgress | null>(null);
  const [modelProgress, setModelProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<DisplayError | null>(null);

  const model = models.find((m) => m.id === selectedId) ?? null;

  function formatBytes(bytes: number): string {
    if (bytes <= 0) return `0 ${t("units.mb")}`;
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(0)} ${t("units.mb")}`;
    return `${(mb / 1024).toFixed(1)} ${t("units.gb")}`;
  }

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
            message: t("onboarding.noModelFound"),
            technicalDetail: "recommend_model returned null",
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
            ? { message: translateError(e), technicalDetail: e.technical_detail }
            : { message: t("onboarding.hardwareDetectionFailed"), technicalDetail: String(e) },
        );
        setStep("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        cache_type_k: "f16",
        cache_type_v: "f16",
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
          ? { message: translateError(e), technicalDetail: e.technical_detail }
          : { message: t("onboarding.setupFailed"), technicalDetail: String(e) },
      );
      setStep("error");
    }
  }

  return (
    <div className="onboarding">
      {step === "detecting" && (
        <div className="onboarding-card">
          <h1>{t("onboarding.welcome")}</h1>
          <p>{t("onboarding.detecting")}</p>
          <div className="spinner" />
        </div>
      )}

      {step === "recommendation" && hardware && model && (
        <div className="onboarding-card onboarding-card-wide">
          <h1>{t("onboarding.ready")}</h1>
          <p className="hw-summary">
            {t("onboarding.hwSummaryRam", { ram: formatBytes(hardware.total_ram_bytes) })}
            {hardware.gpus.length > 0 &&
              t("onboarding.hwSummaryGpu", { gpu: hardware.gpus[0].name })}
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
                  <span className="model-option-badge">{t("onboarding.recommendedBadge")}</span>
                )}
                <h2>{m.label}</h2>
                <p>{m.description}</p>
                <p className="model-size">
                  {t("onboarding.downloadSize", { size: formatBytes(m.approxSizeBytes) })}
                </p>
              </button>
            ))}
          </div>

          <p className="model-license">
            {t("onboarding.license", { name: model.license.name, summary: model.license.summary })}
            <a href={model.license.url} target="_blank" rel="noreferrer">
              {t("onboarding.licenseFullText")}
            </a>
          </p>

          <button className="primary-button" onClick={handleStart}>
            {t("onboarding.setupButton")}
          </button>
          <p className="setup-hint">{t("onboarding.setupHint")}</p>
        </div>
      )}

      {step === "downloading" && (
        <div className="onboarding-card">
          <h1>{t("onboarding.settingUp")}</h1>
          {engineProgress && engineProgress.total_bytes > 0 && (
            <ProgressBar
              label={t("onboarding.engineComponents")}
              progress={engineProgress}
              formatBytes={formatBytes}
            />
          )}
          {modelProgress && modelProgress.total_bytes > 0 && (
            <ProgressBar
              label={t("onboarding.modelDownload")}
              progress={modelProgress}
              formatBytes={formatBytes}
            />
          )}
          {!engineProgress && !modelProgress && <p>{t("onboarding.downloadStarting")}</p>}
        </div>
      )}

      {step === "starting" && (
        <div className="onboarding-card">
          <h1>{t("onboarding.almostDone")}</h1>
          <p>{t("onboarding.startingModel")}</p>
          <div className="spinner" />
        </div>
      )}

      {step === "error" && error && (
        <div className="onboarding-card">
          <h1>{t("onboarding.errorTitle")}</h1>
          <p className="error-message">{error.message}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            {t("onboarding.retryButton")}
          </button>
          <details>
            <summary>{t("onboarding.technicalDetails")}</summary>
            <pre>{error.technicalDetail}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  label,
  progress,
  formatBytes,
}: {
  label: string;
  progress: DownloadProgress;
  formatBytes: (bytes: number) => string;
}) {
  const { t } = useTranslation();
  const pct = Math.min(
    100,
    Math.round((progress.downloaded_bytes / progress.total_bytes) * 100),
  );
  return (
    <div className="progress-block">
      <div className="progress-label">
        <span>{label}</span>
        <span>
          {t("onboarding.downloadedOf", {
            downloaded: formatBytes(progress.downloaded_bytes),
            total: formatBytes(progress.total_bytes),
          })}
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
