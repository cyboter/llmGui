import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ServerConfig } from "../../api/types";
import ParametersTab from "./ParametersTab";
import ModelsTab from "./ModelsTab";
import LogsTab from "./LogsTab";
import LanguageSwitcher from "../shared/LanguageSwitcher";
import "./advanced.css";

type Tab = "parameters" | "models" | "logs";

interface AdvancedPanelProps {
  open: boolean;
  onClose: () => void;
  config: ServerConfig;
  onApply: (config: ServerConfig, modelPath: string) => Promise<void>;
  applying: boolean;
  applyError: string | null;
}

export default function AdvancedPanel({
  open,
  onClose,
  config,
  onApply,
  applying,
  applyError,
}: AdvancedPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("parameters");
  const [draft, setDraft] = useState<ServerConfig>(config);
  const [selectedModelPath, setSelectedModelPath] = useState(config.model_path);

  if (!open) return null;

  function updateDraft(patch: Partial<ServerConfig>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <div className="advanced-overlay">
      <div className="advanced-panel">
        <div className="advanced-header">
          <h2>{t("advanced.title")}</h2>
          <button className="close-button" onClick={onClose} aria-label={t("advanced.close")}>
            ×
          </button>
        </div>

        <div className="advanced-tabs">
          <button
            className={tab === "parameters" ? "active" : ""}
            onClick={() => setTab("parameters")}
          >
            {t("advanced.tabs.parameters")}
          </button>
          <button
            className={tab === "models" ? "active" : ""}
            onClick={() => setTab("models")}
          >
            {t("advanced.tabs.models")}
          </button>
          <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>
            {t("advanced.tabs.logs")}
          </button>
        </div>

        <div className="advanced-content">
          {tab === "parameters" && (
            <>
              <LanguageSwitcher />
              <ParametersTab draft={draft} onChange={updateDraft} />
            </>
          )}
          {tab === "models" && (
            <ModelsTab
              selectedModelPath={selectedModelPath}
              onSelectModel={(path) => {
                setSelectedModelPath(path);
                updateDraft({ model_path: path });
              }}
            />
          )}
          {tab === "logs" && <LogsTab />}
        </div>

        <div className="advanced-footer">
          {applyError && <div className="advanced-error">{applyError}</div>}
          <button
            className="primary-button"
            disabled={applying}
            onClick={() => onApply(draft, selectedModelPath)}
          >
            {applying ? t("advanced.applying") : t("advanced.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
