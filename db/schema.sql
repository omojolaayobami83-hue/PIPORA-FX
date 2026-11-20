-- PIPORA FX customer-account foundation (PostgreSQL)
-- Apply only after creating a managed PostgreSQL database.
-- Owner access remains separate and is never available through public signup.

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
  display_name VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  account_status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT customers_email_normalized_unique UNIQUE (email_normalized)
);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  plan_code VARCHAR(24) NOT NULL CHECK (plan_code IN ('premium_monthly', 'premium_yearly')),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'failed')),
  started_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (status = 'active' AND started_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > started_at)
    OR status <> 'active'
  )
);

CREATE INDEX IF NOT EXISTS customer_subscriptions_customer_status_idx
  ON customer_subscriptions (customer_id, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  subscription_id BIGINT REFERENCES customer_subscriptions(id) ON DELETE RESTRICT,
  provider VARCHAR(20) NOT NULL DEFAULT 'paystack'
    CHECK (provider IN ('paystack')),
  provider_reference VARCHAR(100) NOT NULL UNIQUE,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL DEFAULT 'NGN',
  status VARCHAR(16) NOT NULL DEFAULT 'initialized'
    CHECK (status IN ('initialized', 'verified', 'failed', 'refunded')),
  verified_at TIMESTAMPTZ,
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_transactions_customer_created_idx
  ON payment_transactions (customer_id, created_at DESC);

-- Do not store card numbers, CVV, Paystack secret keys, or raw customer passwords.
-- Premium access must be granted only after server-side provider verification.
