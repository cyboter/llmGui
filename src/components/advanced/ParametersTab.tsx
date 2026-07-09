import { useTranslation } from "react-i18next";
import type { CacheType, ServerConfig } from "../../api/types";
import SliderField from "../shared/SliderField";

interface ParametersTabProps {
  draft: ServerConfig;
  onChange: (patch: Partial<ServerConfig>) => void;
}

const CACHE_TYPES: CacheType[] = ["f16", "q8_0", "q4_0"];

export default function ParametersTab({ draft, onChange }: ParametersTabProps) {
  const { t } = useTranslation();

  return (
    <div className="parameters-tab">
      <SliderField
        label={t("parameters.temperature.label")}
        tooltip={t("parameters.temperature.tooltip")}
        value={draft.temperature}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => onChange({ temperature: v })}
      />
      <SliderField
        label={t("parameters.topP.label")}
        tooltip={t("parameters.topP.tooltip")}
        value={draft.top_p}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ top_p: v })}
      />
      <SliderField
        label={t("parameters.topK.label")}
        tooltip={t("parameters.topK.tooltip")}
        value={draft.top_k}
        min={1}
        max={100}
        step={1}
        onChange={(v) => onChange({ top_k: v })}
      />
      <SliderField
        label={t("parameters.repeatPenalty.label")}
        tooltip={t("parameters.repeatPenalty.tooltip")}
        value={draft.repeat_penalty}
        min={1}
        max={2}
        step={0.01}
        onChange={(v) => onChange({ repeat_penalty: v })}
      />
      <SliderField
        label={t("parameters.contextSize.label")}
        tooltip={t("parameters.contextSize.tooltip")}
        value={draft.context_size}
        min={512}
        max={32768}
        step={512}
        onChange={(v) => onChange({ context_size: v })}
      />
      <SliderField
        label={t("parameters.threads.label")}
        tooltip={t("parameters.threads.tooltip")}
        value={draft.threads}
        min={1}
        max={32}
        step={1}
        onChange={(v) => onChange({ threads: v })}
      />
      <SliderField
        label={t("parameters.gpuLayers.label")}
        tooltip={t("parameters.gpuLayers.tooltip")}
        value={draft.gpu_layers}
        min={0}
        max={999}
        step={1}
        onChange={(v) => onChange({ gpu_layers: v })}
      />

      <div className="field-block" title={t("parameters.cacheTypeK.tooltip")}>
        <label htmlFor="cache-type-k">{t("parameters.cacheTypeK.label")}</label>
        <select
          id="cache-type-k"
          value={draft.cache_type_k}
          onChange={(e) => onChange({ cache_type_k: e.target.value as CacheType })}
        >
          {CACHE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block" title={t("parameters.cacheTypeV.tooltip")}>
        <label htmlFor="cache-type-v">{t("parameters.cacheTypeV.label")}</label>
        <select
          id="cache-type-v"
          value={draft.cache_type_v}
          onChange={(e) => onChange({ cache_type_v: e.target.value as CacheType })}
        >
          {CACHE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <label htmlFor="server-port">{t("parameters.serverPort")}</label>
        <input
          id="server-port"
          type="number"
          min={1024}
          max={65535}
          value={draft.port}
          onChange={(e) => onChange({ port: Number(e.target.value) })}
        />
      </div>

      <div className="field-block">
        <label htmlFor="system-prompt">{t("parameters.systemPrompt")}</label>
        <textarea
          id="system-prompt"
          rows={4}
          placeholder={t("parameters.systemPromptPlaceholder")}
          value={draft.system_prompt ?? ""}
          onChange={(e) => onChange({ system_prompt: e.target.value || null })}
        />
      </div>
    </div>
  );
}
