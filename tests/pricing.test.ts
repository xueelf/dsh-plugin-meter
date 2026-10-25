import { expect, test } from 'bun:test';
import {
  bucketCost,
  classifyUsage,
  isPeakTime,
  priceOf,
  priceWindowAt,
  ratesFor,
  tierIndexOf,
} from '#/pricing';
import { OPENCODE_GO_PRICES } from '#/pricing/opencode-go';

test('OpenCode Go 的 DeepSeek 价格独立于 DeepSeek 官方', () => {
  const official = priceOf('deepseek-official', 'deepseek-flash');
  const opencode = priceOf('opencode-go', 'deepseek-v4.1-flash');

  expect(official?.base).toEqual({
    input: 0.15,
    output: 0.6,
    cacheRead: 0.003,
    cacheWrite: 0,
  });
  expect(opencode?.base).toEqual({
    input: 0.15,
    output: 0.6,
    cacheRead: 0.003,
    cacheWrite: 0,
  });
  expect(opencode).not.toBe(official);
  expect(opencode?.peakMultiplier).toBeUndefined();

  if (official !== undefined && opencode !== undefined) {
    expect(ratesFor(opencode, 'peak', 0)).toEqual(
      ratesFor(opencode, 'offPeak', 0),
    );
    expect(ratesFor(official, 'peak', 0)?.input).toBe(0.3);
  }
  expect(
    classifyUsage(
      'opencode-go',
      'deepseek-v4.1-flash',
      1_000,
      Date.UTC(2026, 9, 23, 2),
    ),
  ).toEqual({ tariff: 'offPeak', tier: 0 });
});
test('OpenCode Go 目录全部有独立价格', () => {
  expect(Object.keys(OPENCODE_GO_PRICES)).toHaveLength(37);

  for (const [model, price] of Object.entries(OPENCODE_GO_PRICES)) {
    expect(priceOf('opencode-go', model)).toBe(price);
    expect(price.peakMultiplier).toBeUndefined();
  }
});
test('OpenCode Go 不再包含 DeepSeek 旧 id', () => {
  expect(priceOf('opencode-go', 'deepseek-v4-flash')).toBeUndefined();
  expect(
    priceOf('opencode-go', 'deepseek-v4-flash-vision-exp'),
  ).toBeUndefined();
});
test('官方旧 id 与 Flash 价格一致', () => {
  expect(priceOf('deepseek-official', 'deepseek-v4-flash')).toEqual(
    priceOf('deepseek-official', 'deepseek-flash'),
  );
  expect(priceOf('deepseek-official', 'deepseek-v4-flash-vision-exp')).toEqual(
    priceOf('deepseek-official', 'deepseek-flash'),
  );
});
test('OpenCode Go 的 DeepSeek 行不共享 DeepSeek 表', () => {
  expect(priceOf('opencode-go', 'deepseek-v4.1-flash')).not.toBe(
    priceOf('deepseek-official', 'deepseek-flash'),
  );
  expect(priceOf('opencode-go', 'deepseek-v4-pro')).not.toBe(
    priceOf('deepseek-official', 'deepseek-v4-pro'),
  );
});
test('模型版本号不是模型 id', () => {
  expect(
    priceOf('deepseek-official', 'deepseek-v4.1-flash-1017'),
  ).toBeUndefined();
  expect(priceOf('opencode-go', 'deepseek-v4.1-flash-1017')).toBeUndefined();
  expect(priceOf('opencode-go', 'deepseek-v4-pro-0813')).toBeUndefined();
  expect(priceOf('deepseek-official', 'deepseek-v4.1-flash')).toBeUndefined();
});
test('未知厂商与未知模型没有价格', () => {
  expect(priceOf('openrouter', 'deepseek-v4.1-flash')).toBeUndefined();
  expect(priceOf('opencode-go', 'unknown-model')).toBeUndefined();
});
test('peak 时段按 UTC 工作日判断', () => {
  const friday = Date.UTC(2026, 9, 23);

  expect(isPeakTime(friday + 1 * 3600_000)).toBe(true);
  expect(isPeakTime(friday + 4 * 3600_000)).toBe(false);
  expect(isPeakTime(friday + 6 * 3600_000)).toBe(true);
  expect(isPeakTime(friday + 10 * 3600_000)).toBe(false);
  expect(isPeakTime(friday + 12 * 3600_000)).toBe(false);
  expect(isPeakTime(friday + 2 * 86_400_000 + 2 * 3600_000)).toBe(false);
});
test('peak 单价是 off-peak 的两倍', () => {
  const price = priceOf('deepseek-official', 'deepseek-flash');

  expect(price).toBeDefined();

  if (price === undefined) {
    return;
  }
  const offPeak = ratesFor(price, 'offPeak', 0);
  const peak = ratesFor(price, 'peak', 0);

  expect(offPeak?.input).toBe(0.15);
  expect(peak?.input).toBe(0.3);
  expect(peak?.output).toBe(1.2);
});
test('阶梯按 prompt token 数选择', () => {
  const price = priceOf('opencode-go', 'claude-haiku-5-5');

  expect(price).toBeDefined();

  if (price === undefined) {
    return;
  }
  expect(tierIndexOf(price, 100_000)).toBe(0);
  expect(tierIndexOf(price, 100_001)).toBe(1);
  expect(ratesFor(price, 'offPeak', 1)?.input).toBe(0.5);
  expect(ratesFor(price, 'offPeak', 2)).toBeNull();
});
test('未定价模型仍按 offPeak、基础价归类', () => {
  expect(classifyUsage('opencode-go', 'nope', 1000, Date.now())).toEqual({
    tariff: 'offPeak',
    tier: 0,
  });
});
test('token 桶按每百万计价', () => {
  const price = priceOf('opencode-go', 'deepseek-v4.1-flash');

  expect(price).toBeDefined();

  if (price === undefined) {
    return;
  }
  const rates = ratesFor(price, 'offPeak', 0);

  expect(rates).not.toBeNull();

  if (rates === null) {
    return;
  }
  const cost = bucketCost(rates, {
    uncachedInputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
    cacheWriteTokens: 0,
  });

  expect(cost).toBeCloseTo(0.15 + 0.6 + 0.003, 10);
});
test('价格窗口在高峰结束时切到低峰', () => {
  const friday = Date.UTC(2026, 9, 23);
  const window = priceWindowAt(friday + 2 * 3600_000);

  expect(window.label).toBe('peak');
  expect(window.endsAt).toBe(friday + 4 * 3600_000);
});
test('低峰窗口在下一个高峰开始时结束', () => {
  const friday = Date.UTC(2026, 9, 23);

  expect(priceWindowAt(friday + 4 * 3600_000)).toEqual({
    label: 'offPeak',
    endsAt: friday + 6 * 3600_000,
  });
  expect(priceWindowAt(friday + 11 * 3600_000)).toEqual({
    label: 'offPeak',
    endsAt: Date.UTC(2026, 9, 26, 1),
  });
  expect(priceWindowAt(Date.UTC(2026, 9, 24, 12))).toEqual({
    label: 'offPeak',
    endsAt: Date.UTC(2026, 9, 26, 1),
  });
});
test('周一凌晨的低峰在 01:00 结束', () => {
  expect(priceWindowAt(Date.UTC(2026, 9, 26, 0, 30))).toEqual({
    label: 'offPeak',
    endsAt: Date.UTC(2026, 9, 26, 1),
  });
});
test('Codex 模型价格与阶梯', () => {
  const price = priceOf('openai-codex', 'gpt-6.1-sol');

  expect(price?.base).toEqual({
    input: 2,
    output: 10,
    cacheRead: 0.1,
    cacheWrite: 2.5,
  });
  expect(price?.tiers).toEqual([
    {
      aboveInputTokens: 272_000,
      rates: { input: 4, output: 15, cacheRead: 0.2, cacheWrite: 5 },
    },
  ]);

  if (price !== undefined) {
    expect(tierIndexOf(price, 300_000)).toBe(1);
    expect(ratesFor(price, 'offPeak', 1)).toEqual({
      input: 4,
      output: 15,
      cacheRead: 0.2,
      cacheWrite: 5,
    });
  }
  expect(priceOf('openai-codex', 'unknown-model')).toBeUndefined();
  expect(priceOf('openai-codex', 'gpt-5.3-codex-spark')?.base).toEqual({
    input: 1.75,
    output: 14,
    cacheRead: 0.175,
    cacheWrite: 0,
  });
});
