-- REVO OS Supabase スキーマ v1
-- 対象: REVO CARE / 現場の事務サポ / SNS事業 / AI棟梁 / AI Meeting / Decision Log
-- テナント = organizations（1社=1行）。全業務テーブルは organization_id を持つ。

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ─── enum ────────────────────────────────────────────────
create type user_role           as enum ('owner','admin','member');
create type project_type        as enum ('normal','insurance');
create type building_type       as enum ('condominium','apartment','detached_house','commercial','office','other');
create type project_status      as enum ('survey','estimating','submitted','approved','scheduled','in_progress','completed','invoiced','paid','cancelled');
create type inflow_route        as enum ('existing_customer','direct','line','instagram','google','referral','contractor','other');
create type tax_type            as enum ('taxable','non_taxable','tax_exempt');
create type consultation_status as enum ('new','in_progress','surveyed','converted','closed','lost');
create type sns_status          as enum ('idea','draft','scheduled','posted');
create type decision_status     as enum ('active','superseded','retired');

-- ─── updated_at 共通トリガ ───────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ─── 組織・ユーザー ──────────────────────────────────────
create table organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  project_code   text not null check (project_code ~ '^[A-Z0-9]{2,8}$'),
  representative text default '',
  postal_code    text default '',
  address        text default '',
  tel            text default '',
  email          text default '',
  invoice_number text default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table users (
  id              uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role            user_role not null default 'member',
  display_name    text not null default '',
  created_at      timestamptz not null default now()
);
create index idx_users_org on users (organization_id);

-- ─── 顧客マスタ ──────────────────────────────────────────
create table customers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  contact_name    text default '',
  tel             text default '',
  email           text default '',
  address         text default '',
  memo            text default '',
  rank            smallint,                 -- 顧客ランク（利益ベース・B-3で運用）
  external_key    text,                     -- localStorage時代のID温存
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_customers_org       on customers (organization_id, updated_at desc);
create index idx_customers_name_trgm on customers using gin (name gin_trgm_ops);

-- ─── 案件（事務サポの背骨） ──────────────────────────────
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  customer_id        uuid references customers(id) on delete set null,
  project_number     text,                  -- 表示用: REVO-26-0001（発番後は不変）
  project_code       text,
  sequence_year      int,
  sequence_number    int,
  legacy_project_id  text,                  -- 旧 REV-2026-0001 / 移行時の対応キー
  name               text not null default '',
  property_name      text not null default '',
  room_number        text not null default '',
  site_address       text not null default '',
  customer_name      text not null default '',
  client_name        text not null default '',
  submit_to          text not null default '',
  project_type       project_type   not null default 'normal',
  building_type      building_type  not null default 'other',
  status             project_status not null default 'survey',
  inflow_route       inflow_route,
  inflow_source_name text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (organization_id, project_number),
  unique (organization_id, project_code, sequence_year, sequence_number)
);
create index idx_projects_org_updated on projects (organization_id, updated_at desc);
create index idx_projects_org_status  on projects (organization_id, status);
create index idx_projects_customer    on projects (customer_id);
create index idx_projects_active      on projects (organization_id, updated_at desc)
  where status <> 'cancelled';
create index idx_projects_name_trgm   on projects using gin (name gin_trgm_ops);
create index idx_projects_client_trgm on projects using gin (client_name gin_trgm_ops);
create index idx_projects_number_trgm on projects using gin (project_number gin_trgm_ops);
create trigger trg_projects_updated before update on projects
  for each row execute function set_updated_at();

-- ─── 案件番号 DB採番（UNIQUE制約＋原子的インクリメント） ─
create table project_counters (
  organization_id uuid not null references organizations(id) on delete cascade,
  project_code    text not null,
  seq_year        int  not null,
  last_seq        int  not null default 0,
  primary key (organization_id, project_code, seq_year)
);

create or replace function issue_project_number(p_org uuid, p_code text, p_date date default current_date)
returns table (project_number text, sequence_year int, sequence_number int)
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from p_date);
  v_seq  int;
