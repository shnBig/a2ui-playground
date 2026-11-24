import type { A2uiBooleanValue, A2uiStringValue } from './types.js';

export interface CheckBoxProps {
  label?: A2uiStringValue;
  value?: A2uiBooleanValue;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI CheckBox 组件：受控于协议值，勾选变更暂不回写数据模型 */
export function CheckBox({ label, value, componentId }: CheckBoxProps) {
  return (
    <label
      id={componentId}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
    >
      <input type="checkbox" defaultChecked={value?.literalBoolean ?? false} />
      <span>{label?.literalString ?? ''}</span>
    </label>
  );
}
