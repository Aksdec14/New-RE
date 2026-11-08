-- ============================================================================
-- 090500_reference_data
-- Plan catalogue. Kept in a migration (not seed.sql) because production needs
-- these rows for onboarding and billing checks to work.
-- ============================================================================

insert into public.plans (
  id, name, description, price_monthly, trial_days, grace_period_days,
  max_staff, max_tables, features, sort_order
)
values
  (
    'trial', 'Free trial', '14-day trial with every feature unlocked.',
    0, 14, 7, 5, 10,
    '{"reports": true, "offline": true, "realtime": true, "support": "community"}'::jsonb,
    0
  ),
  (
    'starter', 'Starter', 'For a single counter or a small cafe.',
    999, 0, 7, 5, 15,
    '{"reports": true, "offline": true, "realtime": true, "support": "email"}'::jsonb,
    1
  ),
  (
    'growth', 'Growth', 'For busy restaurants with multiple stations.',
    1999, 0, 7, 20, 60,
    '{"reports": true, "offline": true, "realtime": true, "support": "priority", "multi_branch": false}'::jsonb,
    2
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  trial_days = excluded.trial_days,
  grace_period_days = excluded.grace_period_days,
  max_staff = excluded.max_staff,
  max_tables = excluded.max_tables,
  features = excluded.features,
  sort_order = excluded.sort_order;
