import type { A2uiArrayValue, A2uiStringValue } from './types.js';

export interface MultipleChoiceOption {
  label?: A2uiStringValue;
  value: string;
}

export interface MultipleChoiceProps {
  selections?: A2uiArrayValue;
  options?: MultipleChoiceOption[];
  maxAllowedSelections?: number;
  /** checkbox | chips */
  variant?: string;
  filterable?: boolean;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI MultipleChoice 组件：checkbox / chips 两种展示形态 */
export function MultipleChoice({
  selections,
  options = [],
  maxAllowedSelections,
  variant = 'checkbox',
  componentId,
}: MultipleChoiceProps) {
  const selected = selections?.literalArray ?? [];
  const checkedCount = options.filter((option) => selected.includes(option.value)).length;

  return (
    <div id={componentId} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((option) => {
        const isChecked = selected.includes(option.value);
        // 已达上限时禁止继续勾选未选中的项
        const disabled = !isChecked && maxAllowedSelections !== undefined && checkedCount >= maxAllowedSelections;

        if (variant === 'chips') {
          return (
            <label
              key={option.value}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 10px',
                borderRadius: 12,
                border: `1px solid ${isChecked ? '#1677ff' : '#d9d9d9'}`,
                color: isChecked ? '#1677ff' : undefined,
                background: isChecked ? '#e6f4ff' : undefined,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              <input type="checkbox" defaultChecked={isChecked} disabled={disabled} hidden />
              {option.label?.literalString ?? option.value}
            </label>
          );
        }

        return (
          <label
            key={option.value}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <input type="checkbox" defaultChecked={isChecked} disabled={disabled} />
            <span>{option.label?.literalString ?? option.value}</span>
          </label>
        );
      })}
    </div>
  );
}
