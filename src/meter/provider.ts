/** 插件支持的 provider 能力，按 DSH 的 provider id 索引。 */

import type { AccountViewKind } from './account';

export type { AccountViewKind } from './account';
export type AccountAdapterKind = 'deepseek' | 'opencode' | 'codex';
export type TimeSource = 'priceWindow' | 'accountReset';

export interface ProviderCapability {
  /** Host 侧的账户适配器。 */
  readonly account: AccountAdapterKind;
  /** 面板关闭时，读数是否会展示这个 provider 的账户数据。 */
  readonly closedVisible: boolean;
  /** 面板里的账户行类型。 */
  readonly view: AccountViewKind;
  /** 读数时间的来源。 */
  readonly timeSource: TimeSource;
}

const PROVIDER_CAPABILITIES: Readonly<Record<string, ProviderCapability>> = {
  'deepseek-official': {
    account: 'deepseek',
    closedVisible: false,
    view: 'balance',
    timeSource: 'priceWindow',
  },
  'deepseek-account': {
    account: 'deepseek',
    closedVisible: false,
    view: 'balance',
    timeSource: 'priceWindow',
  },
  'opencode-go': {
    account: 'opencode',
    closedVisible: true,
    view: 'opencode-quota',
    timeSource: 'accountReset',
  },
  'openai-codex': {
    account: 'codex',
    closedVisible: true,
    view: 'codex-windows',
    timeSource: 'accountReset',
  },
};

export function providerCapability(
  provider: string | null,
): ProviderCapability | undefined {
  return provider === null ? undefined : PROVIDER_CAPABILITIES[provider];
}
