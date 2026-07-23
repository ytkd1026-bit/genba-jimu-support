-- =============================================================================
-- 現場データ（AI棟梁ナレッジ）Supabase スキーマ
-- REVO Holdings / genba-jimu-support
--
-- 目的:
--   現地調査〜対応の現場知見（設備工事・給湯器など）を構造化して蓄積し、
--   将来の AI 検索（RAG）と全文検索の基盤にする。
--
-- 設計方針:
--   * 原因(cause)・症状(symptoms)・対応方法(recommended_actions 他)は全文検索可能にする
--     - 日本語は標準 tsvector の分かち書きが弱いため pg_trgm(GIN) を主軸にする
--     - あわせて simple 設定の tsvector も持たせ、英数字（型式・エラー番号）は語検索も可能にする
--   * タグは将来 RAG で使うため別テーブル（tags マスタ + 中間テーブル）で正規化管理する
--   * 画像は Storage バケット field-photos に保存し、URL を field_case_photos に紐付ける
--   * 検索速度を考慮し、検索対象カラムに GIN / btree インデックスを張る
--   * 登録内容は decision_logs（意思決定ログ）へ監査証跡として出力する
-- =============================================================================

-- ── 拡張機能 ─────────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";     -- 日本語部分一致・類似検索用の GIN インデックス

-- ── IMMUTABLE な配列→文字列ヘルパ ───────────────────────────────────────────
-- 標準 array_to_string は STABLE 指定のため生成カラム（IMMUTABLE 要件）に使えない。
-- text[] に限れば実質 immutable なので、明示的に IMMUTABLE なラッパを用意する。
create or replace function public.array_to_text_imm(arr text[])
returns text
language sql
immutable
as $$
  select coalesce(array_to_string(arr, ' '), '');
$$;

-- ── 更新日時トリガ関数 ───────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
-- 1. field_cases : 現場データ本体
-- =============================================================================
create table if not exists public.field_cases (
  id                  uuid primary key default gen_random_uuid(),

  -- 分類
  category            text not null,                 -- 例: 設備工事
  subcategory         text,                          -- 例: 給湯器
  manufacturer        text,                          -- 例: ノーリツ
  model_number        text,                          -- 例: GT-1634SAWS-TB
  manufactured_on     date,                          -- 製造年月（例: 2010-05-01。年月のみは月初で保持）

  -- 現場所見（全文検索対象）
  symptoms            text[]  not null default '{}', -- 症状（複数）
  cause               text,                          -- 原因
  diagnosis           text,                          -- 診断
  recommended_actions text[]  not null default '{}', -- 推奨対応（複数）
  emergency_action    text,                          -- 応急対応
  ai_judgment         text,                          -- AI判定
  risk                text,                          -- リスク

  -- メタ
  source              text not null default 'AI棟梁',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- 全文検索用の生成カラム ---------------------------------------------------
  -- 原因・症状・対応方法を中心に、検索したい本文を1本にまとめる（部分一致 pg_trgm 用）
  search_body text generated always as (
    public.array_to_text_imm(symptoms) || ' ' ||
    coalesce(cause, '')            || ' ' ||
    coalesce(diagnosis, '')        || ' ' ||
    public.array_to_text_imm(recommended_actions) || ' ' ||
    coalesce(emergency_action, '') || ' ' ||
    coalesce(ai_judgment, '')      || ' ' ||
    coalesce(risk, '')             || ' ' ||
    coalesce(manufacturer, '')     || ' ' ||
    coalesce(model_number, '')     || ' ' ||
    coalesce(subcategory, '')
  ) stored,

  -- 語トークン検索用（型式・エラー番号などの英数字トークンに有効）
  -- config は pg_catalog.simple とスキーマ修飾する（生成カラムの immutable 要件のため）
  search_vector tsvector generated always as (
    to_tsvector('pg_catalog.simple',
      public.array_to_text_imm(symptoms) || ' ' ||
      coalesce(cause, '')            || ' ' ||
      coalesce(diagnosis, '')        || ' ' ||
      public.array_to_text_imm(recommended_actions) || ' ' ||
      coalesce(emergency_action, '') || ' ' ||
      coalesce(risk, '')             || ' ' ||
      coalesce(model_number, '')
    )
  ) stored
);

