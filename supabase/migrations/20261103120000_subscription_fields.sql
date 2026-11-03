-- Subscription state, written only by the polar-webhook function. Users can
-- read these columns (they can read their own row) but cannot change them:
-- the only column they may update is display_name.
alter table public.profiles
  add column premium_until timestamptz,
  add column cancel_at_period_end boolean not null default false,
  add column polar_subscription_id text,
  add column subscription_modified_at timestamptz;
