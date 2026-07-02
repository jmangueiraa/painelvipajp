
CREATE POLICY "owners read delivery proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'delivery-proofs' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "drivers upload delivery proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'delivery-proofs'
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.auth_user_id = auth.uid()
      AND d.user_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "drivers read own delivery proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'delivery-proofs'
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.auth_user_id = auth.uid()
      AND d.user_id::text = (storage.foldername(name))[1]
  )
);

CREATE OR REPLACE FUNCTION public.link_driver_to_current_user(_email text)
RETURNS public.drivers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT * INTO v_driver FROM public.drivers
    WHERE lower(email) = lower(_email) AND active = true
    ORDER BY created_at DESC LIMIT 1;
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'motorista não cadastrado';
  END IF;
  IF v_driver.auth_user_id IS NULL OR v_driver.auth_user_id <> auth.uid() THEN
    UPDATE public.drivers SET auth_user_id = auth.uid(), updated_at = now()
      WHERE id = v_driver.id
      RETURNING * INTO v_driver;
  END IF;
  RETURN v_driver;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_driver_to_current_user(text) TO authenticated;
