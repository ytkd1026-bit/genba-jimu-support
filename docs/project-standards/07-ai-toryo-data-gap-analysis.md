# 07. AI棟梁 連携データ ギャップ分析

AI棟梁 運用規格 Ver1.0 / 分類：AIT・JIMU / 版：v1.0 / 作成：2026-07-12

将来、案件・顧客・写真台帳・見積・請求・作業報告が**共通DB**へ保存され、
AI棟梁（施工ノウハウ・現場DB・見積提案）が参照する前提で、
**現在の事務サポのデータ構造に不足している項目**を、実コードを調査して洗い出した。

> 調査対象：`src/app/utils/` の各データ型（projects / customers / photoRecords /
> savedEstimates / savedInvoices / workReports / workItems / insuranceInfo /
> damageRecords / projectLogs / learningRecords / idGenerator）。
>
> 本ドキュメントは**設計上の指針**であり、今回コードは変更していない。
> 実装は Phase2（共通DB移行）以降に、優先度に沿って行う。

---

## A. 全エンティティ横断の構造的ギャップ（最重要）

| # | 不足項目 | 現状 | 影響 | 優先度 |
|---|----------|------|------|--------|
| A-1 | **グローバル一意ID（UUID）** | ID は端末ローカルの localStorage カウンタ採番（`REV-2026-0001`、`W-001` 等の案件内連番）。`idGenerator.ts` に「Supabase移行時はDB採番/UUIDへ」と TODO 明記。 | 複数端末・職人30人で**ID衝突**。共通DBに集約できない。 | **S** |
| A-2 | **tenantId / companyId（事業者ID）** | どのエンティティにも所有者・事業者の概念がない（単一利用者前提）。 | 職人30人・元請機能（複数事業者）で**データが混ざる**。 | **S** |
| A-3 | **userId（作成者・更新者）** | 誰が作成/更新したか記録がない。作業報告の `workerName` は自由文字列で ID 参照でない。 | 権限・監査・「誰の入力か」が追えない。 | **A** |
| A-4 | **日時形式の不統一** | 新エンティティ（projects/workItems/workReports）は ISO(`toISOString`)。一方 `customers.createdAt` や旧 savedProjects は `toLocaleString("ja-JP")` のロケール文字列。 | 共通DB移行時に**日付パース不能・ソート不能**。タイムゾーン欠落。 | **A** |
| A-5 | **論理削除（deletedAt）・監査ログ** | 物理削除のみ。変更履歴なし（`projectHistory.ts` は一部のみ）。 | 誤削除の復旧不可。同期の競合解決ができない。 | **B** |
| A-6 | **同期メタ（version/updatedAt による楽観ロック・syncStatus）** | 一部に `updatedAt` はあるが、競合検出・同期状態の管理はない。 | 複数端末同時編集で**上書き事故**。 | **A** |

---

## B. エンティティ別の不足項目

### B-1. 案件 Project（`projects.ts`）
現状：`projectId / projectName / propertyName / roomNumber / siteAddress /
customerName / clientName / submitTo / projectType / buildingType / status /
createdAt / updatedAt`

| 不足項目 | 理由（AI棟梁／共通DB観点） | 優先度 |
|----------|------------------------------|--------|
| **customerId（顧客への外部キー）** | 現状 `clientName`/`customerName` は**文字列**で顧客マスタと紐づかない。名寄せ不能。 | **A** |
| **工事種別・工事内容（構造化）** | 新 Project 型に工事種別/内容/規模が**無い**（旧 savedProjects 側のみ）。AI棟梁の施工ノウハウ照合に必須。 | **A** |
| **緯度経度（geo lat/lng）** | 住所は文字列のみ。現場DB・エリア分析・距離最適化に使えない。 | **B** |
| **受注/完工/入金 日付、契約金額** | 進捗は status のみ。日付・金額の実績が案件本体にない。 | **B** |
| **元請/下請区分・発注先ID** | 元請機能（Phase3）で必要。 | **C** |

### B-2. 顧客 Customer（`customers.ts`）
現状：`id / name / contactName / tel / email / address / memo / createdAt`

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **updatedAt** | 更新日時がない（createdAt のみ）。同期・履歴に必要。 | **A** |
| **法人番号 / インボイス登録番号** | 取引先の一意識別・適格請求書対応。 | **B** |
| **支払条件（締日・支払日・手数料負担）** | 請求・入金管理、AI の資金繰り支援に必要。 | **B** |
| **顧客区分（元請/施主/保険/管理会社）** | 案件分類・AI提案の文脈に必要。 | **B** |
| **createdAt が ja-JP ロケール文字列** | A-4 の個別事例。ISO へ統一が必要。 | **A** |

