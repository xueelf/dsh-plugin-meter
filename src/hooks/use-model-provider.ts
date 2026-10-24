import { useMemo, useSyncExternalStore } from 'react';
import {
  type ModelDirectoryStore,
  displayedProvider,
  ProviderMemory,
} from '../meter/model-provider';

/**
 * 订阅模型目录并返回当前厂商。
 * `ProviderMemory` 在目录回调里记住刚提交的厂商，避免闪回。
 */
export function useModelProvider(
  directory: ModelDirectoryStore,
  fallback: string | null,
): string | null {
  const memory = useMemo(() => new ProviderMemory(directory), [directory]);
  const snapshot = useSyncExternalStore(memory.subscribe, memory.getSnapshot);

  return displayedProvider(snapshot.submitted, snapshot.state, fallback);
}
