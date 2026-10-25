/** Host 入口：注册 `meterUsage` 投影和受信账户查询路由。 */

import { type AccountRouteContext, registerAccountRoute } from './account';
import { meterProjectionDefinition } from './conversation/projection';

interface HostContext {
  sessionProjections: {
    register(definition: typeof meterProjectionDefinition): () => void;
  };
  inject(
    deps: readonly string[],
    callback: (ctx: AccountRouteContext) => void,
  ): unknown;
  effect(callback: () => () => void, label?: string): unknown;
}

export const inject = ['sessionProjections'];

export function apply(ctx: HostContext): void {
  ctx.effect(
    () => ctx.sessionProjections.register(meterProjectionDefinition),
    'meter: projection',
  );
  ctx.inject(['connection', 'credentials'], child => {
    registerAccountRoute(child);
  });
}
