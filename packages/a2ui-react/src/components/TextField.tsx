import type { A2uiStringValue } from './types.js';

export interface TextFieldProps {
  label?: A2uiStringValue;
  text?: A2uiStringValue;
  /** date / longText / number / shortText / obscured */
  textFieldType?: string;
  validationRegexp?: string;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

const INPUT_TYPE_BY_FIELD: Record<string, string> = {
  date: 'date',
  number: 'number',
  obscured: 'password',
  shortText: 'text',
};

/** A2UI TextField 组件：longText 渲染 textarea，其余映射为对应 input type */
export function TextField({
  label,
  text,
  textFieldType,
  validationRegexp,
  componentId,
}: TextFieldProps) {
  const labelText = label?.literalString ?? '';
  const defaultValue = text?.literalString ?? '';

  return (
    <label
      id={componentId}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 320 }}
    >
      <span style={{ fontSize: 13, color: '#555' }}>{labelText}</span>
      {textFieldType === 'longText' ? (
        <textarea
          rows={3}
          defaultValue={defaultValue}
          style={{ padding: 6, border: '1px solid #d9d9d9', borderRadius: 4 }}
        />
      ) : (
        <input
          type={INPUT_TYPE_BY_FIELD[textFieldType ?? 'shortText'] ?? 'text'}
          defaultValue={defaultValue}
          // 浏览器原生 pattern 校验，协议未给正则时不设置
          pattern={validationRegexp}
          style={{ padding: 6, border: '1px solid #d9d9d9', borderRadius: 4 }}
        />
      )}
    </label>
  );
}
