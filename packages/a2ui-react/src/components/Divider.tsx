export interface DividerProps {
  /** horizontal | vertical */
  axis?: string;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** A2UI Divider 组件 */
export function Divider({ axis = 'horizontal', componentId }: DividerProps) {
  if (axis === 'vertical') {
    return (
      <span
        id={componentId}
        aria-orientation="vertical"
        style={{
          display: 'inline-block',
          width: 1,
          height: '1.2em',
          background: '#d9d9d9',
          verticalAlign: 'middle',
          margin: '0 8px',
        }}
      />
    );
  }
  return (
    <hr
      id={componentId}
      style={{ border: 'none', borderTop: '1px solid #d9d9d9', margin: '8px 0' }}
    />
  );
}
