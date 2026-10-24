/** 模型目录快照与厂商选择状态机。 */

interface ModelSelectionValue {
  readonly provider: string;
  readonly model: string;
}

export interface ModelDirectorySnapshot {
  readonly current: ModelSelectionValue | null;
  readonly pending: ModelSelectionValue | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error';
}

export interface ModelDirectoryStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ModelDirectorySnapshot;
}

/**
 * 提交时 `pending` 立即出现，落盘投影的 `current` 稍后才到。
 * `pending` 清空后继续记住刚提交的厂商，避免面板闪回旧厂商。
 */
export function nextSubmittedProvider(
  submitted: string | null,
  state: ModelDirectorySnapshot,
): string | null {
  if (state.pending !== null) {
    return state.pending.provider;
  }

  if (state.status === 'error') {
    return null;
  }

  if (submitted !== null && state.current?.provider === submitted) {
    return null;
  }
  return submitted;
}

/** 优先级：pending、刚提交、当前落盘选择、最近用量的厂商。 */
export function displayedProvider(
  submitted: string | null,
  state: ModelDirectorySnapshot,
  fallback: string | null,
): string | null {
  if (state.pending !== null) {
    return state.pending.provider;
  }

  if (state.status !== 'error' && submitted !== null) {
    return submitted;
  }
  return state.current?.provider ?? fallback;
}

export interface ProviderMemorySnapshot {
  readonly state: ModelDirectorySnapshot;
  readonly submitted: string | null;
}

/**
 * 把「已提交厂商」的记忆挂在目录订阅上。
 * 目录回调在 React 之外推进状态，组件只读 `useSyncExternalStore` 快照。
 */
export class ProviderMemory {
  private state: ModelDirectorySnapshot;
  private submitted: string | null;
  private snapshot: ProviderMemorySnapshot;
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly directory: ModelDirectoryStore) {
    this.state = directory.getSnapshot();
    this.submitted = nextSubmittedProvider(null, this.state);
    this.snapshot = { state: this.state, submitted: this.submitted };
  }

  getSnapshot = (): ProviderMemorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    if (this.listeners.size === 1) {
      this.refresh();
      this.unsubscribe = this.directory.subscribe(() => {
        if (this.refresh()) {
          for (const item of this.listeners) {
            item();
          }
        }
      });
    }
    return () => {
      this.listeners.delete(listener);

      if (this.listeners.size === 0) {
        this.unsubscribe?.();
        this.unsubscribe = null;
      }
    };
  };

  private refresh(): boolean {
    const state = this.directory.getSnapshot();
    const submitted = nextSubmittedProvider(this.submitted, state);

    if (state === this.state && submitted === this.submitted) {
      return false;
    }
    this.state = state;
    this.submitted = submitted;
    this.snapshot = { state, submitted };

    return true;
  }
}
