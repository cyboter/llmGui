import type { ServerConfig } from "../../api/types";
import SliderField from "../shared/SliderField";

interface ParametersTabProps {
  draft: ServerConfig;
  onChange: (patch: Partial<ServerConfig>) => void;
}

export default function ParametersTab({ draft, onChange }: ParametersTabProps) {
  return (
    <div className="parameters-tab">
      <SliderField
        label="Kreativität (Temperature)"
        tooltip="Höhere Werte machen Antworten kreativer und weniger vorhersehbar."
        value={draft.temperature}
        min={0}
        max={2}
        step={0.05}
        onChange={(v) => onChange({ temperature: v })}
      />
      <SliderField
        label="Top-P"
        tooltip="Begrenzt die Auswahl auf die wahrscheinlichsten Wörter, deren Wahrscheinlichkeit zusammen diesen Wert ergibt."
        value={draft.top_p}
        min={0}
        max={1}
        step={0.01}
        onChange={(v) => onChange({ top_p: v })}
      />
      <SliderField
        label="Top-K"
        tooltip="Begrenzt die Auswahl auf die K wahrscheinlichsten Wörter je Antwortschritt."
        value={draft.top_k}
        min={1}
        max={100}
        step={1}
        onChange={(v) => onChange({ top_k: v })}
      />
      <SliderField
        label="Wiederholungs-Bestrafung"
        tooltip="Höhere Werte verringern die Wahrscheinlichkeit, dass sich das Modell wiederholt."
        value={draft.repeat_penalty}
        min={1}
        max={2}
        step={0.01}
        onChange={(v) => onChange({ repeat_penalty: v })}
      />
      <SliderField
        label="Kontext-Länge (Token)"
        tooltip="Wie viel Text (eigene Nachrichten + Antworten) sich das Modell merken kann. Größere Werte brauchen mehr Arbeitsspeicher."
        value={draft.context_size}
        min={512}
        max={32768}
        step={512}
        onChange={(v) => onChange({ context_size: v })}
      />
      <SliderField
        label="CPU-Threads"
        tooltip="Anzahl der Prozessorkerne, die für die Berechnung genutzt werden."
        value={draft.threads}
        min={1}
        max={32}
        step={1}
        onChange={(v) => onChange({ threads: v })}
      />
      <SliderField
        label="GPU-Layer"
        tooltip="Wie viele Modell-Schichten auf die Grafikkarte ausgelagert werden. Höhere Werte sind schneller, brauchen aber mehr Grafikspeicher."
        value={draft.gpu_layers}
        min={0}
        max={999}
        step={1}
        onChange={(v) => onChange({ gpu_layers: v })}
      />

      <div className="field-block">
        <label htmlFor="server-port">Server-Port</label>
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
        <label htmlFor="system-prompt">System-Prompt</label>
        <textarea
          id="system-prompt"
          rows={4}
          placeholder="z.B. „Du bist ein hilfreicher Assistent, der kurz und präzise antwortet.“"
          value={draft.system_prompt ?? ""}
          onChange={(e) => onChange({ system_prompt: e.target.value || null })}
        />
      </div>
    </div>
  );
}