begin
  if p_code !~ '^[A-Z0-9]{2,8}$' then
    raise exception 'invalid project_code: %', p_code;
  end if;
  insert into project_counters as c (organization_id, project_code, seq_year, last_seq)
  values (p_org, p_code, v_year, 1)
  on conflict (organization_id, project_code, seq_year)
  do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;
  return query select
    p_code || '-' || to_char(v_year % 100, 'FM00') || '-' || lpad(v_seq::text, 4, '0'),
    v_year, v_seq;
end $$;
revoke all on function issue_project_number from public;
grant execute on function issue_project_number to authenticated;

-- ─── 工事項目（原価を持つ＝粗利の源泉） ───────────────────
create table work_items (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  project_id          uuid not null references projects(id) on delete cascade,
  item_code           text not null default '',   -- W-001
  category            text not null default '',
  work_name           text not null default '',
  work_description    text not null default '',
  location1           text not null default '',
  location2           text not null default '',
  quantity            numeric(12,2) not null default 0,
  unit                text not null default '',
  selling_unit_price  numeric(12,0) not null default 0,
  selling_amount      numeric(14,0) not null default 0,
  cost_unit_price     numeric(12,0) not null default 0,
  cost_amount         numeric(14,0) not null default 0,
  include_in_estimate boolean not null default true,
  note                text not null default '',
  tax_type            tax_type not null default 'taxable',
  tax_rate            smallint not null default 10 check (tax_rate in (0,8,10)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index idx_work_items_project on work_items (project_id);
create index idx_work_items_org     on work_items (organization_id);
create trigger trg_work_items_updated before update on work_items
  for each row execute function set_updated_at();

-- ─── 見積・請求 ──────────────────────────────────────────
create table estimates (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  project_id           uuid not null references projects(id) on delete cascade,
  estimate_no          text not null,             -- REVO-26-0001-EST-01
  version              int  not null default 1,
  previous_estimate_id uuid references estimates(id),
  revision_reason      text,
  subtotal             numeric(14,0) not null default 0,
  tax_total            numeric(14,0) not null default 0,
  total                numeric(14,0) not null default 0,
  tax_breakdown        jsonb,
  line_snapshots       jsonb,                     -- 発行時点の明細を固定
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, estimate_no)
);
create index idx_estimates_project on estimates (project_id);
create trigger trg_estimates_updated before update on estimates
  for each row execute function set_updated_at();

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  invoice_no      text not null,                  -- REVO-26-0001-INV-01
  invoice_date    date not null default current_date,
  due_date        date,
  note            text not null default '',
  subtotal        numeric(14,0) not null default 0,
  tax_total       numeric(14,0) not null default 0,
  total           numeric(14,0) not null default 0,
  tax_breakdown   jsonb,
  line_snapshots  jsonb,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, invoice_no)
);
create index idx_invoices_project   on invoices (project_id);
create index idx_invoices_org_month on invoices (organization_id, invoice_date);
create index idx_invoices_unpaid    on invoices (organization_id, invoice_date)
  where paid_at is null;
create trigger trg_invoices_updated before update on invoices
  for each row execute function set_updated_at();

create table material_orders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid references projects(id) on delete set null,
  supplier        text not null default '',
  status          text not null default 'draft',
  items           jsonb not null default '[]',
  ordered_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_material_orders_org on material_orders (organization_id, updated_at desc);
create trigger trg_material_orders_updated before update on material_orders
  for each row execute function set_updated_at();

-- ─── 現場記録（写真・調査・保険・報告・ログ） ─────────────
create table photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  record_code     text not null default '',       -- P-001
  storage_path    text not null,                  -- photos バケット内パス
  caption         text not null default '',
  location        text not null default '',
  taken_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index idx_photos_project on photos (project_id);

create table damage_records (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  record_code     text not null default '',       -- D-001
  content         jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index idx_damage_project on damage_records (project_id);

create table insurance_info (
  project_id      uuid primary key references projects(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  content         jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);

create table work_reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  record_code     text not null default '',       -- R-001
  content         jsonb not null default '{}',
  reported_at     date,
  created_at      timestamptz not null default now()
);
create index idx_work_reports_project on work_reports (project_id);

create table project_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id      uuid not null references projects(id) on delete cascade,
  record_code     text not null default '',       -- L-001
  party_type      text not null default '',
  content         text not null default '',
  logged_at       timestamptz not null default now()
);
create index idx_project_logs_project on project_logs (project_id, logged_at desc);

