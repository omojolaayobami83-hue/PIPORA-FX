# PIPORA GOLD

**Price Intelligence · Precision · Opportunity · Risk Awareness**

PIPORA GOLD is an educational market-analysis web app focused on **XAUUSD (Gold)** and **GBPJPY**. It is a decision-support tool, not an automated trading system and not financial advice.

## Current features

- Two-market dashboard: select Gold or GBPJPY before opening its chart.
- TradingView chart view with 5-minute, 15-minute, 1-hour and 4-hour intervals.
- Twelve Data candle feed through the server (API key stays on the server).
- EMA 9/21, RSI 14, ATR 14, swing-structure estimates, BOS/possible CHOCH, recent support/resistance, liquidity-sweep checks, three-candle FVG estimates and potential order-block zones.
- Four-timeframe context scanner for the selected market.
- Broker-input risk estimate with quote-to-account currency conversion.
- Manual event-time safety checker (not a live economic calendar).
- Local trade journal with entry, exit, realised P/L, notes and CSV export.
- Installable PWA shell for supported browsers; offline shell does not provide live market data.
- Initial privacy and terms/risk notice pages at `/privacy.html` and `/terms.html` (review these for your jurisdiction before public commercial release).

## Run locally

1. Install Node.js 18 or newer.
2. Clone this repository and enter its folder.
3. Run `npm install`.
4. Set the environment variable `TWELVE_DATA_API_KEY` in your hosting provider's secret/environment settings. For local use, create a private `.env` file:
   `TWELVE_DATA_API_KEY=your_private_key`
5. Run `npm start`.
6. Open `http://localhost:3000`.

Never commit the `.env` file or expose the API key in browser JavaScript.

## Deployment checklist

- Set `TWELVE_DATA_API_KEY` as a private environment variable on the hosting service.
- Use Node.js 18 or newer and the start command `npm start`.
- Test `/api/health`, `/api/markets`, and both `/api/price?market=XAUUSD&interval=15min` and `/api/price?market=GBPJPY&interval=15min`.
- Confirm the Twelve Data plan supports both symbols and the required intervals.
- Test on Android and desktop, including install prompt, chart loading and journal export.
- Publish a privacy notice and terms before collecting accounts, payments or personal data.

## Important limitations

- Market-pattern labels (BOS, CHOCH, FVG, order blocks and liquidity sweeps) are algorithmic approximations. They can be wrong and are not institutional order-flow data.
- Candidate labels are not trade instructions. No signal is guaranteed to win.
- The event checker is manual; there is no connected live economic calendar.
- Journal entries are stored in the current browser's local storage. They are not cloud-synced and may be lost if browser data is cleared.
- Risk sizing is an estimate. Broker contract size, tick value, lot step, minimum volume, leverage, spread, commissions, slippage and account-currency conversion must be verified with the broker.
- The app currently has no user accounts, subscription billing, cloud journal, or public Play Store release.
- A shared market-data API key has provider quotas. Caching reduces repeat calls but does not replace usage monitoring and abuse protection before a large public launch.

## Risk notice

Trading leveraged markets can result in rapid losses, including the loss of all capital in an account. Validate the app on demo data first, independently verify every value, and never risk money you cannot afford to lose.
