-- 保険提出用テンプレート（雛形）ライブラリのスキーマ
-- ------------------------------------------------------------------
-- ★ ライブ Supabase プロジェクト "AI-touryou" 側を正とし、
--   そこに既に作成済みの構造へ一致させたマイグレーション。
--   既存環境へ再適用しても壊れないよう冪等に記述している
--   （create ... if not exists / drop policy if exists → create）。
--
--   insurance_document_templates … 雛形の本体（メタ情報＋本文）
--   insurance_template_versions  … 雛形のバージョンと Storage 上のファイルパス
--   insurance_template_tags      … 雛形に付与する検索用タグ
--
-- ストレージバケット（insurance-templates）は
-- 20260724000002_insurance_templates_storage.sql で作成する。
-- ==================================================================

-- ─── 雛形本体 ─────────────────────────────────────────────────
create table if not exists public.insurance_document_templates (
  id              uuid primary key default gen_random_uuid(),
  template_code   text not null unique,
  title           text not null,
  category        text not null,
  document_type   text not null,
  accident_type   text,
  -- 対象保険会社名の配列（例: {AIG,共通}）。"共通" は特定社に依存しない汎用雛形。
  insurer_names   text[] not null default '{}',
  description     text,
  -- PDF 本文全文（検索・引用・再生成の元テキスト）
  body_text       text,
  current_version text not null default '1.0',
  -- 公開状態: draft=下書き / official=正式版 / archived=旧版退避
  status          text not null default 'draft'
                    check (status in ('draft', 'official', 'archived')),
  is_active       boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table  public.insurance_document_templates is '保険提出用テンプレート（雛形）の本体';
comment on column public.insurance_document_templates.template_code is '人が読める安定コード（例: INS-TPL-001）';
comment on column public.insurance_document_templates.insurer_names is '対象保険会社名の配列（例: {AIG,共通}）';
comment on column public.insurance_document_templates.status is 'draft / official / archived';
comment on column public.insurance_document_templates.body_text is 'PDF 本文全文';

create index if not exists idx_ins_templates_accident_type
  on public.insurance_document_templates (accident_type);
create index if not exists idx_ins_templates_status
  on public.insurance_document_templates (status);
create index if not exists idx_ins_templates_is_active
  on public.insurance_document_templates (is_active);
-- 保険会社名（配列）での絞り込み用
create index if not exists idx_ins_templates_insurer_names
  on public.insurance_document_templates using gin (insurer_names);

-- ─── バージョン（Storage 上のファイルパスを保持）────────────────
create table if not exists public.insurance_template_versions (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null,
  version              text not null,
  -- insurance-templates バケット内のオブジェクトパス（例: INS-TPL-001/xxx.pdf）
  pdf_path             text,
  docx_path            text,
  -- 元ファイル名（表示・ダウンロード用）
  source_filename_pdf  text,
  source_filename_docx text,
  change_summary       text,
  is_current           boolean not null default false,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  unique (template_id, version)
);

comment on table  public.insurance_template_versions is '雛形のバージョンと Storage 上のファイルパス';
comment on column public.insurance_template_versions.pdf_path is 'insurance-templates バケット内の PDF オブジェクトパス';
comment on column public.insurance_template_versions.docx_path is 'insurance-templates バケット内の DOCX オブジェクトパス';

create index if not exists idx_ins_template_versions_template_id
  on public.insurance_template_versions (template_id);

-- ─── タグ（検索用）───────────────────────────────────────────
create table if not exists public.insurance_template_tags (
  template_id uuid not null,
  tag         text not null,
  created_at  timestamptz not null default now(),
  primary key (template_id, tag)
);

comment on table public.insurance_template_tags is '雛形に付与する検索用タグ';

create index if not exists idx_ins_template_tags_tag
  on public.insurance_template_tags (tag);

-- ─── updated_at 自動更新トリガ（templates のみ）───────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ins_templates_updated_at on public.insurance_document_templates;
create trigger trg_ins_templates_updated_at
  before update on public.insurance_document_templates
  for each row execute function public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
-- ライブ側の運用に合わせる:
--   SELECT / INSERT / UPDATE / DELETE をいずれも authenticated に許可し、
--   条件は auth.uid() is not null。
alter table public.insurance_document_templates enable row level security;
alter table public.insurance_template_versions  enable row level security;
alter table public.insurance_template_tags      enable row level security;

-- insurance_document_templates
drop policy if exists "ins_templates_select" on public.insurance_document_templates;
create policy "ins_templates_select" on public.insurance_document_templates
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "ins_templates_insert" on public.insurance_document_templates;
create policy "ins_templates_insert" on public.insurance_document_templates
  for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "ins_templates_update" on public.insurance_document_templates;
create policy "ins_templates_update" on public.insurance_document_templates
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "ins_templates_delete" on public.insurance_document_templates;
create policy "ins_templates_delete" on public.insurance_document_templates
  for delete to authenticated using (auth.uid() is not null);

-- insurance_template_versions
drop policy if exists "ins_template_versions_select" on public.insurance_template_versions;
create policy "ins_template_versions_select" on public.insurance_template_versions
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "ins_template_versions_insert" on public.insurance_template_versions;
create policy "ins_template_versions_insert" on public.insurance_template_versions
  for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "ins_template_versions_update" on public.insurance_template_versions;
create policy "ins_template_versions_update" on public.insurance_template_versions
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "ins_template_versions_delete" on public.insurance_template_versions;
create policy "ins_template_versions_delete" on public.insurance_template_versions
  for delete to authenticated using (auth.uid() is not null);

-- insurance_template_tags
drop policy if exists "ins_template_tags_select" on public.insurance_template_tags;
create policy "ins_template_tags_select" on public.insurance_template_tags
  for select to authenticated using (auth.uid() is not null);
drop policy if exists "ins_template_tags_insert" on public.insurance_template_tags;
create policy "ins_template_tags_insert" on public.insurance_template_tags
  for insert to authenticated with check (auth.uid() is not null);
drop policy if exists "ins_template_tags_update" on public.insurance_template_tags;
create policy "ins_template_tags_update" on public.insurance_template_tags
  for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
drop policy if exists "ins_template_tags_delete" on public.insurance_template_tags;
create policy "ins_template_tags_delete" on public.insurance_template_tags
  for delete to authenticated using (auth.uid() is not null);
