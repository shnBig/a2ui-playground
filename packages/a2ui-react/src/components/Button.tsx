import type { ReactNode } from 'react';
import { dispatchAction } from '../actions/dispatchAction.js';
import type { A2uiAction } from '../actions/dispatchAction.js';

export interface ButtonProps {
  /** 是否按主操作样式渲染 */
  primary?: boolean;
  /** 点击时分发的 action（可含 localUpdate） */
  action?: A2uiAction;
  /** 协议 child 指向的子组件，由 treeBuild / attachChildren 注入 */
  children?: ReactNode;
  componentId?: string;
  surfaceId?: string;
}

/**
 * A2UI Button：点击后走 dispatchAction。
 * localUpdate 时本地 applyDataModelUpdate；server 本阶段不上送。
 */
export function Button({
  primary = false,
  action,
  children,
  componentId,
  surfaceId,
}: ButtonProps) {
  return (
    <button
      id={componentId}
      type="button"
      onClick={() => {
        if (!surfaceId || !componentId) return;
        dispatchAction({ surfaceId, componentId, action });
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: primary ? '8px 16px' : '6px 12px',
        borderRadius: 8,
        border: primary ? 'none' : '1px solid #d1d5db',
        background: primary ? '#111827' : '#fff',
        color: primary ? '#fff' : '#111827',
        cursor: 'pointer',
        fontSize: 14,
      }}
    >
      {children}
    </button>
  );
}
