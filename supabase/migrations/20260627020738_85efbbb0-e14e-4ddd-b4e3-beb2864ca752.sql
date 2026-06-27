UPDATE public.settings s
SET subscription_expires_at = agg.first_paid + (agg.total_days || ' days')::interval
FROM (
  SELECT user_id, MIN(paid_at) AS first_paid, SUM(days) AS total_days
  FROM public.app_renewal_requests
  WHERE status = 'paid'
  GROUP BY user_id
) agg
WHERE s.user_id = agg.user_id;