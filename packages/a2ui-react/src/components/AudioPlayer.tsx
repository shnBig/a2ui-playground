import type { A2uiStringValue } from './types.js';

export interface AudioPlayerProps {
  url?: A2uiStringValue;
  description?: A2uiStringValue;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI AudioPlayer 组件：展示描述文本 + 原生音频控件 */
export function AudioPlayer({ url, description, componentId }: AudioPlayerProps) {
  const src = url?.literalString;
  if (!src) return null;

  return (
    <figure
      id={componentId}
      style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {description?.literalString ? (
        <figcaption style={{ fontSize: 13, color: '#555' }}>
          {description.literalString}
        </figcaption>
      ) : null}
      <audio controls src={src} style={{ width: '100%', maxWidth: 360 }} />
    </figure>
  );
}
