import { expect, test } from 'bun:test';
import {
  nearestQuotaReset,
  nearestResetAt,
  parseCodexUsage,
  parseDeepSeekBalance,
  parseOpenCodeUsage,
  readProviderAccount,
} from '#/meter/account';

test('解析 DeepSeek 余额', () => {
  const parsed = parseDeepSeekBalance({
    is_available: true,
    balance_infos: [
      {
        currency: 'CNY',
        total_balance: '114.00',
        granted_balance: '10.00',
        topped_up_balance: '104.00',
      },
    ],
  });

  expect(parsed).toEqual({
    available: true,
    balances: [{ currency: 'CNY', granted: '10.00', toppedUp: '104.00' }],
  });
});
test('余额字段缺失判为非法响应', () => {
  expect(
    parseDeepSeekBalance({ is_available: true, balance_infos: [{}] }),
  ).toBeNull();
  expect(parseDeepSeekBalance(null)).toBeNull();
});
test('币种或金额格式非法时判为非法响应', () => {
  expect(
    parseDeepSeekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: 'N/A',
          granted_balance: '10.00',
          topped_up_balance: '104.00',
        },
      ],
    }),
  ).toBeNull();
  expect(
    parseDeepSeekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: 'CNY',
          granted_balance: '10.00',
          topped_up_balance: 'free',
        },
      ],
    }),
  ).toBeNull();
  expect(
    parseDeepSeekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: 'AAA',
          granted_balance: '10.00',
          topped_up_balance: '104.00',
        },
      ],
    }),
  ).toBeNull();
});
test('解析 OpenCode Go 三段额度', () => {
  const parsed = parseOpenCodeUsage({
    usage: {
      rolling: {
        status: 'ok',
        percent: 18,
        resetsAt: '2026-10-23T17:24:52.000Z',
      },
      weekly: {
        status: 'ok',
        percent: 78,
        resetsAt: '2026-10-26T00:00:00.000Z',
      },
      monthly: {
        status: 'ok',
        percent: 39,
        resetsAt: '2026-11-20T06:51:54.000Z',
      },
    },
  });

  expect(parsed?.rolling?.percent).toBe(18);
  expect(parsed?.weekly?.percent).toBe(78);
  expect(parsed?.monthly?.percent).toBe(39);
});
test('可选的周额度缺失时保留其余窗口', () => {
  const parsed = parseOpenCodeUsage({
    usage: {
      rolling: {
        status: 'ok',
        percent: 0,
        resetsAt: '2026-10-23T17:24:52.000Z',
      },
    },
  });

  expect(parsed).toEqual({
    rolling: { percent: 0, resetsAt: '2026-10-23T17:24:52.000Z' },
  });
});
test('额度百分比或时间非法时判为非法响应', () => {
  for (const percent of [-1, 101, Number.NaN, '18']) {
    expect(
      parseOpenCodeUsage({
        usage: {
          rolling: {
            status: 'ok',
            percent,
            resetsAt: '2026-10-23T17:24:52.000Z',
          },
        },
      }),
    ).toBeNull();
  }
  expect(
    parseOpenCodeUsage({
      usage: {
        rolling: { status: 'ok', percent: 1, resetsAt: 'not a date' },
      },
    }),
  ).toBeNull();
});
test('缺少 usage 判为非法响应', () => {
  expect(parseOpenCodeUsage({})).toBeNull();
});
test('读取路由返回的账户状态', () => {
  const value = {
    status: 'ok',
    view: {
      kind: 'opencode-quota',
      windows: {
        rolling: { percent: 18, resetsAt: '2026-10-23T17:24:52.000Z' },
      },
    },
  } as const;

  expect(readProviderAccount(value)).toEqual(value);
  expect(readProviderAccount({ status: 'unsupported' })).toEqual({
    status: 'unsupported',
  });
  expect(
    readProviderAccount({ status: 'unconfigured', ref: 'DEEPSEEK_API_KEY' }),
  ).toEqual({ status: 'unconfigured', ref: 'DEEPSEEK_API_KEY' });
  expect(
    readProviderAccount({ status: 'ok', view: { kind: 'nope' } }),
  ).toBeNull();
});
test('读取归一化的余额与 Codex 窗口', () => {
  const balance = {
    status: 'ok',
    view: {
      kind: 'balance',
      available: true,
      balances: [{ currency: 'CNY', granted: '10.00', toppedUp: '104.00' }],
    },
  } as const;
  const codex = {
    status: 'ok',
    view: {
      kind: 'codex-windows',
      windows: [
        {
          percent: 20,
          windowSeconds: 2_592_000,
          resetsAt: '2026-11-19T11:55:54.000Z',
        },
      ],
    },
  } as const;

  expect(readProviderAccount(balance)).toEqual(balance);
  expect(readProviderAccount(codex)).toEqual(codex);
});
test('解析 Codex 免费订阅的单月窗口', () => {
  const parsed = parseCodexUsage({
    plan_type: 'free',
    rate_limit: {
      primary_window: {
        used_percent: 20,
        limit_window_seconds: 2_592_000,
        reset_at: 1_795_074_954,
      },
      secondary_window: null,
    },
  });

  expect(parsed).toEqual([
    {
      percent: 20,
      windowSeconds: 2_592_000,
      resetsAt: new Date(1_795_074_954 * 1000).toISOString(),
    },
  ]);
});
test('解析 Codex 的 5 小时与 1 周双窗口', () => {
  const parsed = parseCodexUsage({
    rate_limit: {
      primary_window: {
        used_percent: 42,
        limit_window_seconds: 18_000,
        reset_at: 1_795_000_000,
      },
      secondary_window: {
        used_percent: 18,
        limit_window_seconds: 604_800,
        reset_at: 1_795_600_000,
      },
    },
  });

  expect(parsed?.map(window => window.windowSeconds)).toEqual([
    18_000, 604_800,
  ]);
});
test('Codex 两个窗口都为空时返回空数组', () => {
  expect(
    parseCodexUsage({
      rate_limit: { primary_window: null, secondary_window: null },
    }),
  ).toEqual([]);
});
test('Codex 非订阅账号没有窗口时返回空数组', () => {
  expect(parseCodexUsage({ rate_limit: null })).toEqual([]);
});
test('Codex 窗口缺字段判为非法响应', () => {
  expect(
    parseCodexUsage({
      rate_limit: { primary_window: { used_percent: 20 } },
    }),
  ).toBeNull();
  expect(parseCodexUsage({})).toBeNull();
});
test('取 Codex 窗口里最近的重置时间', () => {
  expect(
    nearestResetAt([
      { resetsAt: '2026-11-20T06:51:54.000Z' },
      { resetsAt: '2026-10-26T00:00:00.000Z' },
    ]),
  ).toBe(Date.parse('2026-10-26T00:00:00.000Z'));
});
test('取三个额度窗口里最近的重置时间', () => {
  const windows = {
    rolling: { percent: 18, resetsAt: '2026-10-23T17:24:52.000Z' },
    weekly: { percent: 78, resetsAt: '2026-10-26T00:00:00.000Z' },
    monthly: { percent: 39, resetsAt: '2026-11-20T06:51:54.000Z' },
  };

  expect(nearestQuotaReset(windows)).toBe(
    Date.parse('2026-10-23T17:24:52.000Z'),
  );
});
test('缺失滚动窗口时回退到最近的其他窗口', () => {
  const windows = {
    weekly: { percent: 78, resetsAt: '2026-10-26T00:00:00.000Z' },
    monthly: { percent: 39, resetsAt: '2026-11-20T06:51:54.000Z' },
  };

  expect(nearestQuotaReset(windows)).toBe(
    Date.parse('2026-10-26T00:00:00.000Z'),
  );
});
test('没有额度窗口时没有重置时间', () => {
  expect(nearestQuotaReset({})).toBeNull();
});