-- インデックス（検索速度対策）--------------------------------------------------
create index if not exists idx_field_cases_search_body_trgm
  on public.field_cases using gin (search_body gin_trgm_ops);
create index if not exists idx_field_cases_search_vector
  on public.field_cases using gin (search_vector);
create index if not exists idx_field_cases_category
  on public.field_cases (category, subcategory);
create index if not exists idx_field_cases_model_number
  on public.field_cases (model_number);
create index if not exists idx_field_cases_manufacturer
  on public.field_cases (manufacturer);
create index if not exists idx_field_cases_created_at
  on public.field_cases (created_at desc);

drop trigger if exists trg_field_cases_updated_at on public.field_cases;
create trigger trg_field_cases_updated_at
  before update on public.field_cases
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 2. tags / field_case_tags : タグを別テーブルで正規化管理（将来 RAG 用）
-- =============================================================================
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);
create index if not exists idx_tags_name_trgm
  on public.tags using gin (name gin_trgm_ops);

create table if not exists public.field_case_tags (
  case_id  uuid not null references public.field_cases(id) on delete cascade,
  tag_id   uuid not null references public.tags(id)        on delete cascade,
  primary key (case_id, tag_id)
);
create index if not exists idx_field_case_tags_tag_id
  on public.field_case_tags (tag_id);
create index if not exists idx_field_case_tags_case_id
  on public.field_case_tags (case_id);

