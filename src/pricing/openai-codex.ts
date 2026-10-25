import { type ModelPrice, rates } from './model';

/**
 * Codex 订阅模型的 API 等价价格。
 * 来源：OpenAI API pricing https://developers.openai.com/api/docs/pricing（2026-10-25）。
 * 使用 standard short-context 与 272K long-context 阶梯。
 *
 * Codex 的 TokenUsage 只给出 `cache_write_input_tokens`，没有 cache write 保留时长字段。
 * 见 https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/sse/responses.rs。
 * Codex 的 GPT-6 迁移文档把 `prompt_cache_options.ttl` 设为 `30m`，所以这里采用 30 分钟档。
 * 见 https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/openai-docs/references/upgrading-to-gpt-6-astra.md。
 *
 * `gpt-5.3-codex-spark` 不在 OpenAI 对外价格页，但 DSH 使用的开源源码包
 * @earendil-works/pi-ai 的 openai-codex model catalog 给出了它的价格，所以一并收录。
 */
export const CODEX_PRICES: Readonly<Record<string, ModelPrice>> = {
  'gpt-5.3-codex-spark': {
    base: rates(1.75, 14, 0.175),
    tiers: [],
  },
  'gpt-5.5': {
    base: rates(5, 30, 0.5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(10, 45, 1) }],
  },
  'gpt-5.6-luna': {
    base: rates(0.2, 1.2, 0.02, 0.25),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(0.4, 1.8, 0.04, 0.5) }],
  },
  'gpt-5.6-sol': {
    base: rates(4, 20, 0.4, 5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(8, 30, 0.8, 10) }],
  },
  'gpt-5.6-terra': {
    base: rates(2, 12, 0.2, 2.5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(4, 18, 0.4, 5) }],
  },
  'gpt-6-astra': {
    base: rates(10, 50, 1, 12.5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(20, 75, 2, 25) }],
  },
  'gpt-6-luna': {
    base: rates(0.1, 0.5, 0.01, 0.125),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(0.2, 0.75, 0.02, 0.25) }],
  },
  'gpt-6-sol': {
    base: rates(2, 10, 0.2, 2.5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(4, 15, 0.4, 5) }],
  },
  'gpt-6.1-sol': {
    base: rates(2, 10, 0.1, 2.5),
    tiers: [{ aboveInputTokens: 272_000, rates: rates(4, 15, 0.2, 5) }],
  },
};
