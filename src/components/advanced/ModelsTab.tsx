import { useEffect, useState } from "react";
import { downloadModel, loadCuratedModels, pickGgufFile, validateCustomModel } from "../../api/backend";
import type { CuratedModel } from "../../api/types";
import { isFriendlyError } from "../../api/types";
import {
  addCustomModel,
  loadCustomModels,
  removeCustomModel,
  type CustomModel,
} from "../../state/customModels";
import { loadEngineRepo, saveEngineRepo } from "../../state/appState";

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

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
      const confirmed = window.confirm(
        "Eigene Modelldateien stammen nicht von uns geprüft. Bitte stelle sicher, dass du die " +
          "Lizenzbedingungen des jeweiligen Modells kennst und einhältst.\n\nFortfahren?",
      );
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
      setImportError(isFriendlyError(e) ? e.message : "Die Datei konnte nicht geladen werden.");
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
      setImportError(
        isFriendlyError(e) ? e.message : "Das Modell konnte nicht geladen werden.",
      );
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="models-tab">
      <section>
        <h3>Eigene Modelle</h3>
        <p className="hint">
          Lade eine eigene GGUF-Datei von deinem Computer. Beachte die Lizenzbedingungen des
          jeweiligen Modells.
        </p>
        <button className="secondary-button" onClick={handlePickFile} disabled={importing}>
          {importing ? "Wird geprüft…" : "GGUF-Datei auswählen…"}
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
                aria-label="Entfernen"
              >
                ×
              </button>
            </li>
          ))}
          {custom.length === 0 && <li className="hint">Noch keine eigenen Modelle geladen.</li>}
        </ul>
      </section>

      <section>
        <h3>Kuratierte Modelle</h3>
        <p className="hint">
          Ein Klick lädt das Modell herunter (falls noch nicht vorhanden) und wählt es aus.
        </p>
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
                  {downloadingId === m.id ? "Wird geladen…" : formatBytes(m.approxSizeBytes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Engine-Quelle</h3>
        <p className="hint">
          Standardmäßig wird llama-server von ggml-org/llama.cpp geladen. Hier kann ein Fork
          angegeben werden (Format: besitzer/repo).
        </p>
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
