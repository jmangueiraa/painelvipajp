
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Allow authenticated users to upload/manage files in store-products bucket scoped to their user_id (first folder)
CREATE POLICY "store_products read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'store-products' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "store_products insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'store-products' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "store_products update own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'store-products' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "store_products delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'store-products' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read of product images (needed by client portal which loads without auth context for images)
CREATE POLICY "store_products public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'store-products');
