import { expect, test } from 'bun:test';
import { zh } from '#/locales/zh';
import {
  formatBalance,
  formatCountdown,
  formatPercent,
  formatTokenCount,
  formatUsd,
  formatWindowLabel,
} from '#/meter/format';
import { lastUsedProvider, summariseCost } from '#/meter/usage';

test('费用统一使用 US$ 前缀', () => {
  expect(formatUsd(0)).toBe('US$0.00');
  expect(formatUsd(0.002623)).toBe('US$0.00');
  expect(formatUsd(0.026)).toBe('US$0.03');
  expect(formatUsd(12.5)).toBe('US$12.50');
  expect(formatUsd(1234.5)).toBe('US$1,234.50');
});
test('余额保留币种', () => {
  expect(formatBalance('CNY', '114.00')).toBe('¥114.00 CNY');
});
test('百分比与完整 token 数', () => {
  expect(formatPercent(18.4)).toBe('18%');
  expect(formatTokenCount(999)).toBe('999');
  expect(formatTokenCount(1234)).toBe('1,234');
  expect(formatTokenCount(531_901_481)).toBe('531,901,481');
});
test('汇总有价与未定价路由', () => {
  const summary = summariseCost({
    routes: [
      {
        provider: 'opencode-go',
        model: 'deepseek-v4.1-flash',
        classes: [
          {
            tariff: 'offPeak',
            tier: 0,
            bucket: {
              uncachedInputTokens: 1_000_000,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        ],
      },
      {
        provider: 'opencode-go',
        model: 'unknown-model',
        classes: [
          {
            tariff: 'offPeak',
            tier: 0,
            bucket: {
              uncachedInputTokens: 500,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        ],
      },
    ],
    unattributed: {
      uncachedInputTokens: 100,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  });

  expect(summary.usd).toBeCloseTo(0.15, 10);
  expect(summary.tokens).toBe(1_000_600);
  expect(summary.unpricedTokens).toBe(600);
  expect(summary.routes[0]?.priced).toBe(true);
  expect(summary.routes[1]?.priced).toBe(false);
});
test('价格表缺少对应阶梯时计入未定价', () => {
  const summary = summariseCost({
    routes: [
      {
        provider: 'opencode-go',
        model: 'deepseek-v4.1-flash',
        classes: [
          {
            tariff: 'offPeak',
            tier: 1,
            bucket: {
              uncachedInputTokens: 1_000_000,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
          },
        ],
      },
    ],
    unattributed: {
      uncachedInputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  });

  expect(summary.usd).toBe(0);
  expect(summary.unpricedTokens).toBe(1_000_000);
  expect(summary.routes[0]?.priced).toBe(false);
});
test('缺失投影按零处理', () => {
  expect(summariseCost(null)).toEqual({
    usd: 0,
    tokens: 0,
    unpricedTokens: 0,
    routes: [],
  });
});
test('最近的路由供应商作为面板类型兜底', () => {
  expect(lastUsedProvider(null)).toBeNull();
  expect(
    lastUsedProvider({
      routes: [
        {
          provider: 'deepseek-official',
          model: 'deepseek-flash',
          classes: [],
        },
        {
          provider: 'opencode-go',
          model: 'deepseek-v4.1-flash',
          classes: [],
        },
      ],
      unattributed: {
        uncachedInputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    }),
  ).toBe('opencode-go');
});
test('倒计时按分钟、小时、天压缩', () => {
  expect(formatCountdown(0)).toBe('0m');
  expect(formatCountdown(-1)).toBe('0m');
  expect(formatCountdown(30_000)).toBe('1m');
  expect(formatCountdown(59 * 60_000)).toBe('59m');
  expect(formatCountdown(60 * 60_000)).toBe('1h');
  expect(formatCountdown(90 * 60_000)).toBe('1h 30m');
  expect(formatCountdown(24 * 3600_000)).toBe('1d');
  expect(formatCountdown(36 * 3600_000)).toBe('1d 12h');
});
test('Codex 窗口标签按长度动态选择', () => {
  const dictionary = new Map(Object.entries(zh));
  const t = (key: string): string => dictionary.get(key) ?? key;

  expect(formatWindowLabel(5 * 3600, t)).toBe('5 小时');
  expect(formatWindowLabel(86_400, t)).toBe('1 天');
  expect(formatWindowLabel(7 * 86_400, t)).toBe('1 周');
  expect(formatWindowLabel(30 * 86_400, t)).toBe('1 个月');
  expect(formatWindowLabel(365 * 86_400, t)).toBe('1 年');
  expect(formatWindowLabel(12 * 3600, t)).toBe('12 小时');
  expect(formatWindowLabel(45 * 60, t)).toBe('45 分钟');
});
