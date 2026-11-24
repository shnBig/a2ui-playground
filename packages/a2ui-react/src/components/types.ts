/** 协议中「字面量或数据模型路径」三种取值形态（当前仅支持 literal*） */
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
