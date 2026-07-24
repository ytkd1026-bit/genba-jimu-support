-- 保険提出用テンプレート（雛形）ライブラリのスキーマ
-- ------------------------------------------------------------------
-- このマイグレーションは、保険会社提出用の施工項目説明資料などの
-- 「雛形（テンプレート）」を管理する 3 テーブルを作成する。
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
  id             uuid primary key default gen_random_uuid(),
  -- 人が読める安定コード（例: INS-TPL-001）。参照・採番の正本。
  template_code  text not null unique,
  title          text not null,
  -- 分類（例: 保険復旧工事）
  category       text not null,
  -- 資料種別（例: 施工項目説明資料）
  document_type  text not null,
  -- 事故種別（例: 漏水事故 / 火災 など）
  accident_type  text not null,
  -- 対象保険会社名の配列（例: ["AIG","共通"]）。"共通" は特定社に依存しない汎用雛形。
  insurer_names  jsonb not null default '[]'::jsonb,
  -- 公開状態: draft=下書き / official=正式版 / archived=旧版退避
  status         text not null default 'draft'
                   check (status in ('draft', 'official', 'archived')),
  -- 現在の代表バージョン（insurance_template_versions.version を指す文字列）
  current_version text,
  description    text,
  -- PDF 本文全文（検索・引用・再生成の元テキスト）
  body_text      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table  public.insurance_document_templates is '保険提出用テンプレート（雛形）の本体';
comment on column public.insurance_document_templates.template_code is '人が読める安定コード（例: INS-TPL-001）';
comment on column public.insurance_document_templates.insurer_names is '対象保険会社名の JSON 配列（例: ["AIG","共通"]）';
comment on column public.insurance_document_templates.status is 'draft / official / archived';
comment on column public.insurance_document_templates.body_text is 'PDF 本文全文';

create index if not exists idx_ins_templates_accident_type
  on public.insurance_document_templates (accident_type);
create index if not exists idx_ins_templates_status
  on public.insurance_document_templates (status);
-- 保険会社名（JSON 配列）での絞り込み用
create index if not exists idx_ins_templates_insurer_names
  on public.insurance_document_templates using gin (insurer_names);

-- ─── バージョン（Storage 上のファイルパスを保持）────────────────
create table if not exists public.insurance_template_versions (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid not null
                     references public.insurance_document_templates(id) on delete cascade,
  -- バージョン文字列（例: 1.0）
  version          text not null,
  -- 格納バケット名（既定: insurance-templates）
  storage_bucket   text not null default 'insurance-templates',
  -- バケット内オブジェクトパス（例: INS-TPL-001/xxx.pdf）
  pdf_storage_path  text,
  docx_storage_path text,
  -- 表示・ダウンロード時のファイル名
  pdf_file_name     text,
  docx_file_name    text,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (template_id, version)
);

comment on table  public.insurance_template_versions is '雛形のバージョンと Storage 上のファイルパス';
comment on column public.insurance_template_versions.pdf_storage_path is 'insurance-templates バケット内の PDF オブジェクトパス';
comment on column public.insurance_template_versions.docx_storage_path is 'insurance-templates バケット内の DOCX オブジェクトパス';

create index if not exists idx_ins_template_versions_template_id
  on public.insurance_template_versions (template_id);

-- ─── タグ（検索用）───────────────────────────────────────────
create table if not exists public.insurance_template_tags (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null
                references public.insurance_document_templates(id) on delete cascade,
  tag         text not null,
  created_at  timestamptz not null default now(),
  unique (template_id, tag)
);

comment on table public.insurance_template_tags is '雛形に付与する検索用タグ';

create index if not exists idx_ins_template_tags_template_id
  on public.insurance_template_tags (template_id);
create index if not exists idx_ins_template_tags_tag
  on public.insurance_template_tags (tag);

-- ─── updated_at 自動更新トリガ ────────────────────────────────
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
-- 雛形はユーザー個別データではなく共有ライブラリ。
-- 読み取りはログインユーザーに許可し、書き込みは service_role のみ
-- （RLS を有効化し、書き込みポリシーを付与しないことで
--   service_role のバイパス以外からの書き込みを禁止する）。
alter table public.insurance_document_templates enable row level security;
alter table public.insurance_template_versions  enable row level security;
alter table public.insurance_template_tags      enable row level security;

drop policy if exists "insurance templates readable by authenticated"
  on public.insurance_document_templates;
create policy "insurance templates readable by authenticated"
  on public.insurance_document_templates
  for select to authenticated using (true);

drop policy if exists "insurance template versions readable by authenticated"
  on public.insurance_template_versions;
create policy "insurance template versions readable by authenticated"
  on public.insurance_template_versions
  for select to authenticated using (true);

drop policy if exists "insurance template tags readable by authenticated"
  on public.insurance_template_tags;
create policy "insurance template tags readable by authenticated"
  on public.insurance_template_tags
  for select to authenticated using (true);
