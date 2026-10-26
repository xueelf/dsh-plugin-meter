/** 费用读数与详情行。 */

import type { Translate } from '../locales';
import { priceWindowAt } from '../pricing';
import {
  type AccountLoad,
  type AccountView,
  type ProviderAccount,
  nearestQuotaReset,
  nearestResetAt,
} from './account';
import {
  formatBalance,
  formatCountdown,
  formatPercent,
  formatWindowLabel,
} from './format';
import { type AccountViewKind, providerCapability } from './provider';

export interface DetailRow {
  readonly label: string;
  readonly value: string;
  readonly title?: string;
}

function loadingRow(label: string, t: Translate): DetailRow {
  return { label, value: t('loading') };
}

function errorRow(label: string, t: Translate, message: string): DetailRow {
  return { label, value: t('failed'), title: message };
}

function accountLabel(t: Translate, view: AccountViewKind): string {
  return view === 'balance' ? t('toppedUp') : t('quota');
}

function loadingRows(t: Translate, view: AccountViewKind): DetailRow[] {
  if (view === 'balance') {
    return [loadingRow(t('toppedUp'), t)];
  }

  if (view === 'opencode-quota') {
    return [
      loadingRow(t('window5h'), t),
      loadingRow(t('windowWeekly'), t),
      loadingRow(t('windowMonthly'), t),
    ];
  }
  return [loadingRow(t('quota'), t)];
}

function viewRows(t: Translate, view: AccountView): DetailRow[] {
  if (view.kind === 'balance') {
    if (view.balances.length === 0) {
      return [{ label: t('toppedUp'), value: '—' }];
    }
    const rows: DetailRow[] = [];

    for (const balance of view.balances) {
      rows.push({
        label: t('toppedUp'),
        value: formatBalance(balance.currency, balance.toppedUp),
        ...(view.available ? {} : { title: t('insufficient') }),
      });

      if (Number(balance.granted) > 0) {
        rows.push({
          label: t('granted'),
          value: formatBalance(balance.currency, balance.granted),
        });
      }
    }
    return rows;
  }

  if (view.kind === 'opencode-quota') {
    const rows: DetailRow[] = [];

    for (const [key, label] of [
      ['rolling', t('window5h')],
      ['weekly', t('windowWeekly')],
      ['monthly', t('windowMonthly')],
    ] as const) {
      const window = view.windows[key];

      if (window !== undefined) {
        rows.push({
          label,
          value: formatPercent(window.percent),
          title: `${t('resetAt')} ${new Date(window.resetsAt).toLocaleString()}`,
        });
      }
    }
    return rows.length > 0
      ? rows
      : [{ label: t('quota'), value: t('noQuota') }];
  }

  if (view.windows.length === 0) {
    return [{ label: t('quota'), value: t('noQuota') }];
  }
  return view.windows.map(window => ({
    label: formatWindowLabel(window.windowSeconds, t),
    value: formatPercent(window.percent),
    title: `${t('resetAt')} ${new Date(window.resetsAt).toLocaleString()}`,
  }));
}

function accountRows(
  t: Translate,
  account: ProviderAccount,
  view: AccountViewKind,
): DetailRow[] {
  if (account.status === 'unsupported') {
    return [{ label: t('provider'), value: t('unsupported') }];
  }
  const label = accountLabel(t, view);

  if (account.status === 'unconfigured') {
    return [{ label, value: `${t('unconfigured')} ${account.ref}` }];
  }

  if (account.status === 'error') {
    return [{ label, value: t('failed'), title: account.message }];
  }
  return viewRows(t, account.view);
}

export function detailRows(
  t: Translate,
  provider: string | null,
  account: AccountLoad,
): DetailRow[] {
  const capability = providerCapability(provider);

  if (capability === undefined) {
    return [{ label: t('provider'), value: t('unsupported') }];
  }

  if (account.status === 'idle' || account.status === 'loading') {
    return loadingRows(t, capability.view);
  }

  if (account.status === 'error') {
    return [errorRow(accountLabel(t, capability.view), t, account.message)];
  }
  const rows = accountRows(t, account.account, capability.view);

  if (account.refreshError !== undefined) {
    rows.push({
      label: t('refresh'),
      value: t('failed'),
      title: account.refreshError,
    });
  }
  return rows;
}

export interface ProviderReading {
  readonly quotaReset: number | null;
  readonly timePart: string | null;
  readonly timeAt: number | null;
}

function accountResetAt(account: AccountLoad): number | null {
  if (account.status !== 'ready' || account.account.status !== 'ok') {
    return null;
  }
  const view = account.account.view;

  if (view.kind === 'opencode-quota') {
    return nearestQuotaReset(view.windows);
  }

  if (view.kind === 'codex-windows') {
    return nearestResetAt(view.windows);
  }
  return null;
}

export function readingOf(
  provider: string | null,
  account: AccountLoad,
  now: number,
  t: Translate,
): ProviderReading {
  const capability = providerCapability(provider);

  if (capability === undefined) {
    return { quotaReset: null, timePart: null, timeAt: null };
  }

  if (capability.timeSource === 'priceWindow') {
    const priceWindow = priceWindowAt(now);

    return {
      quotaReset: null,
      timePart: `${t(priceWindow.label)} ${formatCountdown(priceWindow.endsAt - now)}`,
      timeAt: priceWindow.endsAt,
    };
  }
  const quotaReset = accountResetAt(account);

  return {
    quotaReset,
    timePart: quotaReset === null ? '—' : formatCountdown(quotaReset - now),
    timeAt: quotaReset,
  };
}
