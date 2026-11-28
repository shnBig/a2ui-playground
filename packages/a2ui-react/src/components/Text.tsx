import type { ElementType } from 'react';

/** 协议中的文本对象：字面量或数据模型路径引用 */
export interface A2uiTextValue {
  literalString?: string;
  path?: string;
}

export interface TextProps {
  text?: A2uiTextValue;
  /** h1..h5 / caption / body */
  usageHint?: string;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

const TAG_BY_HINT: Record<string, ElementType> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  caption: 'span',
  body: 'p',
};

/**
 * A2UI Text 组件：按 usageHint 映射到对应标签渲染文本。
 * path 由 a2ui-core 在调用渲染器前解析成 literalString，这里只显示字面量。
 */
export function Text({ text, usageHint, componentId }: TextProps) {
  const content = text?.literalString ?? '';
  const Tag: ElementType = (usageHint && TAG_BY_HINT[usageHint]) || 'p';

  if (usageHint === 'caption') {
    return (
      <Tag id={componentId} style={{ fontSize: 12, color: '#888' }}>
        {content}
      </Tag>
    );
  }
  return <Tag id={componentId}>{content}</Tag>;
}
