import { type ModelPrice, rates } from './model';

/**
 * DeepSeek 官方价格，来源 https://api-docs.deepseek.com/quick_start/pricing（2026-10-23）。
 *
 * `DeepSeek-V4.1-Flash-1017` 的 1017 和 `DeepSeek-V4-Pro-0813` 的 0813
 * 是版本标签。`deepseek-v4-flash` 与 `deepseek-v4-flash-vision-exp` 是
 * 官方仍接受的旧 id，由 1017 版本服务并按 Flash 价格计费。
 */
export const DEEPSEEK_PRICES = {
  'deepseek-flash': {
    base: rates(0.15, 0.6, 0.003),
    tiers: [],
    peakMultiplier: 2,
  },
  'deepseek-v4-flash': {
    base: rates(0.15, 0.6, 0.003),
    tiers: [],
    peakMultiplier: 2,
  },
  'deepseek-v4-flash-vision-exp': {
    base: rates(0.15, 0.6, 0.003),
    tiers: [],
    peakMultiplier: 2,
  },
  'deepseek-v4-pro': {
    base: rates(0.66, 1.98, 0.022),
    tiers: [],
    peakMultiplier: 2,
  },
} satisfies Record<string, ModelPrice>;
