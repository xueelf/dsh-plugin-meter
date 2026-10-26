import {
  useAnchoredPosition,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives';
import {
  type CSSProperties,
  type ReactElement,
  Fragment,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '../hooks/use-account';
import { useModelProvider } from '../hooks/use-model-provider';
import { useNow } from '../hooks/use-now';
import type { Translate } from '../locales';
import { formatTokenCount, formatUsd } from '../meter/format';
import type { ModelDirectoryStore } from '../meter/model-provider';
import { providerCapability } from '../meter/provider';
import { detailRows, readingOf } from '../meter/reading';
import {
  type CostSummary,
  type MeterUsageView,
  lastUsedProvider,
  summariseCost,
} from '../meter/usage';

export interface MeterSlotProps {
  readonly useProjection: (key: 'meterUsage') => MeterUsageView | undefined;
  readonly directory: ModelDirectoryStore;
  readonly t: Translate;
}

interface MeterReadingProps {
  readonly usage: MeterUsageView;
  readonly summary: CostSummary;
  readonly directory: ModelDirectoryStore;
  readonly t: Translate;
}

/** 视口边缘留白，来自官方 `useStatDialog` 的 `PANEL_MARGIN`。 */
const PANEL_MARGIN = 12;
/** 触发器与面板的距离，来自官方 `useStatDialog` 的 `PANEL_GAP`。 */
const PANEL_GAP = 8;
const HIDDEN_STYLE: CSSProperties = {
  left: 0,
  top: 0,
  visibility: 'hidden',
};

/** 16×16 账单图标，1px 线宽，原创。 */
function MeterIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="2" y="1.1106" width="12" height="13.6577" rx="1" />
      <path d="M5 4.93945h6M5 7.93945h6M5 10.93945h6" />
    </svg>
  );
}

/** 统计条入口和详情面板。`t` 由槽位 locale 注入。 */
function MeterReading({
  usage,
  summary,
  directory,
  t,
}: MeterReadingProps): ReactElement {
  const provider = useModelProvider(directory, lastUsedProvider(usage));
  const [open, setOpen] = useState(false);
  const capability = providerCapability(provider);
  const { state: account, cancel, refresh } = useAccount(provider);
  const now = useNow();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastResetRefresh = useRef<{
    readonly provider: string | null;
    readonly reset: number;
  } | null>(null);
  const position = useAnchoredPosition({
    open,
    anchorRef: rootRef,
    panelRef,
    side: 'top',
    align: 'end',
    gap: PANEL_GAP,
    margin: PANEL_MARGIN,
  });

  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef);

  const { quotaReset, timePart, timeAt } = readingOf(provider, account, now, t);
  const amount = formatUsd(summary.usd);

  // closedVisible 的 provider 在面板关闭时也会显示账户时间，所以挂载和切厂商时预取。
  useEffect(() => {
    if (capability?.closedVisible !== true) {
      return undefined;
    }
    refresh();

    return cancel;
  }, [cancel, capability?.closedVisible, provider, refresh]);
  // 面板打开和金额变化时刷新。DeepSeek 关闭时取消请求，OpenCode/Codex 的读数请求允许完成。
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    refresh();

    return capability?.closedVisible === true ? undefined : cancel;
  }, [amount, cancel, capability?.closedVisible, open, provider, refresh]);
  // 同一个已过期 reset 只刷新一次，避免每 30 秒重复请求。
  useEffect(() => {
    if (quotaReset === null || quotaReset > now) {
      return;
    }
    const last = lastResetRefresh.current;

    if (
      last !== null &&
      last.provider === provider &&
      last.reset === quotaReset
    ) {
      return;
    }
    lastResetRefresh.current = { provider, reset: quotaReset };
    refresh();
  }, [now, provider, quotaReset, refresh]);
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const timeTitle =
    timeAt === null || timePart === null || timePart === '—'
      ? undefined
      : `${timePart} · ${new Date(timeAt).toLocaleString()}`;
  const aria =
    timePart === null
      ? `${t('title')} ${amount}`
      : `${t('title')} ${amount}, ${timePart}`;
  const rows = detailRows(t, provider, account);

  if (summary.unpricedTokens > 0) {
    rows.push({
      label: t('unpriced'),
      value: `${formatTokenCount(summary.unpricedTokens)} ${t('tokenUnit')}`,
    });
  }
  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="dsh-meter-panel"
          role="dialog"
          aria-label={t('title')}
          style={position ?? HIDDEN_STYLE}
        >
          <div className="dsh-meter-title">
            <span className="dsh-meter-title-label">
              <MeterIcon />
              {t('title')}
            </span>
            <span className="dsh-meter-title-value">{amount}</span>
          </div>
          <div className="dsh-meter-rule" aria-hidden="true" />
          <dl className="dsh-meter-details">
            {rows.map((row, index) => (
              <Fragment key={`${row.label}-${index}`}>
                <dt>{row.label}</dt>
                <dd title={row.title}>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span ref={rootRef} className="dsh-meter-anchor">
        <button
          ref={triggerRef}
          type="button"
          className="dsh-meter-pill"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={aria}
          title={timeTitle}
          onClick={() => setOpen(value => !value)}
        >
          <MeterIcon />
          <span className="dsh-meter-label">
            {timePart === null ? null : (
              <>
                {timePart}
                <span className="dsh-meter-sep" aria-hidden="true">
                  ·
                </span>
              </>
            )}
            {amount}
          </span>
        </button>
      </span>
      {panel}
    </>
  );
}

/** 费用入口。没有用量时不渲染，避免空会话出现 0 美元读数。 */
export function MeterPill({
  useProjection,
  directory,
  t,
}: MeterSlotProps): ReactElement | null {
  const usage = useProjection('meterUsage') ?? null;
  const summary = summariseCost(usage);

  if (usage === null || summary.tokens === 0) {
    return null;
  }
  return (
    <MeterReading directory={directory} usage={usage} summary={summary} t={t} />
  );
}