-- タグ名を渡すと、なければ作成し tag_id を返すヘルパ（upsert）--------------------
create or replace function public.upsert_tag(p_name text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.tags (name)
  values (p_name)
  on conflict (name) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end;
$$;

-- 現場データにタグ配列を紐付ける（マスタ upsert + 中間テーブル登録）------------
create or replace function public.attach_tags(p_case_id uuid, p_tags text[])
returns void
language plpgsql
as $$
declare
  v_tag text;
  v_tag_id uuid;
begin
  foreach v_tag in array coalesce(p_tags, '{}'::text[])
  loop
    v_tag := btrim(v_tag);
    continue when v_tag = '';
    v_tag_id := public.upsert_tag(v_tag);
    insert into public.field_case_tags (case_id, tag_id)
    values (p_case_id, v_tag_id)
    on conflict do nothing;
  end loop;
end;
$$;

-- =============================================================================
-- 3. field_case_photos : 画像（Storage の URL を紐付け）
-- =============================================================================
create table if not exists public.field_case_photos (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.field_cases(id) on delete cascade,
  storage_path text not null,           -- バケット内パス 例: {case_id}/1_label.jpg
  url          text not null,           -- 公開/署名 URL
  photo_tag    text,                    -- 写真タグ 例: 給湯器型式ラベル
  caption      text,                    -- 補足（例: エラー651表示）
  sort_order   int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists idx_field_case_photos_case_id
  on public.field_case_photos (case_id, sort_order);

-- =============================================================================
-- 4. decision_logs : 意思決定ログ（登録内容の監査証跡 / AI判定の記録）
-- =============================================================================
create table if not exists public.decision_logs (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid references public.field_cases(id) on delete set null,
  action      text not null,               -- 例: field_case_registered
  actor       text not null default 'AI棟梁',
  summary     text not null,               -- 例: [設備工事/給湯器] GT-1634SAWS-TB を登録
  detail      jsonb not null default '{}', -- 登録内容のスナップショット
  created_at  timestamptz not null default now()
);
create index if not exists idx_decision_logs_case_id
  on public.decision_logs (case_id);
create index if not exists idx_decision_logs_created_at
  on public.decision_logs (created_at desc);
create index if not exists idx_decision_logs_detail_gin
  on public.decision_logs using gin (detail);

-- =============================================================================
-- 5. search_field_cases : 全文検索 RPC（原因・症状・対応方法・タグを横断）
--    pg_trgm の類似度で並べ替えつつ、部分一致・タグ一致も拾う。
-- =============================================================================
create or replace function public.search_field_cases(
  p_query       text,
  p_category    text default null,
  p_subcategory text default null,
  p_limit       int  default 20,
  p_offset      int  default 0
)
returns table (
  id                  uuid,
  category            text,
  subcategory         text,
  manufacturer        text,
  model_number        text,
  manufactured_on     date,
  symptoms            text[],
  cause               text,
  diagnosis           text,
  recommended_actions text[],
  emergency_action    text,
  ai_judgment         text,
  risk                text,
  tags                text[],
  rank                real,
  created_at          timestamptz
)
language sql
stable
as $$
  with q as (
    select coalesce(nullif(btrim(p_query), ''), '') as term
  )
  select
    fc.id, fc.category, fc.subcategory, fc.manufacturer, fc.model_number,
    fc.manufactured_on, fc.symptoms, fc.cause, fc.diagnosis,
    fc.recommended_actions, fc.emergency_action, fc.ai_judgment, fc.risk,
    coalesce(
      (select array_agg(t.name order by t.name)
         from public.field_case_tags fct
         join public.tags t on t.id = fct.tag_id
        where fct.case_id = fc.id),
      '{}'
    ) as tags,
    case
      when q.term = '' then 0::real
      else greatest(
        word_similarity(q.term, fc.search_body),
        (case when fc.search_body ilike '%' || q.term || '%' then 1.0 else 0 end)::real,
        (case when exists (
            select 1 from public.field_case_tags fct
            join public.tags t on t.id = fct.tag_id
            where fct.case_id = fc.id and t.name ilike '%' || q.term || '%'
          ) then 0.9 else 0 end)::real
      )
    end as rank,
    fc.created_at
  from public.field_cases fc, q
  where
    (p_category    is null or fc.category    = p_category)
    and (p_subcategory is null or fc.subcategory = p_subcategory)
    and (
      q.term = ''
      or fc.search_body ilike '%' || q.term || '%'
      or fc.search_vector @@ plainto_tsquery('simple', q.term)
      or word_similarity(q.term, fc.search_body) > 0.3
      or exists (
        select 1 from public.field_case_tags fct
        join public.tags t on t.id = fct.tag_id
        where fct.case_id = fc.id and t.name ilike '%' || q.term || '%'
      )
    )
  order by rank desc, fc.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- =============================================================================
-- 6. Row Level Security（社内利用前提の最小ポリシー）
--    * anon には読み取りのみ許可（検索用途）
--    * 書き込みは authenticated / service_role（サーバ側）に限定
--    運用ポリシーに合わせて調整すること。
-- =============================================================================
alter table public.field_cases      enable row level security;
alter table public.tags             enable row level security;
alter table public.field_case_tags  enable row level security;
alter table public.field_case_photos enable row level security;
alter table public.decision_logs    enable row level security;

do $$
begin
  -- 読み取り（anon + authenticated）
  if not exists (select 1 from pg_policies where policyname = 'field_cases_read') then
    create policy field_cases_read on public.field_cases
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'tags_read') then
    create policy tags_read on public.tags
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'field_case_tags_read') then
    create policy field_case_tags_read on public.field_case_tags
      for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'field_case_photos_read') then
    create policy field_case_photos_read on public.field_case_photos
      for select to anon, authenticated using (true);
  end if;

  -- 書き込み（authenticated のみ。service_role は RLS をバイパスする）
  if not exists (select 1 from pg_policies where policyname = 'field_cases_write') then
    create policy field_cases_write on public.field_cases
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'tags_write') then
    create policy tags_write on public.tags
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'field_case_tags_write') then
    create policy field_case_tags_write on public.field_case_tags
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'field_case_photos_write') then
    create policy field_case_photos_write on public.field_case_photos
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'decision_logs_write') then
    create policy decision_logs_write on public.decision_logs
      for all to authenticated using (true) with check (true);
  end if;
end$$;

-- =============================================================================
-- 7. Storage バケット（画像保存先）
--    field-photos バケットを作成。公開/非公開は運用に合わせて変更する。
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'field_photos_read' and tablename = 'objects') then
    create policy field_photos_read on storage.objects
      for select to anon, authenticated using (bucket_id = 'field-photos');
  end if;
  if not exists (select 1 from pg_policies where policyname = 'field_photos_write' and tablename = 'objects') then
    create policy field_photos_write on storage.objects
      for insert to authenticated with check (bucket_id = 'field-photos');
  end if;
end$$;
