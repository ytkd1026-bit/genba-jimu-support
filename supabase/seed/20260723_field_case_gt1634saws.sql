-- =============================================================================
-- 現場データ登録サンプル（今回の現場情報）
--   カテゴリ: 設備工事 / 給湯器 / ノーリツ GT-1634SAWS-TB
--
-- 20260723090000_field_cases.sql 適用後に実行する。
-- SQL からの登録手順のリファレンス。アプリからは /api/field-cases/register を使う。
-- 何度流しても重複しないよう固定 UUID を使う。
-- =============================================================================

do $$
declare
  v_case_id uuid := '11111111-1111-4111-8111-111111111111';
begin
  -- 既存があれば作り直す（冪等）
  delete from public.field_cases where id = v_case_id;

  -- 1. 本体 -----------------------------------------------------------------
  insert into public.field_cases (
    id, category, subcategory, manufacturer, model_number, manufactured_on,
    symptoms, cause, diagnosis, recommended_actions, emergency_action,
    ai_judgment, risk, source
  ) values (
    v_case_id,
    '設備工事', '給湯器', 'ノーリツ', 'GT-1634SAWS-TB', '2010-05-01',
    array['浴槽自動湯はり不良', 'エラー651', '水栓ハンドル漏水', '吐水パイプ漏水'],
    '経年劣化',
    '水量サーボ不良',
    array['給湯器本体交換', 'マルチリモコン交換', '循環アダプター交換', '水栓パッキン交換'],
    '電装基板交換',
    '修理より本体交換推奨',
    '16年経過機のため他部品故障リスク大',
    'AI棟梁'
  );

  -- 2. タグを別テーブルへ正規化登録 -----------------------------------------
  perform public.attach_tags(v_case_id, array[
    '給湯器', 'ノーリツ', 'GT-1634SAWS-TB', 'エラー651', '水量サーボ',
    '自動湯はり', '浴室リモコン', '循環アダプター', '水漏れ', 'パッキン交換',
    '設備工事', 'AI棟梁'
  ]);

  -- 3. 写真（Storage アップロード後に URL を差し替える）----------------------
  --    ここでは写真タグとパスの雛形のみ登録。実運用では
  --    /api/field-cases/register 経由でアップロードした URL が入る。
  insert into public.field_case_photos (case_id, storage_path, url, photo_tag, caption, sort_order)
  values
    (v_case_id, v_case_id || '/1_label.jpg',    'https://REPLACE/1_label.jpg',    '給湯器型式ラベル',   null,          0),
    (v_case_id, v_case_id || '/2_remote.jpg',   'https://REPLACE/2_remote.jpg',   '浴室リモコン',       'エラー651表示', 1),
    (v_case_id, v_case_id || '/3_adapter.jpg',  'https://REPLACE/3_adapter.jpg',  '循環アダプター',     null,          2),
    (v_case_id, v_case_id || '/4_bathroom.jpg', 'https://REPLACE/4_bathroom.jpg', '浴室全景',           '水栓漏水',      3),
    (v_case_id, v_case_id || '/5_estimate.jpg', 'https://REPLACE/5_estimate.jpg', '交換見積書',         null,          4);

  -- 4. Decision Log へ登録内容を出力 ----------------------------------------
  insert into public.decision_logs (case_id, action, actor, summary, detail)
  values (
    v_case_id,
    'field_case_registered',
    'AI棟梁',
    '[設備工事/給湯器] GT-1634SAWS-TB を登録',
    jsonb_build_object(
      'category', '設備工事',
      'subcategory', '給湯器',
      'manufacturer', 'ノーリツ',
      'model_number', 'GT-1634SAWS-TB',
      'manufactured_on', '2010-05',
      'symptoms', jsonb_build_array('浴槽自動湯はり不良', 'エラー651', '水栓ハンドル漏水', '吐水パイプ漏水'),
      'cause', '経年劣化',
      'diagnosis', '水量サーボ不良',
      'recommended_actions', jsonb_build_array('給湯器本体交換', 'マルチリモコン交換', '循環アダプター交換', '水栓パッキン交換'),
      'emergency_action', '電装基板交換',
      'ai_judgment', '修理より本体交換推奨',
      'risk', '16年経過機のため他部品故障リスク大',
      'tags', jsonb_build_array('給湯器','ノーリツ','GT-1634SAWS-TB','エラー651','水量サーボ','自動湯はり','浴室リモコン','循環アダプター','水漏れ','パッキン交換','設備工事','AI棟梁'),
      'photos', jsonb_build_array(
        jsonb_build_object('photo_tag','給湯器型式ラベル'),
        jsonb_build_object('photo_tag','浴室リモコン','caption','エラー651表示'),
        jsonb_build_object('photo_tag','循環アダプター'),
        jsonb_build_object('photo_tag','浴室全景','caption','水栓漏水'),
        jsonb_build_object('photo_tag','交換見積書')
      )
    )
  );
end$$;

-- 確認用クエリ ----------------------------------------------------------------
-- select * from public.search_field_cases('エラー651');
-- select summary, detail from public.decision_logs order by created_at desc limit 1;
