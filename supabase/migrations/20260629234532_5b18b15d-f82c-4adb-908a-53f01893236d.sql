DROP POLICY IF EXISTS "plans admin manage" ON public.app_plans;
CREATE POLICY "plans admin manage"
ON public.app_plans
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

DROP POLICY IF EXISTS "sub admin manage" ON public.app_subscriptions;
CREATE POLICY "sub admin manage"
ON public.app_subscriptions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

DROP POLICY IF EXISTS "sub own select" ON public.app_subscriptions;
CREATE POLICY "sub own select"
ON public.app_subscriptions
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

DROP POLICY IF EXISTS "subpay admin manage" ON public.app_subscription_payments;
CREATE POLICY "subpay admin manage"
ON public.app_subscription_payments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

DROP POLICY IF EXISTS "subpay own select" ON public.app_subscription_payments;
CREATE POLICY "subpay own select"
ON public.app_subscription_payments
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;