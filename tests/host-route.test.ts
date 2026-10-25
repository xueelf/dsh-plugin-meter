import { expect, test } from 'bun:test';
import { type AccountRouteContext, registerAccountRoute } from '#/account';

interface CapturedRoute {
  readonly path: string;
  readonly methods: readonly string[];
  readonly requestBody: string;
  readonly fetch: (request: Request) => Promise<Response>;
}

interface SeenRequest {
  readonly url: string;
  readonly authorization: string | null;
  readonly userAgent: string | null;
  readonly accountId: string | null;
}

test('账户路由按 provider 只请求对应接口', async () => {
  const routes: CapturedRoute[] = [];
  const seen: SeenRequest[] = [];
  const ctx: AccountRouteContext = {
    connection: {
      fetch: {
        register(route) {
          routes.push(route);

          return async () => {};
        },
      },
    },
    credentials: {
      resolve: async (ref: string) =>
        ref === 'DEEPSEEK_API_KEY'
          ? { value: 'deepseek-key' }
          : { value: 'opencode-key' },
      readRecord: async (key: string) =>
        key === 'llm-pi-ai/openai-codex'
          ? {
              kind: 'grant',
              payload: {
                access: 'codex-access',
                accountId: 'codex-account',
              },
            }
          : undefined,
    },
    effect(callback) {
      callback();

      return undefined;
    },
  };
  const originalFetch = globalThis.fetch;
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const headers = new Headers(init?.headers);

    seen.push({
      url,
      authorization: headers.get('authorization'),
      userAgent: headers.get('user-agent'),
      accountId: headers.get('chatgpt-account-id'),
    });

    if (url.includes('api.deepseek.com')) {
      return Response.json({
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
    }

    if (url.includes('opencode.ai')) {
      return Response.json({
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
    }
    return Response.json({
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
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fakeFetch,
  });

  try {
    registerAccountRoute(ctx);

    const route = routes[0];

    expect(route?.path).toBe('/api/plugin-meter/account');
    expect(route?.methods).toEqual(['GET']);

    if (route === undefined) {
      return;
    }
    const call = async (
      provider: string,
    ): Promise<{ body: unknown; seen: readonly SeenRequest[] }> => {
      seen.length = 0;

      const response = await route.fetch(
        new Request(
          `http://127.0.0.1/api/plugin-meter/account?provider=${provider}`,
        ),
      );

      return { body: await response.json(), seen: [...seen] };
    };
    const deepseek = await call('deepseek-official');

    expect(deepseek.seen.map(entry => entry.url)).toEqual([
      'https://api.deepseek.com/user/balance',
    ]);
    expect(deepseek.seen[0]?.authorization).toBe('Bearer deepseek-key');
    expect(deepseek.seen[0]?.userAgent).toBe('dsh-plugin-meter');
    expect(deepseek.body).toEqual({
      status: 'ok',
      view: {
        kind: 'balance',
        available: true,
        balances: [{ currency: 'CNY', granted: '10.00', toppedUp: '104.00' }],
      },
    });

    const opencode = await call('opencode-go');

    expect(opencode.seen.map(entry => entry.url)).toEqual([
      'https://opencode.ai/zen/go/v1/usage',
    ]);
    expect(opencode.seen[0]?.authorization).toBe('Bearer opencode-key');
    expect(opencode.body).toMatchObject({
      status: 'ok',
      view: {
        kind: 'opencode-quota',
        windows: {
          rolling: { percent: 18 },
          weekly: { percent: 78 },
          monthly: { percent: 39 },
        },
      },
    });

    const codex = await call('openai-codex');

    expect(codex.seen.map(entry => entry.url)).toEqual([
      'https://chatgpt.com/backend-api/wham/usage',
    ]);
    expect(codex.seen[0]?.authorization).toBe('Bearer codex-access');
    expect(codex.seen[0]?.accountId).toBe('codex-account');
    expect(codex.body).toEqual({
      status: 'ok',
      view: {
        kind: 'codex-windows',
        windows: [
          {
            percent: 20,
            windowSeconds: 2_592_000,
            resetsAt: new Date(1_795_074_954 * 1000).toISOString(),
          },
        ],
      },
    });

    const unknown = await call('amazon-bedrock');

    expect(unknown.seen).toEqual([]);
    expect(unknown.body).toEqual({ status: 'unsupported' });
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: originalFetch,
    });
  }
});