### B-3. 写真台帳 PhotoRecord（`photoRecords.ts`）
現状：`photoId / projectId / damageId? / phase / location / description /
fileName / imageDataUrl? / capturedAt / createdAt / sortOrder?`

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **クラウド保存キー（objectKey/URL）** | 画像が **base64 を localStorage** に保持（`imageCompress.ts`/`photoRecords.ts` に容量 TODO）。共通DB＝オブジェクトストレージ前提へ移行が必要。AI 学習の現場写真DBの土台。 | **S** |
| **EXIF（撮影日時・機種・GPS）** | `capturedAt` は手入力想定。撮影メタがないと真正性・位置が担保できない。 | **B** |
| **画像ハッシュ・mime・サイズ** | 重複排除・整合性・AI 前処理に必要。 | **B** |
| **AI 用ラベル（部位・劣化種別・タグ）** | AI棟梁の教師データ化に必要（※UI 露出は公開まで禁止）。 | **C** |

### B-4. 工事項目 WorkItem（`workItems.ts`）
現状：売価（`sellingUnitPrice/sellingAmount`）＋原価（材料/労務/外注/諸経費/その他/合計）
＋粗利/粗利率＋税区分/税率＋`relatedDamageIds/relatedPhotoIds`。**原価・粗利まで持つ点は AI 単価学習に有利。**

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **単価マスタID（REVO 単価表への参照）** | 単価が案件ごとの手入力。標準単価マスタ（REVO）が無く、AI の見積提案の基準が作れない。 | **A** |
| **材料マスタID・歩掛（数量原単位）** | 数量→材料・手間の換算根拠がない。AI の数量→見積自動化に必須。 | **B** |
| **工種コード（標準分類）** | `category` は自由文字列。横断集計・AI照合には標準コードが要る。 | **B** |

### B-5. 見積 SavedEstimate / 請求 SavedInvoice（`savedEstimates.ts` / `savedInvoices.ts`）
現状：版管理（version/previousEstimateId/revisionReason）・スナップショット・税内訳を保持。**帳票の固定化は良好。**

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **入金実績（入金日・入金額・消込）** | 請求は発行までで、入金管理が未整備。AI の資金繰り・与信に必要。 | **A** |
| **提出/承認の日時・相手** | 提出先・承認履歴が構造化されていない。 | **B** |
| **PDF 実体への参照（保存URL）** | 発行 PDF の保管先参照がない（都度生成）。 | **C** |

### B-6. 作業報告 WorkReport（`workReports.ts`）
現状：作業日/作業者名/作業内容/完了/残/問題/原因/対応/顧客確認/関連写真。

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **作業者ID（userId 参照）** | `workerName` が自由文字列。職人30人で本人特定・集計不可。 | **A** |
| **工数（人工・作業時間・入退場時刻）** | 生産性・原価精度・AI の歩掛学習に必須。 | **B** |
| **天候・気温** | 工程遅延要因の分析に有用。 | **C** |

### B-7. 保険情報 InsuranceInfo（`insuranceInfo.ts`）
現状：事故種別/保険会社/商品/請求番号/担当/事故日/発見日/調査日/推定原因/承認状態/承認額。

| 不足項目 | 理由 | 優先度 |
|----------|------|--------|
| **createdAt / updatedAt** | 日時メタが無い。同期・履歴に必要。 | **A** |
| **保険会社マスタID・証券番号** | 会社名が文字列。名寄せ・保険修繕（REVO）の集計に必要。 | **B** |
| **申請額・査定内訳（項目別）** | 承認額は単一数値のみ。差額分析ができない。 | **B** |

---

## C. まとめ：最優先で埋めるべきギャップ（Phase2 移行の前提）

1. **A-1 グローバル一意ID（UUID）** … 端末ローカル採番の撤廃（S）
2. **A-2 tenantId／事業者ID** … マルチテナントの基盤（S）
3. **B-3 写真のクラウド保存キー** … base64/localStorage からの脱却（S）
4. **A-4 日時形式を ISO に統一**（顧客・旧データ含む）（A）
5. **A-6 同期メタ（楽観ロック）** … 複数端末の上書き事故防止（A）
6. **B-1 customerId FK・工事種別の構造化**（A）
7. **B-4 単価マスタID（REVO 単価表）** … AI 見積提案の基準（A）
8. **B-5 入金実績**・**B-6 作業者ID/工数**（A）

これらは **AI棟梁を公開するためではなく、共通DB移行（Phase2）と
データ品質確保のために先行して必要**。AI棟梁の機能・UI は
案件5000件・精度検証合格まで露出しない（06・ロードマップ参照）。
