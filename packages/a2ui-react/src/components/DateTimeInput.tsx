import type { A2uiStringValue } from './types.js';

export interface DateTimeInputProps {
  value?: A2uiStringValue;
  enableDate?: boolean;
  enableTime?: boolean;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI DateTimeInput 组件：按 enableDate / enableTime 选择原生输入类型 */
export function DateTimeInput({
  value,
  enableDate,
  enableTime,
  componentId,
}: DateTimeInputProps) {
  let inputType = 'text';
  if (enableDate && enableTime) inputType = 'datetime-local';
  else if (enableDate) inputType = 'date';
  else if (enableTime) inputType = 'time';

  return (
    <input
      id={componentId}
      type={inputType}
      defaultValue={value?.literalString ?? ''}
      style={{ padding: 6, border: '1px solid #d9d9d9', borderRadius: 4 }}
    />
  );
}
