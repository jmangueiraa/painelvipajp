-- 1) Revoke public/authenticated EXECUTE on SECURITY DEFINER store functions
REVOKE EXECUTE ON FUNCTION public.find_store_owner_by_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_store_products(uuid) FROM PUBLIC, anon, authenticated;

-- 2) delivery-proofs: owner-scoped write policies
CREATE POLICY "owners insert delivery proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'delivery-proofs' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "owners update delivery proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'delivery-proofs' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'delivery-proofs' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "owners delete delivery proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'delivery-proofs' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3) store-products: only files actually published as product images are publicly readable
DROP POLICY IF EXISTS "store_products public read" ON storage.objects;
CREATE POLICY "store_products public read published"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'store-products'
  AND EXISTS (
    SELECT 1 FROM public.store_products sp
    WHERE sp.image_url IS NOT NULL
      AND sp.image_url LIKE '%/store-products/' || storage.objects.name
  )
);