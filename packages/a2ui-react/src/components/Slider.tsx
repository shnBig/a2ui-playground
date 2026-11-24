import type { A2uiNumberValue, A2uiStringValue } from './types.js';

export interface SliderProps {
  label?: A2uiStringValue;
  value?: A2uiNumberValue;
  minValue?: number;
  maxValue?: number;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI Slider 组件 */
export function Slider({
  label,
  value,
  minValue = 0,
  maxValue = 100,
  componentId,
}: SliderProps) {
  return (
    <label
      id={componentId}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320 }}
    >
      {label?.literalString ? (
        <span style={{ fontSize: 13, color: '#555' }}>{label.literalString}</span>
      ) : null}
      <input
        type="range"
        min={minValue}
        max={maxValue}
        defaultValue={value?.literalNumber ?? minValue}
      />
    </label>
  );
}
