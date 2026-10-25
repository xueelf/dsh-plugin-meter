/** 数字格式。费用统一 `US$`，避免 `$` 的币种歧义。 */

import type { Translate } from '../locales';

const USD_NUMBER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsd(value: number): string {
  return `US$${USD_NUMBER.format(value)}`;
}

/** 账户余额，保留接口返回的币种。 */
export function formatBalance(currency: string, value: string): string {
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
  }).format(Number(value));

  return `${amount} ${currency}`;
}

export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

const TOKEN_NUMBER = new Intl.NumberFormat('en-US');

/** 完整 token 数，和官方 Token 用量面板一致。 */
export function formatTokenCount(value: number): string {
  return TOKEN_NUMBER.format(Math.round(value));
}

/** 紧凑倒计时：1h 32m、2d 14h。 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return '0m';
  }
  const minutes = Math.ceil(ms / 60_000);

  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours < 24) {
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

const WINDOW_LABELS: Readonly<Record<number, string>> = {
  18000: 'window5h',
  86400: 'windowDaily',
  604800: 'windowWeekly',
  2592000: 'windowMonthly',
  31536000: 'windowAnnual',
};

/** 已知窗口按秒数匹配，未知长度回退成分钟、小时或天。 */
export function formatWindowLabel(seconds: number, t: Translate): string {
  const label = WINDOW_LABELS[seconds];

  if (label !== undefined) {
    return t(label);
  }

  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))} ${t('minuteUnit')}`;
  }

  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)} ${t('hourUnit')}`;
  }
  return `${Math.round(seconds / 86_400)} ${t('dayUnit')}`;
}
