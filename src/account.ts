/**
 * Host 侧账户查询。三个厂商的接口都跨域且需要密钥，所以由 Host 读凭据、
 * 发请求，再通过受信 Fetch 路由返回页面。
 */

import {
  type ProviderAccount,
  ACCOUNT_ROUTE,
  DEEPSEEK_KEY_REF,
  OPENCODE_KEY_REF,
  parseCodexUsage,
  parseDeepSeekBalance,
  parseOpenCodeUsage,
  readRecord,
  readString,
} from './meter/account';
import { type AccountAdapterKind, providerCapability } from './meter/provider';

const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';
const OPENCODE_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';
const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const CODEX_RECORD_KEY = 'llm-pi-ai/openai-codex';
const REQUEST_TIMEOUT_MS = 8_000;
/**
 * OpenCode 前面的 Cloudflare 会拒绝不带 User-Agent 的请求（实测 403），
 * 所以固定发一个客户端标识。
 */
const USER_AGENT = 'dsh-plugin-meter';

type CredentialRecord =
  | { readonly kind: 'api-key' }
  | { readonly kind: 'grant'; readonly payload: unknown };

export interface AccountRouteContext {
  readonly connection: {
    readonly fetch: {
      register(route: {
        readonly path: string;
        readonly methods: readonly string[];
        readonly requestBody: 'buffered';
        readonly fetch: (request: Request) => Promise<Response>;
      }): () => Promise<void>;
    };
  };
  readonly credentials: {
    resolve(ref: string): Promise<{ readonly value: string } | undefined>;
    readRecord(key: string): Promise<CredentialRecord | undefined>;
  };
  effect(callback: () => () => unknown, label?: string): unknown;
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

async function resolveKey(
  ctx: AccountRouteContext,
  ref: string,
): Promise<string | undefined> {
  const credential = await ctx.credentials.resolve(ref);

  return credential?.value;
}

/** 取一个 JSON 响应，8 秒超时，非 2xx 直接失败。 */
async function fetchJson(
  url: string,
  key: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${key}`,
      accept: 'application/json',
      'user-agent': USER_AGENT,
      ...headers,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();

  return body;
}

async function fetchDeepSeek(
  ctx: AccountRouteContext,
): Promise<ProviderAccount> {
  try {
    const key = await resolveKey(ctx, DEEPSEEK_KEY_REF);

    if (key === undefined) {
      return { status: 'unconfigured', ref: DEEPSEEK_KEY_REF };
    }
    const parsed = parseDeepSeekBalance(
      await fetchJson(DEEPSEEK_BALANCE_URL, key),
    );

    if (parsed === null) {
      return { status: 'error', message: 'unexpected response' };
    }
    return {
      status: 'ok',
      view: {
        kind: 'balance',
        available: parsed.available,
        balances: parsed.balances,
      },
    };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

async function fetchOpenCode(
  ctx: AccountRouteContext,
): Promise<ProviderAccount> {
  try {
    const key = await resolveKey(ctx, OPENCODE_KEY_REF);

    if (key === undefined) {
      return { status: 'unconfigured', ref: OPENCODE_KEY_REF };
    }
    const windows = parseOpenCodeUsage(
      await fetchJson(OPENCODE_USAGE_URL, key),
    );

    if (windows === null) {
      return { status: 'error', message: 'unexpected response' };
    }
    return { status: 'ok', view: { kind: 'opencode-quota', windows } };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

interface CodexCredential {
  readonly access: string;
  readonly accountId: string;
}

/** 读取 DSH 的 Codex OAuth grant。payload 由 dsh-llm-pi-ai 在登录时写入，这里只读。 */
async function readCodexCredential(
  ctx: AccountRouteContext,
): Promise<CodexCredential | null> {
  const record = await ctx.credentials.readRecord(CODEX_RECORD_KEY);

  if (record?.kind !== 'grant') {
    return null;
  }
  const payload = readRecord(record.payload);
  const access = payload === null ? null : readString(payload.access);
  const accountId = payload === null ? null : readString(payload.accountId);

  return access === null || accountId === null ? null : { access, accountId };
}

async function fetchCodex(ctx: AccountRouteContext): Promise<ProviderAccount> {
  try {
    const credential = await readCodexCredential(ctx);

    if (credential === null) {
      return { status: 'unconfigured', ref: CODEX_RECORD_KEY };
    }
    const windows = parseCodexUsage(
      await fetchJson(CODEX_USAGE_URL, credential.access, {
        'chatgpt-account-id': credential.accountId,
      }),
    );

    if (windows === null) {
      return { status: 'error', message: 'unexpected response' };
    }
    return { status: 'ok', view: { kind: 'codex-windows', windows } };
  } catch (error) {
    return { status: 'error', message: errorMessage(error) };
  }
}

const ACCOUNT_FETCHERS: Readonly<
  Record<
    AccountAdapterKind,
    (ctx: AccountRouteContext) => Promise<ProviderAccount>
  >
> = {
  deepseek: fetchDeepSeek,
  opencode: fetchOpenCode,
  codex: fetchCodex,
};

async function readAccountForProvider(
  ctx: AccountRouteContext,
  provider: string | null,
): Promise<ProviderAccount> {
  const capability = providerCapability(provider);

  return capability === undefined
    ? { status: 'unsupported' }
    : ACCOUNT_FETCHERS[capability.account](ctx);
}

export function registerAccountRoute(ctx: AccountRouteContext): unknown {
  return ctx.effect(
    () =>
      ctx.connection.fetch.register({
        path: ACCOUNT_ROUTE,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async request => {
          const provider = new URL(request.url).searchParams.get('provider');

          return Response.json(await readAccountForProvider(ctx, provider), {
            headers: { 'cache-control': 'no-store' },
          });
        },
      }),
    'meter: account route',
  );
}
