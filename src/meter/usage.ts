/** Client 读取 Host 投影并汇总费用。Host 只归类 token，金额在这里算。 */

import {
  type ModelPrice,
  type Tariff,
  type TokenBucket,
  bucketCost,
  bucketTokens,
  priceOf,
  ratesFor,
} from '../pricing';

export interface BucketClass {
  readonly tariff: Tariff;
  readonly tier: number;
  readonly bucket: TokenBucket;
}

export interface RouteUsage {
  readonly provider: string;
  readonly model: string;
  readonly classes: readonly BucketClass[];
}

export interface MeterUsageView {
  readonly routes: readonly RouteUsage[];
  readonly unattributed: TokenBucket;
}

/** 路由和总计共用的费用合计。 */
export interface CostTotals {
  readonly usd: number;
  readonly tokens: number;
  /** 没有对应单价档位的 token，金额不包含它们。 */
  readonly unpricedTokens: number;
}

export interface ModelCost extends CostTotals {
  readonly provider: string;
  readonly model: string;
  /** 整条路由都有单价时为 true。 */
  readonly priced: boolean;
}

export interface CostSummary extends CostTotals {
  readonly routes: readonly ModelCost[];
}

const ZERO_TOTALS: CostTotals = { usd: 0, tokens: 0, unpricedTokens: 0 };

function addTotals(left: CostTotals, right: CostTotals): CostTotals {
  return {
    usd: left.usd + right.usd,
    tokens: left.tokens + right.tokens,
    unpricedTokens: left.unpricedTokens + right.unpricedTokens,
  };
}

/** 取最近一次产生用量的 provider，模型选择缺失时用它判断面板类型。 */
export function lastUsedProvider(view: MeterUsageView | null): string | null {
  if (view === null) {
    return null;
  }

  for (let i = view.routes.length - 1; i >= 0; i -= 1) {
    const route = view.routes[i];

    if (route !== undefined) {
      return route.provider;
    }
  }
  return null;
}

/** 汇总一条路由，缺价的 token 只计入 tokens 和 unpricedTokens。 */
function summariseRoute(
  route: RouteUsage,
  price: ModelPrice | undefined,
): ModelCost {
  const totals = route.classes.reduce<CostTotals>((total, entry) => {
    const tokens = bucketTokens(entry.bucket);
    const rates =
      price === undefined ? null : ratesFor(price, entry.tariff, entry.tier);

    return addTotals(total, {
      usd: rates === null ? 0 : bucketCost(rates, entry.bucket),
      tokens,
      unpricedTokens: rates === null ? tokens : 0,
    });
  }, ZERO_TOTALS);

  return {
    provider: route.provider,
    model: route.model,
    ...totals,
    priced: totals.unpricedTokens === 0,
  };
}

/** 汇总所有路由，未归属 token 全部按未定价计。 */
export function summariseCost(view: MeterUsageView | null): CostSummary {
  if (view === null) {
    return { ...ZERO_TOTALS, routes: [] };
  }
  const routes = view.routes.map(route =>
    summariseRoute(route, priceOf(route.provider, route.model)),
  );
  const totals = routes.reduce<CostTotals>(
    (total, route) => addTotals(total, route),
    ZERO_TOTALS,
  );
  const unattributed = bucketTokens(view.unattributed);

  return {
    ...addTotals(totals, {
      usd: 0,
      tokens: unattributed,
      unpricedTokens: unattributed,
    }),
    routes,
  };
}
