/**
 * 协议中的可绑定值：字面量、path，或两者同时出现。
 * path 由 a2ui-core 按 store 里的数据模型解析，并填回对应的 literal*。
 * 组件只消费解析后的 literal，不再自己查 path。
 */
export interface A2uiStringValue {
  literalString?: string;
  path?: string;
}

export interface A2uiNumberValue {
  literalNumber?: number;
  path?: string;
}

export interface A2uiBooleanValue {
  literalBoolean?: boolean;
  path?: string;
}

export interface A2uiArrayValue {
  literalArray?: string[];
  path?: string;
}
