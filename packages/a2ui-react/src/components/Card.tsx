import type { ReactNode } from 'react';

export interface CardProps {
  /** 子节点：协议中 child 指向的组件，由 treeBuild 组装后注入 */
  children?: ReactNode;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/**
 * A2UI Card 容器组件：通过 child 引用一个子组件，提供卡片外观。
 * 子节点由 treeBuild 组装后通过 children 传入。
 */
export function Card({ children, componentId }: CardProps) {
  return (
    <div
      id={componentId}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 12,
        padding: 16,
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
      }}
    >
      {children}
    </div>
  );
}
