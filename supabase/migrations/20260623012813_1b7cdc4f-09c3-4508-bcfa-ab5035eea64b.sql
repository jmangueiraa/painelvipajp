
alter table public.settings
  add column if not exists app_android_url text,
  add column if not exists app_ios_url text;
