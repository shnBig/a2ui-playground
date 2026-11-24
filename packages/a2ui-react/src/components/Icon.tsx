import type { A2uiStringValue } from './types.js';

export interface IconProps {
  name?: A2uiStringValue;
  /** 组件在协议中的 id，渲染到根元素上便于定位 */
  componentId?: string;
}

/** 协议枚举的图标名 → 近似字符画（无图标库依赖） */
const GLYPH_BY_NAME: Record<string, string> = {
  accountCircle: '👤',
  add: '＋',
  arrowBack: '←',
  arrowForward: '→',
  attachFile: '📎',
  calendarToday: '📅',
  call: '📞',
  camera: '📷',
  check: '✓',
  close: '✕',
  delete: '🗑',
  download: '⬇',
  edit: '✏️',
  event: '📅',
  error: '⛔',
  favorite: '★',
  favoriteOff: '☆',
  folder: '📁',
  help: '？',
  home: '🏠',
  info: 'ℹ️',
  locationOn: '📍',
  lock: '🔒',
  lockOpen: '🔓',
  mail: '✉️',
  menu: '☰',
  moreVert: '⋮',
  moreHoriz: '⋯',
  notifications: '🔔',
  notificationsOff: '🔕',
  payment: '💳',
  person: '👤',
  phone: '📞',
  photo: '🖼',
  print: '🖨',
  refresh: '↻',
  search: '🔍',
  send: '➤',
  settings: '⚙️',
  share: '↗',
  shoppingCart: '🛒',
  star: '★',
  starHalf: '⯨',
  starOff: '☆',
  upload: '⬆',
  visibility: '👁',
  visibilityOff: '🙈',
  warning: '⚠️',
};

/** A2UI Icon 组件：未知图标名降级为空 */
export function Icon({ name, componentId }: IconProps) {
  const iconName = name?.literalString;
  if (!iconName) return null;
  const glyph = GLYPH_BY_NAME[iconName];
  if (!glyph) return null;

  return (
    <span
      id={componentId}
      role="img"
      aria-label={iconName}
      title={iconName}
      style={{ fontSize: 20, lineHeight: 1 }}
    >
      {glyph}
    </span>
  );
}