-- ─── AI棟梁（学び・知識蓄積） ────────────────────────────
create table learning_records (
  project_id       uuid primary key references projects(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete cascade,
  success          text not null default '',
  failure          text not null default '',
  unexpected_issue text not null default '',
  improvement      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_learning_org on learning_records (organization_id, updated_at desc);
create trigger trg_learning_updated before update on learning_records
  for each row execute function set_updated_at();

-- ─── REVO CARE（相談窓口） ───────────────────────────────
create table consultations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  channel          inflow_route not null default 'line',
  name             text not null default '',
  tel              text not null default '',
  line_user_id     text,
  address          text not null default '',
  content          text not null default '',
  status           consultation_status not null default 'new',
  project_id       uuid references projects(id) on delete set null,  -- 案件化したら接続
  assigned_user_id uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_consult_org_status on consultations (organization_id, status, created_at desc);
create trigger trg_consultations_updated before update on consultations
  for each row execute function set_updated_at();

-- ─── SNS事業（REVO MEDIA） ───────────────────────────────
create table sns_posts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  platform          text not null check (platform in ('instagram','line','google','blog')),
  status            sns_status not null default 'idea',
  title             text not null default '',
  body              text not null default '',
  media             jsonb not null default '[]', -- sns-media バケットのパス配列
  source_project_id uuid references projects(id) on delete set null, -- ネタ元現場
  scheduled_at      timestamptz,
  posted_at         timestamptz,
  metrics           jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_sns_org_status on sns_posts (organization_id, status, scheduled_at);
create trigger trg_sns_posts_updated before update on sns_posts
  for each row execute function set_updated_at();

-- ─── AI Meeting ──────────────────────────────────────────
create table meetings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title           text not null default '',
  held_at         timestamptz not null default now(),
  audio_path      text,                          -- audio バケット
  transcript      text,
  summary         text,
  ai_output       jsonb not null default '{}',   -- {action_items:[], decision_candidates:[]}
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);
create index idx_meetings_org on meetings (organization_id, held_at desc);

create table meeting_action_items (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  meeting_id       uuid not null references meetings(id) on delete cascade,
  content          text not null,
  assignee_user_id uuid references users(id),
  due_date         date,
  done_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index idx_action_items_open on meeting_action_items (organization_id, due_date)
  where done_at is null;

-- ─── Decision Log（意思決定は更新せず supersede で積む） ──
create table decisions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  meeting_id      uuid references meetings(id) on delete set null,
  decided_at      date not null default current_date,
  title           text not null,
  context         text not null default '',      -- 何が問題だったか
  decision        text not null,                 -- 何を決めたか
  reason          text not null default '',      -- なぜそう決めたか
  alternatives    jsonb not null default '[]',   -- 捨てた選択肢
  decided_by      uuid references users(id),
  status          decision_status not null default 'active',
  superseded_by   uuid references decisions(id),
  review_at       date,                          -- 見直し予定日
  created_at      timestamptz not null default now()
);
create index idx_decisions_org    on decisions (organization_id, decided_at desc);
create index idx_decisions_review on decisions (organization_id, review_at)
  where status = 'active' and review_at is not null;

-- ─── タグ（横断検索の軸） ────────────────────────────────
create table tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (organization_id, name)
);

create table taggings (
  tag_id          uuid not null references tags(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  entity_type     text not null check (entity_type in
    ('project','customer','photo','learning_record','sns_post','meeting','decision','consultation')),
  entity_id       uuid not null,
  created_at      timestamptz not null default now(),
  primary key (tag_id, entity_type, entity_id)
);
create index idx_taggings_entity on taggings (entity_type, entity_id);
create index idx_taggings_org    on taggings (organization_id, entity_type);

-- ─── 初期セットアップRPC（初回サインアップ→組織作成） ────
create or replace function create_organization(p_name text, p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if exists (select 1 from users where id = auth.uid()) then
    raise exception 'user already belongs to an organization';
  end if;
  insert into organizations (name, project_code) values (p_name, upper(p_code))
    returning id into v_org;
  insert into users (id, organization_id, role) values (auth.uid(), v_org, 'owner');
  return v_org;
end $$;
revoke all on function create_organization from public;
grant execute on function create_organization to authenticated;
