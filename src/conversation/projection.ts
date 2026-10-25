/**
 * `meterUsage` 会话投影。
 *
 * 已落盘事件是唯一事实来源：这里把每次 Assistant 结算的 usage 按
 * provider、model、计费时段和价格阶梯归类，Client 再按单价算钱并汇总。
 * 折叠方式与官方 `tokenUsage` 投影一致：同一步骤的后一次 usage 会替换前一次，
 * `llm/retry-started` 关闭替换槽，避免重试被重复计数。
 */

import { z } from 'zod';
import type { BucketClass, MeterUsageView, RouteUsage } from '../meter/usage';
import { type Tariff, type TokenBucket, classifyUsage } from '../pricing';

interface DurableEventLike {
  readonly type: string;
  readonly time: number;
  readonly data: unknown;
}

interface RouteRef {
  readonly provider: string;
  readonly model: string;
}

interface LastSample {
  readonly turn: number;
  readonly step: number;
  readonly route: RouteRef | null;
  readonly tariff: Tariff;
  readonly tier: number;
  readonly bucket: TokenBucket;
}

export interface MeterProjectionState {
  readonly routes: readonly RouteUsage[];
  readonly unattributed: TokenBucket;
  /** 仅 Host 使用，不进入 wire view。 */
  readonly route: RouteRef | null;
  /** 最近一次 usage 样本，用于同一步骤内的替换。 */
  readonly last: LastSample | null;
}

interface UsageSample {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

const EMPTY_BUCKET: TokenBucket = {
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
const bucketSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
});
const tariffSchema = z.union([z.literal('offPeak'), z.literal('peak')]);
const routeRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});
const classSchema = z.object({
  tariff: tariffSchema,
  tier: z.number().int().nonnegative(),
  bucket: bucketSchema,
});
const routeSchema = routeRefSchema.extend({
  classes: z.array(classSchema),
});
const lastSchema = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  route: routeRefSchema.nullable(),
  ...classSchema.shape,
});
const usageSchema = z.object({
  routes: z.array(routeSchema),
  unattributed: bucketSchema,
});
const stateSchema = usageSchema.extend({
  route: routeRefSchema.nullable(),
  last: lastSchema.nullable(),
});
const viewSchema = usageSchema;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function readUsage(value: unknown): UsageSample | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const inputTokens = readCount(record.inputTokens);
  const outputTokens = readCount(record.outputTokens);
  const cacheReadTokens = readCount(record.cacheReadTokens ?? 0);
  const cacheWriteTokens = readCount(record.cacheWriteTokens ?? 0);

  if (
    inputTokens === null ||
    outputTokens === null ||
    cacheReadTokens === null ||
    cacheWriteTokens === null
  ) {
    return null;
  }
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
}

/**
 * 从事件的 usage 字段或紧凑流的最后一个 usage chunk 取样本。
 * 这与官方 `lastAssistantStreamChunk(stream, 'usage')` 的取法一致。
 */
function usageOf(event: DurableEventLike): UsageSample | null {
  if (
    event.type !== 'assistant/message' &&
    event.type !== 'assistant/attempt'
  ) {
    return null;
  }
  const data = readRecord(event.data);

  if (data === null) {
    return null;
  }

  if (event.type === 'assistant/message') {
    const direct = readUsage(data.usage);

    if (direct !== null) {
      return direct;
    }
  }
  const stream = readArray(data.stream);

  if (stream === null) {
    return null;
  }

  for (let i = stream.length - 1; i >= 0; i -= 1) {
    const entry = readRecord(stream[i]);
    const chunk = entry === null ? null : readRecord(entry.chunk);

    if (chunk !== null && chunk.type === 'usage') {
      return readUsage(chunk.usage);
    }
  }
  return null;
}

function messageRoute(event: DurableEventLike): RouteRef | null {
  if (event.type !== 'assistant/message') {
    return null;
  }
  const data = readRecord(event.data);
  const message = data === null ? null : readRecord(data.message);
  const source = message === null ? null : readRecord(message.source);
  const provider = source === null ? null : readString(source.provider);
  const model = source === null ? null : readString(source.model);

  return provider === null || model === null ? null : { provider, model };
}

function contextRoute(event: DurableEventLike): RouteRef | null {
  if (event.type !== 'request/context') {
    return null;
  }
  const data = readRecord(event.data);
  const provider = data === null ? null : readString(data.provider);
  const model = data === null ? null : readString(data.model);

  return provider === null || model === null ? null : { provider, model };
}

function headerRoute(event: DurableEventLike): RouteRef | null {
  if (event.type !== 'request/header') {
    return null;
  }
  const data = readRecord(event.data);
  const header = data === null ? null : readRecord(data.header);
  const config = header === null ? null : readRecord(header.config);
  const provider = config === null ? null : readString(config.provider);
  const model = config === null ? null : readString(config.model);

  return provider === null || model === null ? null : { provider, model };
}

function readTurnStep(
  event: DurableEventLike,
): { turn: number; step: number } | null {
  const data = readRecord(event.data);

  if (data === null) {
    return null;
  }
  const turn = readCount(data.turn);
  const step = readCount(data.step);

  return turn === null || step === null ? null : { turn, step };
}

function sameRoute(left: RouteRef | null, right: RouteRef | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.provider === right.provider && left.model === right.model;
}

