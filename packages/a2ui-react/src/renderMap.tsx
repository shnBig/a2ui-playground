import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { AttachChildren, RenderMap } from '@a2ui/core';
import {
  AudioPlayer,
  CheckBox,
  Column,
  DateTimeInput,
  Divider,
  Icon,
  Image,
  MultipleChoice,
  Slider,
  Text,
  TextField,
  Video,
} from './components/index.js';
import type {
  A2uiArrayValue,
  A2uiBooleanValue,
  A2uiNumberValue,
  A2uiStringValue,
  A2uiTextValue,
  MultipleChoiceOption,
} from './components/index.js';

/** 协议属性是运行时数据，这里统一做形变与类型收敛，避免渲染层到处 as any */
function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asStringValue(value: unknown): A2uiStringValue | undefined {
  return asObject(value) as A2uiStringValue | undefined;
}

function asNumberValue(value: unknown): A2uiNumberValue | undefined {
  return asObject(value) as A2uiNumberValue | undefined;
}

function asBooleanValue(value: unknown): A2uiBooleanValue | undefined {
  return asObject(value) as A2uiBooleanValue | undefined;
}

function asArrayValue(value: unknown): A2uiArrayValue | undefined {
  return asObject(value) as A2uiArrayValue | undefined;
}

function asOptions(value: unknown): MultipleChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MultipleChoiceOption => {
    const record = asObject(item);
    return record !== undefined && typeof record.value === 'string';
  });
}

/**
 * A2UI 基础组件渲染表：协议组件类型名 → TSX 渲染函数。
 * 在 init({ renderMap }) 时注入 core，parser 解析到对应 component 时调用。
 *
 * 第二个参数是渲染上下文（componentId / surfaceId），
 * 每个渲染器都会把 componentId 透传到组件根元素上，便于在页面中定位组件。
 *
 * 暂不包含需要引用其它组件节点的结构化组件：
 * Row / List / Card / Tabs / Modal / Button（child 指向另一个组件）。
 * Column 已实现为容器：子节点由 treeBuild 组装，渲染时通过 attachChildren 注入。
 */
export const renderMap: RenderMap<ReactElement> = {
  Column: (props, context) => (
    <Column
      componentId={context.componentId}
      distribution={asString(props.distribution)}
      alignment={asString(props.alignment)}
    />
  ),

  Text: (props, context) => (
    <Text
      componentId={context.componentId}
      text={asObject(props.text) as A2uiTextValue | undefined}
      usageHint={asString(props.usageHint)}
    />
  ),

  Image: (props, context) => (
    <Image
      componentId={context.componentId}
      url={asStringValue(props.url)}
      altText={asStringValue(props.altText)}
      fit={asString(props.fit)}
      usageHint={asString(props.usageHint)}
    />
  ),

  Icon: (props, context) => (
    <Icon componentId={context.componentId} name={asStringValue(props.name)} />
  ),

  Video: (props, context) => (
    <Video componentId={context.componentId} url={asStringValue(props.url)} />
  ),

  AudioPlayer: (props, context) => (
    <AudioPlayer
      componentId={context.componentId}
      url={asStringValue(props.url)}
      description={asStringValue(props.description)}
    />
  ),

  Divider: (props, context) => (
    <Divider componentId={context.componentId} axis={asString(props.axis)} />
  ),

  CheckBox: (props, context) => (
    <CheckBox
      componentId={context.componentId}
      label={asStringValue(props.label)}
      value={asBooleanValue(props.value)}
    />
  ),

  TextField: (props, context) => (
    <TextField
      componentId={context.componentId}
      label={asStringValue(props.label)}
      text={asStringValue(props.text)}
      textFieldType={asString(props.textFieldType)}
      validationRegexp={asString(props.validationRegexp)}
    />
  ),

  DateTimeInput: (props, context) => (
    <DateTimeInput
      componentId={context.componentId}
      value={asStringValue(props.value)}
      enableDate={
        props.enableDate === undefined ? undefined : props.enableDate === true
      }
      enableTime={
        props.enableTime === undefined ? undefined : props.enableTime === true
      }
    />
  ),

  MultipleChoice: (props, context) => (
    <MultipleChoice
      componentId={context.componentId}
      selections={asArrayValue(props.selections)}
      options={asOptions(props.options)}
      maxAllowedSelections={asNumber(props.maxAllowedSelections)}
      variant={asString(props.variant)}
      filterable={props.filterable === true}
    />
  ),

  Slider: (props, context) => (
    <Slider
      componentId={context.componentId}
      label={asStringValue(props.label)}
      value={asNumberValue(props.value)}
      minValue={asNumber(props.minValue)}
      maxValue={asNumber(props.maxValue)}
    />
  ),
};

/**
 * React 下的子节点挂载策略：把子 vnode 作为 children 注入父元素。
 * 父节点不是合法 React 元素（如渲染失败为 null）时无法挂载，原样返回。
 */
export const attachChildren: AttachChildren<ReactElement> = (vnode, children) => {
  if (!isValidElement(vnode)) return vnode;
  return cloneElement(vnode, undefined, ...(children as ReactNode[]));
};
