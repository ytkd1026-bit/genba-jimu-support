-- 現場の事務サポ｜Supabase 初期スキーマ
-- 事業者(organization)単位でデータを分離し、RLS で自分の所属 org のみ読み書き可能にする。
-- 内部主キーは uuid。業務番号（REV-/CON-/見積番号 等）は *_code / *_number カラムで保持する。
-- Supabase の SQL Editor にこのファイル全体を貼り付けて実行してください。

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- 共通: updated_at 自動更新
-- ─────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 事業者と所属メンバー
-- ─────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'マイ事業者',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- 所属判定（SECURITY DEFINER で RLS を回避＝再帰しない）
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- 現在ユーザーの org（1ユーザー1事業者運用での既定 org）
create or replace function public.my_organization_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select m.organization_id from public.organization_members m
  where m.user_id = auth.uid()
  order by m.created_at asc
  limit 1;
$$;

-- サインアップ時に org と membership を自動作成（1ユーザー1事業者）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org uuid;
begin
  insert into public.organizations (name)
    values (coalesce(new.raw_user_meta_data->>'org_name', 'マイ事業者'))
    returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role)
    values (new_org, new.id, 'owner');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 会社設定（org につき原則1件）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_name text default '',
  representative_name text default '',
  postal_code text default '',
  address text default '',
  phone text default '',
  email text default '',
  invoice_registration_number text default '',
  bank_name text default '',
  branch_name text default '',
  account_type text default '普通',
  account_number text default '',
  account_holder text default '',
  standard_profit_rate numeric not null default 0.25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

-- ─────────────────────────────────────────────────────────────
-- 元請マスタ
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contractor_code text,
  company_name text not null default '',
  contact_name text default '',
  postal_code text default '',
  address text default '',
  phone text default '',
  email text default '',
  closing_day text default '',
  payment_terms text default '',
  note text default '',
  active boolean not null default true,
  is_test_data boolean not null default false,
  local_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, local_ref)
);

-- ─────────────────────────────────────────────────────────────
-- 単価マスタ（同一項目名でも単位別レコードを許容）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.unit_price_master (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade_category text default '',
  item_name text default '',
  material_name text default '',
  unit text default '',
  material_unit_cost numeric not null default 0,
  labor_unit_cost numeric not null default 0,
  subcontract_unit_cost numeric not null default 0,
  other_unit_cost numeric not null default 0,
  total_unit_cost numeric not null default 0,
  target_profit_rate numeric not null default 0.25,
  reference_selling_unit_price numeric not null default 0,
  standard_selling_unit_price numeric not null default 0,
  active boolean not null default true,
  is_test_data boolean not null default false,
  local_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, local_ref)
);

-- ─────────────────────────────────────────────────────────────
-- 案件
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_code text,
  project_name text default '',
  contractor_id uuid references public.contractors(id) on delete set null,
  client_name text default '',
  submit_to text default '',
  site_name text default '',
  site_address text default '',
  status text default 'survey',
  next_action text default '',
  scheduled_date date,
  is_test_data boolean not null default false,
  local_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, project_code),
  unique (organization_id, local_ref)
);

-- ─────────────────────────────────────────────────────────────
-- 工事項目（既存 WorkItem 構造・計算値も保持）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  work_item_code text,
  category text default '',
  work_name text default '',
  work_description text default '',
  material_name text default '',
  location text default '',
  quantity numeric not null default 0,
  unit text default '',
  selling_unit_price numeric not null default 0,
  selling_amount numeric not null default 0,
  material_unit_cost numeric not null default 0,
  labor_unit_cost numeric not null default 0,
  subcontract_unit_cost numeric not null default 0,
  other_unit_cost numeric not null default 0,
  material_cost numeric not null default 0,
  labor_cost numeric not null default 0,
  subcontract_cost numeric not null default 0,
  expense_cost numeric not null default 0,
  other_cost numeric not null default 0,
  total_cost numeric not null default 0,
  gross_profit numeric not null default 0,
  gross_profit_rate numeric not null default 0,
  tax_type text default 'taxable',
  tax_rate int default 10,
  note text default '',
  sort_order int not null default 0,
  local_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, local_ref)
);

-- ─────────────────────────────────────────────────────────────
-- 見積（保存時点のスナップショットを保持＝マスタ変更で過去見積が変わらない）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.saved_estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  estimate_number text,
  version int not null default 1,
  contractor_id uuid references public.contractors(id) on delete set null,
  submit_to_snapshot jsonb,
  company_snapshot jsonb,
  line_items_snapshot jsonb,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  status text default 'saved',
  issued_at timestamptz,
  valid_until date,
  note text default '',
  local_ref text,
  created_at timestamptz not null default now(),
  unique (organization_id, local_ref)
);

-- ─────────────────────────────────────────────────────────────
-- 請求（同様にスナップショット保持）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.saved_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  invoice_number text,
  contractor_id uuid references public.contractors(id) on delete set null,
  submit_to_snapshot jsonb,
  company_snapshot jsonb,
  line_items_snapshot jsonb,
  subtotal numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  status text default 'issued',
  invoice_date date,
  due_date date,
  note text default '',
  bank_fee_note text default '',
  local_ref text,
  created_at timestamptz not null default now(),
  unique (organization_id, local_ref)
);

-- updated_at トリガ
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','company_settings','contractors','unit_price_master','projects','work_items'
  ] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s;', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- RLS: 自分の所属 org のデータのみ読み書き可能
-- ─────────────────────────────────────────────────────────────
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.company_settings     enable row level security;
alter table public.contractors          enable row level security;
alter table public.unit_price_master    enable row level security;
alter table public.projects             enable row level security;
alter table public.work_items           enable row level security;
alter table public.saved_estimates      enable row level security;
alter table public.saved_invoices       enable row level security;

-- organizations
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated using (is_org_member(id));
drop policy if exists org_insert on public.organizations;
create policy org_insert on public.organizations for insert to authenticated with check (auth.uid() is not null);
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated using (is_org_member(id)) with check (is_org_member(id));

-- organization_members
drop policy if exists mem_select on public.organization_members;
create policy mem_select on public.organization_members for select to authenticated using (user_id = auth.uid() or is_org_member(organization_id));
drop policy if exists mem_insert on public.organization_members;
create policy mem_insert on public.organization_members for insert to authenticated with check (is_org_member(organization_id));
drop policy if exists mem_delete on public.organization_members;
create policy mem_delete on public.organization_members for delete to authenticated using (is_org_member(organization_id));

-- 業務テーブル共通ポリシー（organization_id で分離）
do $$
declare t text;
begin
  foreach t in array array[
    'company_settings','contractors','unit_price_master','projects','work_items','saved_estimates','saved_invoices'
  ] loop
    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (is_org_member(organization_id));', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (is_org_member(organization_id));', t);
    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (is_org_member(organization_id)) with check (is_org_member(organization_id));', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s;', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (is_org_member(organization_id));', t);
  end loop;
end $$;
