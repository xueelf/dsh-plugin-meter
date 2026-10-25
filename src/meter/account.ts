/** 账户数据的跨端契约与纯解析函数。不发起网络请求，也不保存密钥。 */

/** DeepSeek 凭据引用名，与官方适配器的默认值一致。 */
export const DEEPSEEK_KEY_REF = 'DEEPSEEK_API_KEY';
/** OpenCode Go 凭据引用名，与当前 profile 的 llm-pi-ai 配置一致。 */
export const OPENCODE_KEY_REF = 'OPENCODE_GO_API_KEY';

/** 适配器共享的失败状态。 */
export type AccountFailure =
  | { readonly status: 'unconfigured'; readonly ref: string }
  | { readonly status: 'error'; readonly message: string };

export interface BalanceInfo {
  readonly currency: string;
  readonly granted: string;
  readonly toppedUp: string;
}

export type DeepSeekAccount =
  | {
      readonly status: 'ok';
      readonly available: boolean;
      readonly balances: readonly BalanceInfo[];
    }
  | AccountFailure;

export interface QuotaWindow {
  readonly percent: number;
  /** ISO 8601 时间，表示额度重置时刻。 */
  readonly resetsAt: string;
}

export interface OpenCodeWindows {
  readonly rolling?: QuotaWindow;
  readonly weekly?: QuotaWindow;
  readonly monthly?: QuotaWindow;
}

export type OpenCodeAccount =
  | {
      readonly status: 'ok';
      readonly windows: OpenCodeWindows;
    }
  | AccountFailure;

export interface CodexWindow {
  readonly percent: number;
  /** 窗口长度，单位秒。5 小时、7 天、30 天等标签都由这个字段判断。 */
  readonly windowSeconds: number;
  /** ISO 8601 时间，表示窗口重置时刻。 */
  readonly resetsAt: string;
}

export type CodexAccount =
  | {
      readonly status: 'ok';
      readonly windows: readonly CodexWindow[];
    }
  | AccountFailure;

export type AccountView =
  | {
      readonly kind: 'balance';
      readonly available: boolean;
      readonly balances: readonly BalanceInfo[];
    }
  | { readonly kind: 'opencode-quota'; readonly windows: OpenCodeWindows }
  | {
      readonly kind: 'codex-windows';
      readonly windows: readonly CodexWindow[];
    };

export type AccountViewKind = AccountView['kind'];

export type ProviderAccount =
  | { readonly status: 'ok'; readonly view: AccountView }
  | { readonly status: 'unsupported' }
  | AccountFailure;

export type AccountLoad =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly account: ProviderAccount;
      readonly refreshError?: string;
    }
  | { readonly status: 'error'; readonly message: string };

export const ACCOUNT_ROUTE = '/api/plugin-meter/account';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function readArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readPercent(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

/** ISO 4217 币种代码，接口返回大写三字母。 */
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function readCurrency(value: unknown): string | null {
  const text = readString(value);

  return text !== null && CURRENCIES.has(text) ? text : null;
}

/** 余额是十进制字符串，必须在 `Intl.NumberFormat` 之前验证。 */
function readAmount(value: unknown): string | null {
  const text = readString(value);

  return text !== null &&
    /^-?\d+(?:\.\d+)?$/u.test(text) &&
    Number.isFinite(Number(text))
    ? text
    : null;
}

function balanceFrom(
  currency: unknown,
  granted: unknown,
  toppedUp: unknown,
): BalanceInfo | null {
  const currencyValue = readCurrency(currency);
  const grantedValue = readAmount(granted);
  const toppedUpValue = readAmount(toppedUp);

  return currencyValue === null ||
    grantedValue === null ||
    toppedUpValue === null
    ? null
    : {
        currency: currencyValue,
        granted: grantedValue,
        toppedUp: toppedUpValue,
      };
}

/** DeepSeek `/user/balance`。字段来源：https://api-docs.deepseek.com/api/get-user-balance */
export function parseDeepSeekBalance(value: unknown): {
  available: boolean;
  balances: readonly BalanceInfo[];
} | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const available = readBoolean(record.is_available);
  const infos = readArray(record.balance_infos);

  if (available === null || infos === null) {
    return null;
  }
  const balances: BalanceInfo[] = [];

  for (const entry of infos) {
    const info = readRecord(entry);
    const balance =
      info === null
        ? null
        : balanceFrom(
            info.currency,
            info.granted_balance,
            info.topped_up_balance,
          );

    if (balance === null) {
      return null;
    }
    balances.push(balance);
  }
  return { available, balances };
}

