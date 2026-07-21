-- REVO OS Row Level Security v1
-- 原則: 全テーブル organization_id = 自組織 のみ読み書き可。
-- decisions は削除不可（supersede で積む）。organizations の更新は owner/admin のみ。

-- ─── 自組織ID（security definer で users のRLS再帰を回避） ─
create or replace function auth_org()
returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.users where id = auth.uid()
$$;
revoke all on function auth_org from public;
grant execute on function auth_org to authenticated;

create or replace function auth_is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role in ('owner','admin')
  )
$$;
revoke all on function auth_is_admin from public;
grant execute on function auth_is_admin to authenticated;

-- ─── organizations ───────────────────────────────────────
alter table organizations enable row level security;
create policy organizations_select on organizations
  for select using (id = auth_org());
create policy organizations_update on organizations
  for update using (id = auth_org() and auth_is_admin())
  with check (id = auth_org());
-- insert は create_organization() RPC（security definer）経由のみ。delete 不可。

-- ─── users ───────────────────────────────────────────────
alter table users enable row level security;
create policy users_select on users
  for select using (organization_id = auth_org());
create policy users_update_self on users
  for update using (id = auth.uid())
  with check (id = auth.uid() and organization_id = auth_org());
create policy users_admin_manage on users
  for all using (organization_id = auth_org() and auth_is_admin())
  with check (organization_id = auth_org());

-- ─── 業務テーブル一括（自組織のみ full access） ──────────
do $$
declare t text;
begin
  foreach t in array array[
    'customers','projects','project_counters','work_items','estimates','invoices',
    'material_orders','photos','damage_records','insurance_info','work_reports',
    'project_logs','learning_records','consultations','sns_posts',
    'meetings','meeting_action_items','tags','taggings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_org_all on public.%I for all
         using (organization_id = auth_org())
         with check (organization_id = auth_org())',
      t, t);
  end loop;
end $$;

-- ─── decisions（削除禁止・更新は status/superseded_by/review_at のみ想定） ─
alter table decisions enable row level security;
create policy decisions_select on decisions
  for select using (organization_id = auth_org());
create policy decisions_insert on decisions
  for insert with check (organization_id = auth_org());
create policy decisions_update on decisions
  for update using (organization_id = auth_org() and auth_is_admin())
  with check (organization_id = auth_org());
-- delete ポリシー無し = 削除不可（意思決定ログは消さない）

-- ─── Storage（パス先頭 = organization_id で分離） ─────────
insert into storage.buckets (id, name, public) values
  ('photos',    'photos',    false),
  ('documents', 'documents', false),
  ('audio',     'audio',     false),
  ('sns-media', 'sns-media', false)
on conflict (id) do nothing;

create policy storage_org_select on storage.objects
  for select using (
    bucket_id in ('photos','documents','audio','sns-media')
    and (storage.foldername(name))[1] = auth_org()::text
  );
create policy storage_org_insert on storage.objects
  for insert with check (
    bucket_id in ('photos','documents','audio','sns-media')
    and (storage.foldername(name))[1] = auth_org()::text
  );
create policy storage_org_update on storage.objects
  for update using (
    bucket_id in ('photos','documents','audio','sns-media')
    and (storage.foldername(name))[1] = auth_org()::text
  );
create policy storage_org_delete on storage.objects
  for delete using (
    bucket_id in ('photos','documents','audio','sns-media')
    and (storage.foldername(name))[1] = auth_org()::text
  );
