/** CSS 由 Bun text loader 内联，style 标签由 Client 的 ctx.effect 管理。 */

import meterCss from './meter.css';

const STYLE_MARK = 'data-dsh-meter-style';

function injectStyle(mark: string, css: string): void {
  const style = document.createElement('style');

  style.setAttribute(mark, '');
  style.textContent = css;
  document.head.append(style);
}

function removeStyle(mark: string): void {
  document.querySelector(`style[${mark}]`)?.remove();
}

export function injectStyles(): void {
  injectStyle(STYLE_MARK, meterCss);
}

export function removeStyles(): void {
  removeStyle(STYLE_MARK);
}
