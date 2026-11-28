/**
 * surface 数据模型。值是普通 JSON：字符串、数字、布尔、对象或数组。
 * dataModelUpdate 的 contents 邻接表在写入前解码成这棵对象。
 */
export type DataValue = string | number | boolean | DataModel | DataValue[];

export interface DataModel {
  [key: string]: DataValue;
}

/** dataModelUpdate.contents 的一条邻接表记录，valueMap 按协议示例递归 */
export interface DataEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: DataEntry[];
}

export interface ImplicitWrite {
  path: string;
  value: DataValue;
}

const LITERAL_KEYS = [
  'literalString',
  'literalNumber',
  'literalBoolean',
  'literalArray',
] as const;

export function isDataModel(value: unknown): value is DataModel {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 去掉首尾空段。`/` 与空路径都表示模型根。 */
export function splitPath(path: string | undefined): string[] {
  if (!path) return [];
  return path.split('/').filter((segment) => segment.length > 0);
}

export function decodeContents(entries: DataEntry[]): DataModel {
  const model: DataModel = {};
  if (!Array.isArray(entries)) return model;
  for (const entry of entries) {
    if (!entry || typeof entry.key !== 'string') continue;
    const value = decodeEntryValue(entry);
    if (value !== undefined) model[entry.key] = value;
  }
  return model;
}

function decodeEntryValue(entry: DataEntry): DataValue | undefined {
  if ('valueString' in entry && entry.valueString !== undefined) return entry.valueString;
  if ('valueNumber' in entry && entry.valueNumber !== undefined) return entry.valueNumber;
  if ('valueBoolean' in entry && entry.valueBoolean !== undefined) return entry.valueBoolean;
  if (Array.isArray(entry.valueMap)) return decodeContents(entry.valueMap);
  return undefined;
}

/**
 * 把 contents 应用到模型。
 * path 省略或为 `/` 时整棵替换；否则替换该路径上的子树，并补齐中间对象。
 */
export function applyContents(
  model: DataModel,
  path: string | undefined,
  contents: DataEntry[],
): DataModel {
  const decoded = decodeContents(contents);
  const segments = splitPath(path);
  if (segments.length === 0) return decoded;
  return setAtPath(model, segments, decoded);
}

/** 把单个值写到 path。用于 path + literal 的隐式初始化。 */
export function setValueAtPath(model: DataModel, path: string, value: DataValue): DataModel {
  const segments = splitPath(path);
  if (segments.length === 0) return isDataModel(value) ? value : model;
  return setAtPath(model, segments, value);
}

export function applyImplicitValues(model: DataModel, writes: ImplicitWrite[]): DataModel {
  return writes.reduce(
    (current, write) => setValueAtPath(current, write.path, write.value),
    model,
  );
}

function setAtPath(model: DataModel, segments: string[], value: DataValue): DataModel {
  const [head, ...rest] = segments;
  if (!head) return model;
  if (rest.length === 0) return { ...model, [head]: value };
  const current = model[head];
  const child = isDataModel(current) ? current : {};
  return { ...model, [head]: setAtPath(child, rest, value) };
}

/**
 * 以 `/` 开头的路径从 surface 模型根解析。
 * 否则相对 context；没有模板上下文时从 surface 根解析。
 */
export function lookupPath(
  model: DataModel | undefined,
  path: string,
  context?: DataModel,
): DataValue | undefined {
  const base = !path.startsWith('/') && context ? context : model;
  if (base === undefined) return undefined;
  const segments = splitPath(path);
  if (segments.length === 0) return base;
  let cursor: DataValue | undefined = base;
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || String(index) !== segment) return undefined;
      cursor = cursor[index];
    } else if (isDataModel(cursor)) {
      cursor = cursor[segment];
    } else {
      return undefined;
    }
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

/** 对象按插入顺序，数组按下标。其他值不是集合。 */
export function iterateCollection(value: DataValue | undefined): Array<[string, DataValue]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  if (isDataModel(value)) return Object.entries(value);
  return [];
}

/**
 * 扫描组件 props：path 与 literal* 同时出现时，记下要写入模型的值。
 * 只在 surfaceUpdate 解析时调用一次，重渲染不再执行。
 */
export function collectImplicitInits(value: unknown, writes: ImplicitWrite[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectImplicitInits(item, writes);
    return;
  }
  if (!isDataModel(value)) return;
  if (typeof value.path === 'string') {
    const literal = readLiteral(value);
    if (literal !== undefined) writes.push({ path: value.path, value: literal });
    return;
  }
  for (const child of Object.values(value)) collectImplicitInits(child, writes);
}

function readLiteral(record: Record<string, unknown>): DataValue | undefined {
  if (typeof record.literalString === 'string') return record.literalString;
  if (typeof record.literalNumber === 'number') return record.literalNumber;
  if (typeof record.literalBoolean === 'boolean') return record.literalBoolean;
  if (Array.isArray(record.literalArray)) return record.literalArray as DataValue[];
  return undefined;
}

/**
 * 给渲染器的 props 副本。有 path 时从模型填回对应 literal*；
 * 模型里没有值则去掉 literal，让组件渲染为空。没有 path 的字面量原样保留。
 */
export function resolveBoundProps(
  props: Record<string, unknown>,
  model: DataModel | undefined,
  context?: DataModel,
): Record<string, unknown> {
  return resolveValue(props, model, context) as Record<string, unknown>;
}

function resolveValue(
  value: unknown,
  model: DataModel | undefined,
  context?: DataModel,
): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, model, context));
  if (!isDataModel(value)) return value;
  if (typeof value.path === 'string') {
    return fillLiteral(value, lookupPath(model, value.path, context));
  }
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = resolveValue(child, model, context);
  }
  return next;
}

function fillLiteral(
  record: Record<string, unknown>,
  resolved: DataValue | undefined,
): Record<string, unknown> {
  if (isDataModel(resolved)) return { ...record };
  const next = { ...record };
  for (const key of LITERAL_KEYS) delete next[key];
  if (typeof resolved === 'string') next.literalString = resolved;
  else if (typeof resolved === 'number') next.literalNumber = resolved;
  else if (typeof resolved === 'boolean') next.literalBoolean = resolved;
  else if (Array.isArray(resolved)) next.literalArray = resolved;
  return next;
}
