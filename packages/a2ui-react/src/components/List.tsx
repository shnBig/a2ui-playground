import type { CSSProperties, ReactNode } from 'react';

export interface ListProps {
  /** vertical / horizontal，缺省为垂直 */
  direction?: string;
  /** start / center / end / stretch，交叉轴对齐 */
  alignment?: string;
  children?: ReactNode;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

const ALIGN_BY_ALIGNMENT: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/**
 * A2UI List 容器：按 direction 排列子组件。
 * 动态子项来自 children.template，由 treeBuild 展开后通过 children 传入。
 */
export function List({ direction, alignment, children, componentId }: ListProps) {
  return (
    <div
      id={componentId}
      style={{
        display: 'flex',
        flexDirection: direction === 'horizontal' ? 'row' : 'column',
        gap: 8,
        alignItems: alignment ? ALIGN_BY_ALIGNMENT[alignment] : undefined,
      }}
    >
      {children}
    </div>
  );
}
