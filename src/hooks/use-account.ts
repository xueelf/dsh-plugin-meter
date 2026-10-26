import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AccountLoad,
  ACCOUNT_ROUTE,
  readProviderAccount,
} from '../meter/account';
import { providerCapability } from '../meter/provider';

export type { AccountLoad } from '../meter/account';

interface AccountState {
  readonly provider: string | null;
  readonly load: AccountLoad;
}

function currentLoad(
  state: AccountState,
  provider: string | null,
): AccountLoad {
  return state.provider === provider ? state.load : { status: 'idle' };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 按 DSH 的 provider id 请求账户。是否在面板关闭时预取由调用方根据
 * `closedVisible` 决定。状态带 provider，provider 变化时不会先渲染旧厂商的数据。
 */
export function useAccount(provider: string | null): {
  readonly state: AccountLoad;
  readonly refresh: () => void;
  readonly cancel: () => void;
} {
  const [state, setState] = useState<AccountState>({
    provider,
    load: { status: 'idle' },
  });
  const inflight = useRef<AbortController | null>(null);
  const cancel = useCallback((): void => {
    inflight.current?.abort();
    inflight.current = null;
  }, []);
  const refresh = useCallback((): void => {
    inflight.current?.abort();

    const controller = new AbortController();

    inflight.current = controller;

    if (providerCapability(provider) === undefined) {
      setState({
        provider,
        load: { status: 'ready', account: { status: 'unsupported' } },
      });
      inflight.current = null;

      return;
    }
    setState(previous => {
      const current = currentLoad(previous, provider);

      return {
        provider,
        load:
          current.status === 'ready'
            ? { status: 'ready', account: current.account }
            : { status: 'loading' },
      };
    });

    const run = async (): Promise<void> => {
      try {
        const response = await fetch(
          `${ACCOUNT_ROUTE}?provider=${encodeURIComponent(provider ?? '')}`,
          {
            cache: 'no-store',
            signal: controller.signal,
            headers: { accept: 'application/json' },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const parsed = readProviderAccount(await response.json());

        if (parsed === null) {
          throw new Error('unexpected response');
        }

        if (inflight.current === controller) {
          setState({
            provider,
            load: { status: 'ready', account: parsed },
          });
        }
      } catch (error) {
        if (controller.signal.aborted || inflight.current !== controller) {
          return;
        }
        setState(previous => {
          const current = currentLoad(previous, provider);

          return {
            provider,
            load:
              current.status === 'ready'
                ? { ...current, refreshError: errorMessage(error) }
                : { status: 'error', message: errorMessage(error) },
          };
        });
      } finally {
        if (inflight.current === controller) {
          inflight.current = null;
        }
      }
    };
    run();
  }, [provider]);

  // provider 变化时取消旧请求并清空旧厂商状态，避免先渲染上一家数据。
  useEffect(() => {
    cancel();
    setState({ provider, load: { status: 'idle' } });
  }, [cancel, provider]);
  useEffect(() => cancel, [cancel]);

  const load = currentLoad(state, provider);

  return { state: load, refresh, cancel };
}