function parseQuotaWindow(value: unknown): QuotaWindow | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const percent = readPercent(record.percent);
  const resetsAt = readString(record.resetsAt);

  if (percent === null || resetsAt === null) {
    return null;
  }

  if (!Number.isFinite(Date.parse(resetsAt))) {
    return null;
  }
  return { percent, resetsAt };
}

/**
 * OpenCode Go `/zen/go/v1/usage`。结构来源：
 * https://github.com/anomalyco/opencode/blob/main/packages/core/src/usage-limits.ts
 * 的 `GoUsage`，2026-10-23 实测返回 ISO 8601 的 `resetsAt`。
 */
export function parseOpenCodeUsage(value: unknown): OpenCodeWindows | null {
  const record = readRecord(value);
  const usage = record === null ? null : readRecord(record.usage);

  return usage === null ? null : readWindows(usage);
}

/**
 * Codex `backend-api/wham/usage`。窗口随订阅变化，只返回实际存在的窗口。
 * 结构来源：https://github.com/openai/codex/blob/main/codex-rs/codex-backend-openapi-models/src/models/rate_limit_window_snapshot.rs
 * 与 2026-10-23 实测。
 */
export function parseCodexUsage(value: unknown): readonly CodexWindow[] | null {
  const record = readRecord(value);

  if (record === null || !('rate_limit' in record)) {
    return null;
  }

  // 非订阅账号会返回 rate_limit: null，按没有窗口处理，不当作查询失败。
  if (record.rate_limit === null) {
    return [];
  }
  const rate = readRecord(record.rate_limit);

  if (rate === null) {
    return null;
  }
  const windows: CodexWindow[] = [];

  for (const key of ['primary_window', 'secondary_window'] as const) {
    const raw = rate[key];

    if (raw === null || raw === undefined) {
      continue;
    }
    const window = readRecord(raw);
    const percent = window === null ? null : readPercent(window.used_percent);
    const windowSeconds =
      window === null ? null : readPositiveNumber(window.limit_window_seconds);
    const resetAt =
      window === null ? null : readPositiveNumber(window.reset_at);

    if (percent === null || windowSeconds === null || resetAt === null) {
      return null;
    }
    windows.push({
      percent,
      windowSeconds,
      resetsAt: new Date(resetAt * 1000).toISOString(),
    });
  }
  return windows;
}

/** 一组窗口里最近一次重置时间，没有可用窗口时返回 null。 */
export function nearestResetAt(
  windows: readonly { readonly resetsAt: string }[],
): number | null {
  let nearest: number | null = null;

  for (const window of windows) {
    const at = Date.parse(window.resetsAt);

    if (Number.isFinite(at) && (nearest === null || at < nearest)) {
      nearest = at;
    }
  }
  return nearest;
}

export function nearestQuotaReset(windows: OpenCodeWindows): number | null {
  return nearestResetAt(
    [windows.rolling, windows.weekly, windows.monthly].filter(
      (window): window is QuotaWindow => window !== undefined,
    ),
  );
}

function readBalanceInfo(value: unknown): BalanceInfo | null {
  const record = readRecord(value);

  return record === null
    ? null
    : balanceFrom(record.currency, record.granted, record.toppedUp);
}

