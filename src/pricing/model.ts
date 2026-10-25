/** 定价模型与每 1M tokens 的美元单价。 */

export interface TokenBucket {
  readonly uncachedInputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface TokenRates {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** 超过阈值后整条请求改用阶梯价。 */
export interface PriceTier {
  readonly aboveInputTokens: number;
  readonly rates: TokenRates;
}

export interface ModelPrice {
  readonly base: TokenRates;
  readonly tiers: readonly PriceTier[];
  /** 有 peak 价格时，peak 单价是 off-peak 的倍数。 */
  readonly peakMultiplier?: number;
}

/** 计费时段。没有 peak 价格的模型恒为 offPeak。 */
export type Tariff = 'offPeak' | 'peak';

export const rates = (
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite = 0,
): TokenRates => ({ input, output, cacheRead, cacheWrite });
