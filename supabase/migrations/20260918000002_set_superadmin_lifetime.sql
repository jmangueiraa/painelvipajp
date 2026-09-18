-- Migration: Set Super Admin subscription to Lifetime (NULL expires_at)
-- This removes the expiration deadline and marks the panel subscription as lifetime.

UPDATE public.settings 
SET subscription_expires_at = NULL 
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'entretenimentoajp@gmail.com'
);

-- Also ensure any user with admin role in user_roles has subscription_expires_at = NULL
UPDATE public.settings 
SET subscription_expires_at = NULL 
WHERE user_id IN (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'
);
