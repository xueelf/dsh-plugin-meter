import { expect, test } from 'bun:test';
import { providerCapability } from '#/meter/provider';

test('provider 能力声明', () => {
  expect(providerCapability('deepseek-official')).toMatchObject({
    closedVisible: false,
    timeSource: 'priceWindow',
    view: 'balance',
  });
  expect(providerCapability('opencode-go')).toMatchObject({
    closedVisible: true,
    timeSource: 'accountReset',
    view: 'opencode-quota',
  });
  expect(providerCapability('openai-codex')).toMatchObject({
    closedVisible: true,
    timeSource: 'accountReset',
    view: 'codex-windows',
  });
  expect(providerCapability('amazon-bedrock')).toBeUndefined();
  expect(providerCapability(null)).toBeUndefined();
});
