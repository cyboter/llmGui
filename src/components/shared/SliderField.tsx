interface SliderFieldProps {
  label: string;
  tooltip: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export default function SliderField({
  label,
  tooltip,
  value,
  min,
  max,
  step,
  onChange,
}: SliderFieldProps) {
  return (
    <div className="slider-field" title={tooltip}>
      <div className="slider-field-header">
        <span>{label}</span>
        <span className="slider-field-value">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
