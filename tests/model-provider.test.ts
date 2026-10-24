import { expect, test } from 'bun:test';
import {
  type ModelDirectorySnapshot,
  type ModelDirectoryStore,
  displayedProvider,
  nextSubmittedProvider,
  ProviderMemory,
} from '#/meter/model-provider';

const selection = (provider: string, model: string) => ({ provider, model });

function state(
  current: ModelDirectorySnapshot['current'],
  pending: ModelDirectorySnapshot['pending'],
  status: ModelDirectorySnapshot['status'],
): ModelDirectorySnapshot {
  return { current, pending, status };
}

test('提交瞬间使用 pending 的厂商', () => {
  const next = state(
    selection('deepseek-official', 'deepseek-flash'),
    selection('opencode-go', 'deepseek-v4.1-flash'),
    'selecting',
  );

  expect(displayedProvider(null, next, null)).toBe('opencode-go');
});
test('pending 清空但 current 还没追上时保持刚提交的厂商', () => {
  const pending = state(
    null,
    selection('opencode-go', 'deepseek-v4.1-flash'),
    'selecting',
  );
  const submitted = nextSubmittedProvider(null, pending);

  expect(submitted).toBe('opencode-go');

  const lagging = state(
    selection('deepseek-official', 'deepseek-flash'),
    null,
    'ready',
  );

  expect(displayedProvider(submitted, lagging, null)).toBe('opencode-go');
  expect(nextSubmittedProvider(submitted, lagging)).toBe('opencode-go');
});
test('current 追上后清除缓存', () => {
  const caughtUp = state(
    selection('opencode-go', 'deepseek-v4.1-flash'),
    null,
    'ready',
  );

  expect(nextSubmittedProvider('opencode-go', caughtUp)).toBeNull();
  expect(displayedProvider(null, caughtUp, null)).toBe('opencode-go');
});
test('选择失败时回到 current，不保留失败的选择', () => {
  const failed = state(
    selection('deepseek-official', 'deepseek-flash'),
    null,
    'error',
  );

  expect(displayedProvider('opencode-go', failed, null)).toBe(
    'deepseek-official',
  );
  expect(nextSubmittedProvider('opencode-go', failed)).toBeNull();
});
test('完整的切换序列不出现旧厂商', () => {
  const states = [
    state(null, selection('opencode-go', 'deepseek-v4.1-flash'), 'selecting'),
    state(selection('deepseek-official', 'deepseek-flash'), null, 'ready'),
    state(selection('opencode-go', 'deepseek-v4.1-flash'), null, 'ready'),
  ];
  const seen: (string | null)[] = [];

  let submitted: string | null = null;

  for (const item of states) {
    seen.push(displayedProvider(submitted, item, 'deepseek-official'));
    submitted = nextSubmittedProvider(submitted, item);
  }
  expect(seen).toEqual(['opencode-go', 'opencode-go', 'opencode-go']);
});
test('目录尚未加载时回退到最近一次用量厂商', () => {
  const loading = state(null, null, 'loading');

  expect(displayedProvider(null, loading, 'opencode-go')).toBe('opencode-go');
});

function memoryAt(initial: ModelDirectorySnapshot): {
  readonly memory: ProviderMemory;
  readonly emit: (next: ModelDirectorySnapshot) => void;
} {
  let snapshot = initial;

  const listeners = new Set<() => void>();
  const directory: ModelDirectoryStore = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    memory: new ProviderMemory(directory),
    emit(next) {
      snapshot = next;

      for (const listener of listeners) {
        listener();
      }
    },
  };
}

test('ProviderMemory 在目录回调里推进提交厂商', () => {
  const { memory, emit } = memoryAt(
    state(selection('deepseek-official', 'deepseek-flash'), null, 'ready'),
  );
  const unsubscribe = memory.subscribe(() => {});

  expect(memory.getSnapshot().submitted).toBeNull();
  emit(
    state(null, selection('opencode-go', 'deepseek-v4.1-flash'), 'selecting'),
  );
  expect(memory.getSnapshot().submitted).toBe('opencode-go');
  emit(state(selection('deepseek-official', 'deepseek-flash'), null, 'ready'));
  expect(memory.getSnapshot().submitted).toBe('opencode-go');
  emit(state(selection('opencode-go', 'deepseek-v4.1-flash'), null, 'ready'));
  expect(memory.getSnapshot().submitted).toBeNull();
  unsubscribe();
});
test('ProviderMemory 在选择失败时清掉提交厂商', () => {
  const { memory, emit } = memoryAt(
    state(selection('deepseek-official', 'deepseek-flash'), null, 'ready'),
  );
  const unsubscribe = memory.subscribe(() => {});

  emit(
    state(null, selection('opencode-go', 'deepseek-v4.1-flash'), 'selecting'),
  );
  emit(state(selection('deepseek-official', 'deepseek-flash'), null, 'error'));
  expect(memory.getSnapshot().submitted).toBeNull();
  unsubscribe();
});
