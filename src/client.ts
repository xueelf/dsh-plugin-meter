/** Client 入口：在输入框下方的统计条注册费用入口。 */

import { METER_LOCALE } from './locales';
import type { ModelDirectoryStore } from './meter/model-provider';
import { injectStyles, removeStyles } from './styles/inject';
import { MeterPill } from './ui/MeterPill';

/** 输入框下方的统计条，与官方统计读数同一行。 */
const DOCK_SLOT = 'conversation.composer.dock';
/** 排在官方 token 统计（order 1）之后，显示在它右侧。 */
const DOCK_ORDER = 2;

interface ClientLocale {
  register(
    ns: string,
    messages: {
      readonly en: Record<string, string>;
      readonly zh: Record<string, string>;
    },
  ): () => void;
}

interface ModelDirectoryResolver {
  directoryFor(sessionId: string): { store: ModelDirectoryStore };
}

interface ClientContext {
  effect(callback: () => () => void, label?: string): () => void;
  locale: ClientLocale;
  slots: {
    inject(key: string, callback: () => () => void): () => void;
    register(
      options: {
        name: string;
        id: string;
        order?: number;
        locale?: string;
        inject?: (sessionId: string) => Record<string, unknown>;
      },
      component: typeof MeterPill,
    ): () => void;
  };
  inject(
    deps: readonly string[],
    callback: (
      ctx: ClientContext & { modelDirectories: ModelDirectoryResolver },
    ) => void,
  ): unknown;
}

export const inject = ['slots', 'locale'];

export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.locale.register(__PACKAGE_NAME__, METER_LOCALE),
    'meter: locale',
  );
  ctx.effect(() => {
    removeStyles();
    injectStyles();

    return removeStyles;
  }, 'meter: styles');
  ctx.inject(['modelDirectories'], child => {
    child.slots.inject(DOCK_SLOT, () =>
      child.slots.register(
        {
          name: DOCK_SLOT,
          id: __PACKAGE_NAME__,
          order: DOCK_ORDER,
          locale: __PACKAGE_NAME__,
          inject: (sessionId: string) => ({
            directory: child.modelDirectories.directoryFor(sessionId).store,
          }),
        },
        MeterPill,
      ),
    );
  });
}
