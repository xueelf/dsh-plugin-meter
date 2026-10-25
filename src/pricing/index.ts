/** 价格表查找与计费规则。 */

import { DEEPSEEK_PRICES } from './deepseek';
import type { ModelPrice, Tariff, TokenBucket, TokenRates } from './model';
import { CODEX_PRICES } from './openai-codex';
import { OPENCODE_GO_PRICES } from './opencode-go';

export type {
  ModelPrice,
  PriceTier,
  Tariff,
  TokenBucket,
  TokenRates,
} from './model';

const PRICE_TABLES: Readonly<
  Record<string, Readonly<Record<string, ModelPrice>>>
> = {
  'deepseek-official': DEEPSEEK_PRICES,
  'deepseek-account': DEEPSEEK_PRICES,
  'opencode-go': OPENCODE_GO_PRICES,
  'openai-codex': CODEX_PRICES,
};

export function priceOf(
  provider: string,
  model: string,
): ModelPrice | undefined {
  return PRICE_TABLES[provider]?.[model.trim().toLowerCase()];
}

/**
 * DeepSeek peak 时段：UTC 周一至周五 01:00-04:00 与 06:00-10:00。
 * 法定节假日未建模，工作日节假日会按普通工作日计价。
 */
export function isPeakTime(timeMs: number): boolean {
  const date = new Date(timeMs);
  const day = date.getUTCDay();

  if (day === 0 || day === 6) {
    return false;
  }
  const hour = date.getUTCHours();

  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export interface PriceWindow {
  readonly label: 'peak' | 'offPeak';
  /** 当前窗口结束、切换为另一个窗口的时刻。 */
  readonly endsAt: number;
}

const HOUR_MS = 3_600_000;

export function priceWindowAt(timeMs: number): PriceWindow {
  const peak = isPeakTime(timeMs);
  const base = Math.floor(timeMs / HOUR_MS) * HOUR_MS;

  // isPeakTime 以周为周期，最长连续 off-peak 是周五 10:00 到周一 01:00 UTC，
  // 共 63 小时，因此这个循环必然在一次切换点返回。
  for (let offset = 1; ; offset += 1) {
    const at = base + offset * HOUR_MS;

    if (isPeakTime(at) !== peak) {
      return { label: peak ? 'peak' : 'offPeak', endsAt: at };
    }
  }
}

/** 返回 0 表示基础价，1 表示第一档。 */
export function tierIndexOf(price: ModelPrice, promptTokens: number): number {
  let index = 0;

  for (let i = 0; i < price.tiers.length; i += 1) {
    const tier = price.tiers[i];

    if (tier !== undefined && promptTokens > tier.aboveInputTokens) {
      index = i + 1;
    }
  }
  return index;
}

/** 取某一档的单价，再套用 peak 倍数。阶梯不存在时返回 null。 */
export function ratesFor(
  price: ModelPrice,
  tariff: Tariff,
  tier: number,
): TokenRates | null {
  const tierRates = tier === 0 ? price.base : price.tiers[tier - 1]?.rates;

  if (tierRates === undefined) {
    return null;
  }
  const multiplier = tariff === 'peak' ? (price.peakMultiplier ?? 1) : 1;

  return {
    input: tierRates.input * multiplier,
    output: tierRates.output * multiplier,
    cacheRead: tierRates.cacheRead * multiplier,
    cacheWrite: tierRates.cacheWrite * multiplier,
  };
}

/** 未定价模型仍按 offPeak、基础价归类。 */
export interface UsageClass {
  readonly tariff: Tariff;
  readonly tier: number;
}

export function classifyUsage(
  provider: string,
  model: string,
  promptTokens: number,
  timeMs: number,
): UsageClass {
  const price = priceOf(provider, model);

  if (price === undefined) {
    return { tariff: 'offPeak', tier: 0 };
  }
  return {
    tariff:
      (price.peakMultiplier ?? 1) > 1 && isPeakTime(timeMs)
        ? 'peak'
        : 'offPeak',
    tier: tierIndexOf(price, promptTokens),
  };
}

export function bucketTokens(bucket: TokenBucket): number {
  return (
    bucket.uncachedInputTokens +
    bucket.outputTokens +
    bucket.cacheReadTokens +
    bucket.cacheWriteTokens
  );
}

export function bucketCost(
  ratesValue: TokenRates,
  bucket: TokenBucket,
): number {
  return (
    (bucket.uncachedInputTokens * ratesValue.input +
      bucket.outputTokens * ratesValue.output +
      bucket.cacheReadTokens * ratesValue.cacheRead +
      bucket.cacheWriteTokens * ratesValue.cacheWrite) /
    1_000_000
  );
}
