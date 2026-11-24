import type { A2uiStringValue } from './types.js';

export interface VideoProps {
  url?: A2uiStringValue;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI Video 组件：url 缺失时不渲染 */
export function Video({ url, componentId }: VideoProps) {
  const src = url?.literalString;
  if (!src) return null;

  return (
    <video
      id={componentId}
      controls
      src={src}
      style={{ display: 'block', maxWidth: '100%', maxHeight: 320 }}
    />
  );
}
