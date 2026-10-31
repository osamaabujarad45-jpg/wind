-- T22: one pending subscription per user and plan. Pending rows that predate the constraint collapse to
-- the newest per (user_id, plan) — active and rejected history is preserved untouched — so the unique
-- partial index can always be built, on a fresh schema or an upgraded one.
UPDATE subscriptions SET status = 'rejected'
WHERE status = 'pending' AND id NOT IN (
  SELECT MAX(id) FROM subscriptions WHERE status = 'pending' GROUP BY user_id, plan);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_pending ON subscriptions(user_id, plan) WHERE status = 'pending';
