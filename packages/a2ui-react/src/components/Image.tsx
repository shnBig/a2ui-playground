import type { CSSProperties } from 'react';
import type { A2uiStringValue } from './types.js';

export interface ImageProps {
  url?: A2uiStringValue;
  altText?: A2uiStringValue;
  /** contain / cover / fill / none / scale-down */
  fit?: string;
  /** icon / avatar / smallFeature / mediumFeature / largeFeature / header */
  usageHint?: string;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

const SIZE_BY_HINT: Record<string, CSSProperties> = {
  icon: { width: 32, height: 32 },
  avatar: { width: 48, height: 48, borderRadius: '50%' },
  smallFeature: { width: 120, height: 90 },
  mediumFeature: { width: 240, height: 160 },
  largeFeature: { width: '100%', maxWidth: 480, height: 280 },
  header: { width: '100%', height: 200 },
};

/** A2UI Image 组件：url 缺失时不渲染 */
export function Image({ url, altText, fit, usageHint, componentId }: ImageProps) {
  const src = url?.literalString;
  if (!src) return null;

  return (
    <img
      id={componentId}
      src={src}
      alt={altText?.literalString ?? ''}
      style={{
        display: 'block',
        objectFit: (fit as CSSProperties['objectFit']) ?? 'cover',
        ...(usageHint ? SIZE_BY_HINT[usageHint] : undefined),
      }}
    />
  );
}
