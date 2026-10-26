import { expect, test } from 'bun:test';
import { zh } from '#/locales/zh';
import type { AccountLoad, ProviderAccount } from '#/meter/account';
import { detailRows, readingOf } from '#/meter/reading';

const dictionary = new Map(Object.entries(zh));
const t = (key: string): string => dictionary.get(key) ?? key;
const NOW = Date.UTC(2026, 9, 23, 12, 0, 0);

function ready(
  account: ProviderAccount,
): Extract<AccountLoad, { status: 'ready' }> {
  return { status: 'ready', account };
}

function balanceAccount(): Extract<AccountLoad, { status: 'ready' }> {
  return ready({
    status: 'ok',
    view: {
      kind: 'balance',
      available: true,
      balances: [{ currency: 'CNY', granted: '10.00', toppedUp: '104.00' }],
    },
  });
}

function opencodeAccount(): Extract<AccountLoad, { status: 'ready' }> {
  return ready({
    status: 'ok',
    view: {
      kind: 'opencode-quota',
      windows: {
        rolling: {
          percent: 18,
          resetsAt: new Date(NOW + 3_600_000).toISOString(),
        },
        weekly: {
          percent: 78,
          resetsAt: new Date(NOW + 7 * 86_400_000).toISOString(),
        },
        monthly: {
          percent: 39,
          resetsAt: new Date(NOW + 30 * 86_400_000).toISOString(),
        },
      },
    },
  });
}

function codexAccount(): Extract<AccountLoad, { status: 'ready' }> {
  return ready({
    status: 'ok',
    view: {
      kind: 'codex-windows',
      windows: [
        {
          percent: 20,
          windowSeconds: 2_592_000,
          resetsAt: new Date(NOW + 30 * 86_400_000).toISOString(),
        },
      ],
    },
  });
}

test('DeepSeek 读数显示当前价格时段', () => {
  const reading = readingOf('deepseek-official', balanceAccount(), NOW, t);

  expect(reading.timePart).toBe('空闲 2d 13h');
  expect(reading.timeAt).toBe(Date.UTC(2026, 9, 26, 1, 0, 0));
  expect(reading.quotaReset).toBeNull();
});
test('OpenCode 读数显示最近的重置倒计时', () => {
  const reading = readingOf('opencode-go', opencodeAccount(), NOW, t);

  expect(reading.timePart).toBe('1h');
  expect(reading.timeAt).toBe(NOW + 3_600_000);
  expect(reading.quotaReset).toBe(NOW + 3_600_000);
});
test('Codex 读数显示最近窗口的重置倒计时', () => {
  const reading = readingOf('openai-codex', codexAccount(), NOW, t);

  expect(reading.timePart).toBe('30d');
  expect(reading.timeAt).toBe(NOW + 30 * 86_400_000);
});
test('未知厂商没有时间部分', () => {
  expect(readingOf('openrouter', balanceAccount(), NOW, t)).toEqual({
    quotaReset: null,
    timePart: null,
    timeAt: null,
  });
});
test('DeepSeek 详情显示充值与赠送余额', () => {
  expect(detailRows(t, 'deepseek-official', balanceAccount())).toEqual([
    { label: '充值余额', value: '¥104.00 CNY' },
    { label: '赠送余额', value: '¥10.00 CNY' },
  ]);
});
test('OpenCode 详情显示三个额度窗口', () => {
  expect(detailRows(t, 'opencode-go', opencodeAccount())).toEqual([
    {
      label: '5 小时',
      value: '18%',
      title: `重置于 ${new Date(NOW + 3_600_000).toLocaleString()}`,
    },
    {
      label: '1 周',
      value: '78%',
      title: `重置于 ${new Date(NOW + 7 * 86_400_000).toLocaleString()}`,
    },
    {
      label: '1 个月',
      value: '39%',
      title: `重置于 ${new Date(NOW + 30 * 86_400_000).toLocaleString()}`,
    },
  ]);
});
test('Codex 详情按窗口长度动态渲染', () => {
  expect(detailRows(t, 'openai-codex', codexAccount())).toEqual([
    {
      label: '1 个月',
      value: '20%',
      title: `重置于 ${new Date(NOW + 30 * 86_400_000).toLocaleString()}`,
    },
  ]);
});
test('未知厂商显示不支持提示', () => {
  expect(detailRows(t, 'openrouter', balanceAccount())).toEqual([
    { label: '厂商', value: '该厂商暂不支持额度查询' },
  ]);
});
test('刷新失败时保留数据并追加失败行', () => {
  const account: AccountLoad = {
    ...balanceAccount(),
    status: 'ready',
    refreshError: 'HTTP 500',
  };

  expect(detailRows(t, 'deepseek-official', account)).toContainEqual({
    label: '刷新',
    value: '查询失败',
    title: 'HTTP 500',
  });
});
