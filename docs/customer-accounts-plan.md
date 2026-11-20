# Customer accounts and Premium access — implementation plan

## Current state
PIPORA currently has a private owner-only signed-cookie login. It does not yet have customer accounts, a database, or subscription billing. The existing owner login and market-data routes must remain protected during this migration.

## Foundation added
- `db/schema.sql` defines persistent customer, subscription, and payment records for PostgreSQL.
- Public signup must create customer accounts only. It must never accept a role, owner flag, subscription status, or Premium entitlement from the browser.
- Owner access remains separate from customer registration.

## Required rollout sequence
1. Create a managed PostgreSQL database (Render Postgres is suitable) and set its private `DATABASE_URL` environment variable on the web service.
2. Apply `db/schema.sql` to that database.
3. Add server-side customer registration/login with a modern password hash, secure HttpOnly cookies, CSRF/origin checks, rate limits, and account-status checks.
4. Add customer account pages. New customers start on Free; Premium pages and APIs enforce entitlement on the server.
5. Integrate Paystack in test mode. Keep the Paystack secret key only in the hosting provider's private environment settings. Verify each transaction server-side with Paystack before activating or extending a subscription; make webhook processing signature-checked and idempotent.
6. Add owner-only customer/subscription administration, then test expiry, failed payments, refunds, suspended accounts, and unauthorized API access before public launch.

## Important deployment safety
Do not switch the current app to public customer access until the database is connected and the new authentication middleware is tested. Render's application filesystem is not a suitable permanent account database. Do not collect passwords or payment details through a temporary/local-storage workaround.

## Product access rules
- Free: basic dashboard, standard analysis, and Academy.
- Premium: Advanced Analysis, PIPORA AI, advanced scanner, multi-timeframe tools, advanced structure, and premium journal statistics.
- Owner: full administration and Premium access.
- Premium entitlement is determined from verified, unexpired server-side subscription records, never from a browser flag.
