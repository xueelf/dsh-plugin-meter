import { type ModelPrice, rates } from './model';

/**
 * OpenCode Go 价格表。
 *
 * 来源：https://models.opencode.ai/api.json 的 `opencode-go` provider（2026-10-26）。
 * 规则对齐 OpenCode 开源源码 packages/core/src/session/usage.ts：
 * context 阶梯用 input + cache.read + cache.write，output 和 reasoning 都按 output 计，
 * cache write 单独计，不乘 DeepSeek 的 peak。
 * OpenCode 在接口返回 `usage.cost` 时优先使用实际收费，本表只是 DSH 只有 token 时的回退。
 */
export const OPENCODE_GO_PRICES: Readonly<Record<string, ModelPrice>> = {
  'beam-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
  'cat-jam-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
  'claude-haiku-5-5': {
    base: rates(0.1, 0.5, 0.01, 0.125),
    tiers: [
      {
        aboveInputTokens: 100000,
        rates: rates(0.5, 2.5, 0.05, 0.625),
      },
    ],
  },
  'deepseek-v4-pro': {
    base: rates(0.66, 1.98, 0.022, 0),
    tiers: [],
  },
  'deepseek-v4.1-flash': {
    base: rates(0.15, 0.6, 0.003, 0),
    tiers: [],
  },
  'gemini-4-argon': {
    base: rates(2, 10, 0.1, 0),
    tiers: [],
  },
  'gemini-4-argon-contributor': {
    base: rates(4, 20, 0.2, 0),
    tiers: [],
  },
  'glm-5.2': {
    base: rates(1.4, 4.4, 0.26, 0),
    tiers: [],
  },
  'glm-5.3': {
    base: rates(1.4, 4.4, 0.26, 0),
    tiers: [],
  },
  'glm-5.3-flash': {
    base: rates(0.15, 0.5, 0.03, 0),
    tiers: [],
  },
  'gpt-5.6-luna': {
    base: rates(0.2, 1.2, 0.02, 0.25),
    tiers: [
      {
        aboveInputTokens: 272000,
        rates: rates(0.4, 1.8, 0.04, 0.5),
      },
    ],
  },
  'gpt-6-luna': {
    base: rates(0.1, 0.5, 0.01, 0.125),
    tiers: [
      {
        aboveInputTokens: 272000,
        rates: rates(0.2, 0.75, 0.02, 0.25),
      },
    ],
  },
  'grok-4.7': {
    base: rates(2, 6, 0.5, 0),
    tiers: [
      {
        aboveInputTokens: 200000,
        rates: rates(4, 12, 1, 0),
      },
    ],
  },
  hy3: {
    base: rates(0.14, 0.58, 0.035, 0),
    tiers: [],
  },
  'hy4-preview': {
    base: rates(0.834, 2.501, 0.042, 0),
    tiers: [],
  },
  'iceman-contributor-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
  'kimi-k2.7-code': {
    base: rates(0.95, 4, 0.19, 0),
    tiers: [],
  },
  'kimi-k3': {
    base: rates(3, 15, 0.3, 3),
    tiers: [],
  },
  'kimi-k3.1-pro': {
    base: rates(2, 10, 0.2, 2),
    tiers: [],
  },
  'longcat-2.0': {
    base: rates(0.3, 1.2, 0.006, 0),
    tiers: [],
  },
  'longcat-2.5-preview-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
  'mimo-v2.5': {
    base: rates(0.14, 0.28, 0.0028, 0),
    tiers: [],
  },
  'mimo-v2.5-pro': {
    base: rates(0.435, 0.87, 0.003625, 0),
    tiers: [],
  },
  'mimo-v2.6-flash': {
    base: rates(0.14, 0.28, 0.0028, 0),
    tiers: [],
  },
  'mimo-v2.6-pro': {
    base: rates(0.435, 0.87, 0.003625, 0),
    tiers: [],
  },
  'minimax-m2.7': {
    base: rates(0.3, 1.2, 0.06, 0.375),
    tiers: [],
  },
  'minimax-m3': {
    base: rates(0.3, 1.2, 0.06, 0),
    tiers: [
      {
        aboveInputTokens: 512000,
        rates: rates(0.6, 2.4, 0.12, 0),
      },
    ],
  },
  'minimax-m3.1-flash': {
    base: rates(0.15, 0.6, 0.015, 0),
    tiers: [],
  },
  'minimax-m3.1-flash-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
  'muse-spark-1.2-contributor': {
    base: rates(0.1, 0.2, 0.002, 0),
    tiers: [],
  },
  'muse-spark-1.3-contributor': {
    base: rates(0.1, 0.2, 0.002, 0),
    tiers: [],
  },
  'qwen3.7-plus': {
    base: rates(0.4, 1.6, 0.04, 0.5),
    tiers: [
      {
        aboveInputTokens: 256000,
        rates: rates(1.2, 4.8, 0.12, 1.5),
      },
    ],
  },
  'qwen3.8-flash': {
    base: rates(0.15, 0.47, 0.016, 0.2),
    tiers: [],
  },
  'qwen3.8-max': {
    base: rates(2, 6, 0.25, 2.5),
    tiers: [],
  },
  'space-bunny': {
    base: rates(0.15, 0.6, 0.03, 0),
    tiers: [],
  },
  'step-5-preview': {
    base: rates(1, 2.7, 0.1, 0),
    tiers: [],
  },
  'step-5-preview-free': {
    base: rates(0, 0, 0, 0),
    tiers: [],
  },
};