/** `undefined` 表示正常记录，`null` 表示状态字段非法。 */
function readAccountFailure(
  record: Record<string, unknown>,
): AccountFailure | null | undefined {
  const status = record.status;

  if (status === 'unconfigured') {
    const ref = readString(record.ref);

    return ref === null ? null : { status, ref };
  }

  if (status === 'error') {
    const message = readString(record.message);

    return message === null ? null : { status, message };
  }
  return status === 'ok' ? undefined : null;
}

function readDeepSeekAccount(value: unknown): DeepSeekAccount | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const failure = readAccountFailure(record);

  if (failure !== undefined) {
    return failure;
  }
  const available = readBoolean(record.available);
  const balances = readArray(record.balances);

  if (available === null || balances === null) {
    return null;
  }
  const parsed: BalanceInfo[] = [];

  for (const entry of balances) {
    const balance = readBalanceInfo(entry);

    if (balance === null) {
      return null;
    }
    parsed.push(balance);
  }
  return { status: 'ok', available, balances: parsed };
}

function readWindows(value: unknown): OpenCodeWindows | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const windows: Partial<Record<keyof OpenCodeWindows, QuotaWindow>> = {};

  for (const key of ['rolling', 'weekly', 'monthly'] as const) {
    const raw = record[key];

    if (raw === undefined) {
      continue;
    }
    const window = parseQuotaWindow(raw);

    if (window === null) {
      return null;
    }
    windows[key] = window;
  }
  return windows;
}

function readOpenCodeAccount(value: unknown): OpenCodeAccount | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const failure = readAccountFailure(record);

  if (failure !== undefined) {
    return failure;
  }
  const windows = readWindows(record.windows);

  return windows === null ? null : { status: 'ok', windows };
}

function readCodexWindow(value: unknown): CodexWindow | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const percent = readPercent(record.percent);
  const windowSeconds = readPositiveNumber(record.windowSeconds);
  const resetsAt = readString(record.resetsAt);

  return percent === null ||
    windowSeconds === null ||
    resetsAt === null ||
    !Number.isFinite(Date.parse(resetsAt))
    ? null
    : { percent, windowSeconds, resetsAt };
}

function readCodexAccount(value: unknown): CodexAccount | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }
  const failure = readAccountFailure(record);

  if (failure !== undefined) {
    return failure;
  }
  const raw = readArray(record.windows);

  if (raw === null) {
    return null;
  }
  const windows: CodexWindow[] = [];

  for (const entry of raw) {
    const window = readCodexWindow(entry);

    if (window === null) {
      return null;
    }
    windows.push(window);
  }
  return { status: 'ok', windows };
}

export function readProviderAccount(value: unknown): ProviderAccount | null {
  const record = readRecord(value);

  if (record === null) {
    return null;
  }

  if (record.status === 'unsupported') {
    return { status: 'unsupported' };
  }
  const failure = readAccountFailure(record);

  if (failure !== undefined) {
    return failure;
  }

  if (record.status !== 'ok') {
    return null;
  }
  const view = readRecord(record.view);
  const kind = view === null ? null : readString(view.kind);

  if (view === null || kind === null) {
    return null;
  }

  if (kind === 'balance') {
    const account = readDeepSeekAccount({
      status: 'ok',
      available: view.available,
      balances: view.balances,
    });

    return account?.status === 'ok'
      ? {
          status: 'ok',
          view: {
            kind: 'balance',
            available: account.available,
            balances: account.balances,
          },
        }
      : null;
  }

  if (kind === 'opencode-quota') {
    const account = readOpenCodeAccount({
      status: 'ok',
      windows: view.windows,
    });

    return account?.status === 'ok'
      ? {
          status: 'ok',
          view: { kind: 'opencode-quota', windows: account.windows },
        }
      : null;
  }

  if (kind === 'codex-windows') {
    const account = readCodexAccount({ status: 'ok', windows: view.windows });

    return account?.status === 'ok'
      ? {
          status: 'ok',
          view: { kind: 'codex-windows', windows: account.windows },
        }
      : null;
  }
  return null;
}
