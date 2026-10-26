# dsh-plugin-meter

A cost meter for DeepSeek Harness (dsh). The reading below the composer shows the current session's estimated API cost. Click it for the selected provider's balance or quota. The plugin is built for the model providers in DSH. It currently supports DeepSeek, OpenCode Go and Codex. Other providers show that no quota source is connected.

Read this in other languages: English | [简体中文](./README.zh.md)

## What it shows

The cost reading sits to the right of the built-in token reading and matches the style of the built-in information readings. The first part is a time: OpenCode Go and Codex show the next quota reset, while DeepSeek shows the current price window and the time until it switches. The second part is the session's estimated cost in US dollars, for example `1h 32m · US$0.07`.

The reading appears only after the first Assistant reply settles. A new session with no usage yet shows nothing, matching the built-in statistics.

For the DeepSeek official API, the label is the current price window and the number is the time until the next switch. Off-peak reads `OFF-PEAK 3h 40m`. Peak reads `PEAK 2h 15m`. The countdown updates every 30 seconds.

Click the reading to open a panel with the same type scale, spacing, border and elevation as the built-in Token usage panel:

| Selected provider     | Panel content                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DeepSeek official API | The topped-up balance, plus the granted balance when it is non-zero, for example `¥100.00 CNY`.                                                           |
| OpenCode Go           | Three fixed quota windows: 5-hour, weekly and monthly. Each row shows the window and its used percentage. Hover a row for the reset time.                 |
| OpenAI Codex          | The quota windows returned by the subscription. Each row uses the same window and percentage format. The number and length of windows depend on the plan. |
| Any other provider    | A notice that this provider has no quota source yet.                                                                                                      |

The panel follows the model selection. It switches to the new provider as soon as the selection is submitted, so moving between DeepSeek, OpenCode and Codex does not flash the previous provider's rows. It right-aligns to the cost reading and stays inside the viewport. Escape or an outside click closes it, and Escape returns focus to the reading.

If a session has tokens that cannot be priced, the panel adds an `Unpriced` row. It shows only the token count, for example `1,234,567 tok`, and does not add to the amount.

## Installation

You can install it from the dsh plugin manager by entering `dsh-plugin-meter`. Once installed, the plugin appears in the list as Cost Meter.

DSH manages dependencies through pnpm, and pnpm's [`minimumReleaseAge`](https://pnpm.io/supply-chain-security) policy skips versions that have not been published for the configured age (at most 24 hours), so installing a plugin may download an older version.

To use the latest plugin version immediately, specify the version when installing, for example `dsh-plugin-meter@^0.1.0`. Alternatively, wait for a while until the new version meets the policy, then install by package name.

## How the estimate works

Each settled Assistant message is priced from its token usage and public prices. The amount is an API-equivalent estimate, not a subscription fee or the provider's actual charge.

Uncached input, cache reads, cache writes and output tokens are priced separately. DeepSeek uses its base price off-peak and doubles it at peak. OpenCode Go uses its own fixed catalog price and does not apply the DeepSeek peak multiplier.

Unknown providers and models are not guessed. Their tokens are marked `Unpriced`, shown as a separate row and excluded from the amount.

## Known limitations

- Only the DeepSeek official API, OpenCode Go and OpenAI Codex are supported. Other providers get a notice.
- The amount is an estimate. Cache-write tiers, OpenCode's actual billing and requests that cross a peak boundary can make it differ from the provider bill.
- A request is classified by the settle time of its Assistant message, not the time the provider billed it.
- Tiered prices apply to the whole request based on its prompt tokens.
- Chinese public holidays are not handled. A holiday that falls on a weekday is priced as a normal weekday.
- Codex is billed by subscription. The panel shows an API-equivalent estimate, not a share of the subscription fee.
- Codex windows depend on the subscription.
- The DeepSeek official API returns current balances only, with no cumulative spend.

## FAQ

| Question                                                             | Answer                                                                                                                                                               |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Why does the amount differ from my provider bill?                    | The amount is estimated from public prices and session tokens, not the actual charge. Cache-write tiers, OpenCode billing and peak boundaries can cause differences. |
| What is `Unpriced`?                                                  | The provider or model has no usable price, or the matching tier is missing. Those tokens are listed by count and excluded from the amount.                           |
| Why does switching models not change the quota?                      | Quota data belongs to the provider. Switching models within one provider does not change the quota source. Switching providers does.                                 |
| What should I do when the panel says Not configured or Query failed? | The provider has no usable account credential, or the request failed. Check the matching DSH credential and open the panel again.                                    |
| Why is the Codex subscription fee not included?                      | The panel calculates an API-equivalent amount. It does not spread the subscription fee over tokens.                                                                  |

## Roadmap

- [x] Estimated session cost from token usage and official prices
- [x] DeepSeek topped-up and granted balances, OpenCode Go and Codex quota panel
- [x] English and Chinese UI
- [ ] Display unit setting
- [ ] More provider balance and quota sources
