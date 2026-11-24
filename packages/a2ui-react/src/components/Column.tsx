import type { CSSProperties, ReactNode } from 'react';

export interface ColumnProps {
  /** start / center / end / spaceBetween / spaceAround / spaceEvenly */
  distribution?: string;
  /** start / center / end / stretch */
  alignment?: string;
  children?: ReactNode;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

const JUSTIFY_BY_DISTRIBUTION: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
};

const ALIGN_BY_ALIGNMENT: Record<string, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/**
 * A2UI Column 容器组件：竖向排列子组件。
 * 子节点由 treeBuild 组装后通过 children 传入。
 */
export function Column({ distribution, alignment, children, componentId }: ColumnProps) {
  return (
    <div
      id={componentId}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        justifyContent: distribution ? JUSTIFY_BY_DISTRIBUTION[distribution] : undefined,
        alignItems: alignment ? ALIGN_BY_ALIGNMENT[alignment] : undefined,
      }}
    >
      {children}
    </div>
  );
}
