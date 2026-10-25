import { expect, test } from 'bun:test';
import {
  type MeterProjectionState,
  applyMeterEvent,
  meterProjectionDefinition,
} from '#/conversation/projection';

interface EventInput {
  readonly type: string;
  readonly time?: number;
  readonly data: unknown;
}

const at = (index: number): number => Date.UTC(2026, 9, 23, 12, 0, 0) + index;

function apply(events: readonly EventInput[]): MeterProjectionState {
  let state = meterProjectionDefinition.init();

  events.forEach((event, index) => {
    state = applyMeterEvent(state, {
      type: event.type,
      time: event.time ?? at(index),
      data: event.data,
    });
  });

  return state;
}

function message(
  turn: number,
  step: number,
  usage: Record<string, number>,
  source = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
): EventInput {
  return {
    type: 'assistant/message',
    data: { turn, step, usage, message: { source } },
  };
}

const ROUTE_EVENT: EventInput = {
  type: 'request/context',
  data: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
};

test('一次结算记到对应路由', () => {
  const state = apply([
    ROUTE_EVENT,
    message(1, 1, {
      inputTokens: 1000,
      outputTokens: 200,
      cacheReadTokens: 3000,
    }),
  ]);

  expect(state.routes).toEqual([
    {
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
      classes: [
        {
          tariff: 'offPeak',
          tier: 0,
          bucket: {
            uncachedInputTokens: 1000,
            outputTokens: 200,
            cacheReadTokens: 3000,
            cacheWriteTokens: 0,
          },
        },
      ],
    },
  ]);
});
test('同一步骤的第二次 usage 替换第一次，不重复累计', () => {
  const state = apply([
    ROUTE_EVENT,
    {
      type: 'assistant/attempt',
      data: {
        turn: 1,
        step: 1,
        stream: [
          {
            type: 'chunk',
            chunk: {
              type: 'usage',
              usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 },
            },
          },
        ],
      },
    },
    message(1, 1, {
      inputTokens: 120,
      outputTokens: 20,
      cacheReadTokens: 0,
    }),
  ]);

  expect(state.routes[0]?.classes[0]?.bucket).toEqual({
    uncachedInputTokens: 120,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});
test('retry-started 关闭替换槽，重试单独累计', () => {
  const state = apply([
    ROUTE_EVENT,
    message(1, 1, { inputTokens: 100, outputTokens: 10 }),
    { type: 'llm/retry-started', data: { turn: 1, step: 1 } },
    message(1, 1, { inputTokens: 200, outputTokens: 20 }),
  ]);

  expect(state.routes[0]?.classes[0]?.bucket).toEqual({
    uncachedInputTokens: 300,
    outputTokens: 30,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});
test('切换模型后按路由拆分', () => {
  const state = apply([
    ROUTE_EVENT,
    message(1, 1, { inputTokens: 100, outputTokens: 10 }),
    {
      type: 'request/context',
      data: { provider: 'deepseek-official', model: 'deepseek-flash' },
    },
    message(
      1,
      2,
      { inputTokens: 200, outputTokens: 20 },
      { provider: 'deepseek-official', model: 'deepseek-flash' },
    ),
  ]);

  expect(state.routes.map(route => [route.provider, route.model])).toEqual([
    ['opencode-go', 'deepseek-v4.1-flash'],
    ['deepseek-official', 'deepseek-flash'],
  ]);
});
test('peak 时段单独归类', () => {
  const state = apply([
    {
      type: 'request/context',
      data: { provider: 'deepseek-official', model: 'deepseek-flash' },
    },
    {
      ...message(
        1,
        1,
        { inputTokens: 100, outputTokens: 10 },
        { provider: 'deepseek-official', model: 'deepseek-flash' },
      ),
      time: Date.UTC(2026, 9, 23, 2, 0, 0),
    },
  ]);

  expect(state.routes[0]?.classes).toEqual([
    {
      tariff: 'peak',
      tier: 0,
      bucket: {
        uncachedInputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  ]);
});
test('没有路由时计入未归属', () => {
  const state = apply([
    message(
      1,
      1,
      { inputTokens: 100, outputTokens: 10 },
      {
        provider: '',
        model: '',
      },
    ),
  ]);

  expect(state.routes).toEqual([]);
  expect(state.unattributed).toEqual({
    uncachedInputTokens: 100,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
});
test('wire 视图只暴露路由与未归属', () => {
  const state = apply([
    ROUTE_EVENT,
    message(1, 1, { inputTokens: 100, outputTokens: 10 }),
  ]);
  const view = meterProjectionDefinition.wire.view(state);

  expect(Object.keys(view).sort()).toEqual(['routes', 'unattributed']);
  expect(view.routes).toBe(state.routes);
});