function addBuckets(left: TokenBucket, right: TokenBucket): TokenBucket {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

function subtractBuckets(left: TokenBucket, right: TokenBucket): TokenBucket {
  return {
    uncachedInputTokens: left.uncachedInputTokens - right.uncachedInputTokens,
    outputTokens: left.outputTokens - right.outputTokens,
    cacheReadTokens: left.cacheReadTokens - right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens - right.cacheWriteTokens,
  };
}

function isZeroBucket(bucket: TokenBucket): boolean {
  return (
    bucket.uncachedInputTokens === 0 &&
    bucket.outputTokens === 0 &&
    bucket.cacheReadTokens === 0 &&
    bucket.cacheWriteTokens === 0
  );
}

function equalBucket(left: TokenBucket, right: TokenBucket): boolean {
  return (
    left.uncachedInputTokens === right.uncachedInputTokens &&
    left.outputTokens === right.outputTokens &&
    left.cacheReadTokens === right.cacheReadTokens &&
    left.cacheWriteTokens === right.cacheWriteTokens
  );
}

/** `sign` 为 1 加、-1 减。空的类和路由会被移除。 */
function applyClassDelta(
  routes: readonly RouteUsage[],
  route: RouteRef,
  tariff: Tariff,
  tier: number,
  bucket: TokenBucket,
  sign: 1 | -1,
): readonly RouteUsage[] {
  const routeIndex = routes.findIndex(
    entry => entry.provider === route.provider && entry.model === route.model,
  );

  if (routeIndex < 0) {
    return sign < 0
      ? routes
      : [...routes, { ...route, classes: [{ tariff, tier, bucket }] }];
  }
  const currentRoute = routes[routeIndex];

  if (currentRoute === undefined) {
    return routes;
  }
  const classIndex = currentRoute.classes.findIndex(
    entry => entry.tariff === tariff && entry.tier === tier,
  );

  let classes: readonly BucketClass[];

  if (classIndex < 0) {
    classes =
      sign < 0
        ? currentRoute.classes
        : [...currentRoute.classes, { tariff, tier, bucket }];
  } else {
    const current = currentRoute.classes[classIndex];

    if (current === undefined) {
      return routes;
    }
    const next =
      sign > 0
        ? addBuckets(current.bucket, bucket)
        : subtractBuckets(current.bucket, bucket);

    classes = isZeroBucket(next)
      ? currentRoute.classes.filter((_, index) => index !== classIndex)
      : currentRoute.classes.map((entry, index) =>
          index === classIndex ? { ...entry, bucket: next } : entry,
        );
  }

  if (classes.length === 0) {
    return routes.filter((_, index) => index !== routeIndex);
  }
  return routes.map((entry, index) =>
    index === routeIndex
      ? { provider: entry.provider, model: entry.model, classes }
      : entry,
  );
}

function sameSample(
  last: LastSample,
  route: RouteRef | null,
  tariff: Tariff,
  tier: number,
  bucket: TokenBucket,
): boolean {
  return (
    sameRoute(last.route, route) &&
    last.tariff === tariff &&
    last.tier === tier &&
    equalBucket(last.bucket, bucket)
  );
}

/** 不关心的事件必须返回同一个 state 引用，Registry 会据此跳过下游工作。 */
export function applyMeterEvent(
  state: MeterProjectionState,
  event: DurableEventLike,
): MeterProjectionState {
  const context = contextRoute(event);

  if (context !== null) {
    return sameRoute(state.route, context)
      ? state
      : { ...state, route: context };
  }
  const header = headerRoute(event);

  if (header !== null) {
    return sameRoute(state.route, header) ? state : { ...state, route: header };
  }

  if (event.type === 'llm/retry-started') {
    const turnStep = readTurnStep(event);

    if (
      turnStep !== null &&
      state.last !== null &&
      state.last.turn === turnStep.turn &&
      state.last.step === turnStep.step
    ) {
      return { ...state, last: null };
    }
    return state;
  }
  const usage = usageOf(event);
  const turnStep = readTurnStep(event);

  if (usage === null || turnStep === null) {
    return state;
  }
  const route = messageRoute(event) ?? state.route;
  const promptTokens =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const classified: { readonly tariff: Tariff; readonly tier: number } =
    route === null
      ? { tariff: 'offPeak', tier: 0 }
      : classifyUsage(route.provider, route.model, promptTokens, event.time);
  const bucket: TokenBucket = {
    uncachedInputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
  const previous =
    state.last !== null &&
    state.last.turn === turnStep.turn &&
    state.last.step === turnStep.step
      ? state.last
      : null;

  if (
    previous !== null &&
    sameSample(previous, route, classified.tariff, classified.tier, bucket)
  ) {
    return sameRoute(state.route, route) ? state : { ...state, route };
  }
  let routes = state.routes;
  let unattributed = state.unattributed;

  if (previous !== null) {
    if (previous.route === null) {
      unattributed = subtractBuckets(unattributed, previous.bucket);
    } else {
      routes = applyClassDelta(
        routes,
        previous.route,
        previous.tariff,
        previous.tier,
        previous.bucket,
        -1,
      );
    }
  }

  if (route === null) {
    unattributed = addBuckets(unattributed, bucket);
  } else {
    routes = applyClassDelta(
      routes,
      route,
      classified.tariff,
      classified.tier,
      bucket,
      1,
    );
  }
  return {
    routes,
    unattributed,
    route,
    last: {
      turn: turnStep.turn,
      step: turnStep.step,
      route,
      tariff: classified.tariff,
      tier: classified.tier,
      bucket,
    },
  };
}

export const meterProjectionDefinition = {
  key: 'meterUsage',
  stateVersion: 1,
  stateSchema,
  init: (): MeterProjectionState => ({
    routes: [],
    unattributed: { ...EMPTY_BUCKET },
    route: null,
    last: null,
  }),
  apply: applyMeterEvent,
  wire: {
    viewSchema,
    view: (state: MeterProjectionState): MeterUsageView => ({
      routes: state.routes,
      unattributed: state.unattributed,
    }),
  },
};
