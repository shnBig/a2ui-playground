import { getStore } from '@a2ui/core';
import type { DataEntry } from '@a2ui/core';

/** Button.action 的运行时形状（含 react catalog 的 localUpdate 扩展） */
export interface A2uiAction {
  name?: string;
  type?: string;
  context?: unknown;
  dataModelUpdate?: {
    path?: string;
    contents?: DataEntry[];
  };
}

export interface DispatchActionInput {
  surfaceId: string;
  componentId: string;
  action: A2uiAction | undefined;
}

/**
 * 处理组件触发的 action。
 * - localUpdate：用当前 surfaceId 调用 applyDataModelUpdate，不上送 userAction
 * - server / 缺省：本阶段 no-op
 */
export function dispatchAction({ surfaceId, action }: DispatchActionInput): void {
  if (!action || typeof action !== 'object') return;

  if (action.type === 'localUpdate') {
    const update = action.dataModelUpdate;
    if (!update || !Array.isArray(update.contents)) return;
    getStore()
      .getState()
      .applyDataModelUpdate(surfaceId, update.path, update.contents);
    return;
  }
}
