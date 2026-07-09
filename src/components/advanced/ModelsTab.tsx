import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { downloadModel, loadCuratedModels, pickGgufFile, validateCustomModel } from "../../api/backend";
import type { CuratedModel } from "../../api/types";
import { isFriendlyError } from "../../api/types";
import { translateError } from "../../api/errorTranslation";
import {
  addCustomModel,
  loadCustomModels,
  removeCustomModel,
  type CustomModel,
} from "../../state/customModels";
import { loadEngineRepo, saveEngineRepo } from "../../state/appState";

const CUSTOM_MODEL_DISCLAIMER_KEY = "llmgui.customModelDisclaimerSeen";

function hasSeenCustomModelDisclaimer(): boolean {
  return localStorage.getItem(CUSTOM_MODEL_DISCLAIMER_KEY) === "true";
}

function markCustomModelDisclaimerSeen(): void {
  localStorage.setItem(CUSTOM_MODEL_DISCLAIMER_KEY, "true");
}

interface ModelsTabProps {
  selectedModelPath: string;
  onSelectModel: (path: string) => void;
}

export default function ModelsTab({ selectedModelPath, onSelectModel }: ModelsTabProps) {
  const { t } = useTranslation();

  function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} ${t("units.gb")}`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} ${t("units.mb")}`;
  }

  const [curated, setCurated] = useState<CuratedModel[]>([]);
  const [custom, setCustom] = useState<CustomModel[]>(() => loadCustomModels());
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [repo, setRepo] = useState(loadEngineRepo() ?? "");

  useEffect(() => {
    loadCuratedModels().then(setCurated).catch(() => setCurated([]));
  }, []);

  async function handlePickFile() {
    setImportError(null);

    if (!hasSeenCustomModelDisclaimer()) {
      const confirmed = window.confirm(t("models.disclaimerConfirm"));
      if (!confirmed) return;
      markCustomModelDisclaimerSeen();
    }

    const path = await pickGgufFile();
    if (!path) return;

    setImporting(true);
    try {
      const info = await validateCustomModel(path);
      const updated = addCustomModel({
        path: info.path,
        fileName: info.file_name,
        sizeBytes: info.size_bytes,
        addedAt: Date.now(),
      });
      setCustom(updated);
      onSelectModel(info.path);
    } catch (e) {
      setImportError(isFriendlyError(e) ? translateError(e) : t("models.fileLoadError"));
    } finally {
      setImporting(false);
    }
  }

  function handleRemoveCustom(path: string) {
    setCustom(removeCustomModel(path));
  }

  function handleRepoChange(value: string) {
    setRepo(value);
    saveEngineRepo(value || null);
  }

  async function handleSelectCurated(model: CuratedModel) {
    setImportError(null);
    setDownloadingId(model.id);
    try {
      const path = await downloadModel(model);
      onSelectModel(path);
    } catch (e) {
      setImportError(isFriendlyError(e) ? translateError(e) : t("models.downloadError"));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="models-tab">
      <section>
        <h3>{t("models.ownModels")}</h3>
        <p className="hint">{t("models.ownModelsHint")}</p>
        <button className="secondary-button" onClick={handlePickFile} disabled={importing}>
          {importing ? t("models.checking") : t("models.pickFile")}
        </button>
        {importError && <div className="advanced-error">{importError}</div>}

        <ul className="model-list">
          {custom.map((m) => (
            <li key={m.path} className={m.path === selectedModelPath ? "selected" : ""}>
              <button className="model-list-item" onClick={() => onSelectModel(m.path)}>
                <span className="model-name">{m.fileName}</span>
                <span className="model-meta">{formatBytes(m.sizeBytes)}</span>
              </button>
              <button
                className="remove-button"
                onClick={() => handleRemoveCustom(m.path)}
                aria-label={t("models.removeLabel")}
              >
                ×
              </button>
            </li>
          ))}
          {custom.length === 0 && <li className="hint">{t("models.noOwnModels")}</li>}
        </ul>
      </section>

      <section>
        <h3>{t("models.curatedModels")}</h3>
        <p className="hint">{t("models.curatedModelsHint")}</p>
        <ul className="model-list">
          {curated.map((m) => (
            <li key={m.id}>
              <button
                className="model-list-item"
                onClick={() => handleSelectCurated(m)}
                disabled={downloadingId !== null}
              >
                <span className="model-name">{m.label}</span>
                <span className="model-meta">
                  {downloadingId === m.id ? t("models.loading") : formatBytes(m.approxSizeBytes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>{t("models.engineSource")}</h3>
        <p className="hint">{t("models.engineSourceHint")}</p>
        <input
          type="text"
          placeholder="ggml-org/llama.cpp"
          value={repo}
          onChange={(e) => handleRepoChange(e.target.value)}
        />
      </section>
    </div>
  );
}
