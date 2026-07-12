# 12. AI棟梁DB 構造案 Ver1.0

AI棟梁 運用規格 / 分類：AIT・JIMU / **版：Ver1.0** / 作成：2026-07-12
位置づけ：**内部設計（構造案のみ・実装なし）**。AI棟梁は未公開。UI/メニュー/β機能に出さない。
案件5000件以上の実データ蓄積と精度検証完了までは内部設計扱い。

## 目的

**チャット・案件・写真・資料・見積・請求を横断検索できる**共通DB構造を提案する。
ChatGPT / Claude / Notion / Google Drive / AI棟梁DB / 現場の事務サポ の6面で
同じキーとコード体系を使えるようにする。

> 根拠：既存のデータ型（src/app/utils/ 各ファイル）と ID 体系を土台にする。推測はしない。
> 未整備の共通項目は 07（データギャップ）を前提として明記する（🟡内部設計）。

---

## 1. 横断検索を成立させる「共通キー」

全テーブルが下記を持つことで横断検索・結合が可能になる。

| 共通キー | 意味 | 根拠 / 状態 |
|----------|------|-------------|
| `project_id` | 案件の主キー（例 REV-2026-0001） | ✅実装済（idGenerator.ts:11,59-64）。全記録が既に保持 |
| `record_id` | 案件内の記録ID（D/P/W/R/L-001） | ✅実装済（idGenerator.ts:67-80） |
| `category`（分類） | REVO/JIMU/AIT/KNOW | ✅規格化済（08） |
| `case_tags`（案件分類） | 種別/保険種別/建物/工種/内容/材料 | ✅規格化済（10）※一部🟡内部設計 |
| `photo_category` | 写真区分（9分類） | ✅規格化済（11）※一部🟡内部設計 |
| `id`（グローバル一意ID/UUID） | 端末横断の一意キー | 🟡内部設計（07 A-1：現状は端末ローカル採番） |
| `tenant_id`（事業者ID） | マルチテナント境界 | 🟡内部設計（07 A-2） |
| `created_at`（ISO8601） | 生成日時（TZ付き） | 🟡一部不統一（07 A-4：ISOとロケール混在） |
| `tags[]` | 自由タグ（横断の緩い結合） | 🟡内部設計 |

> 横断検索は「`project_id` による厳密結合」＋「`category` / `*_tags` によるファセット絞り込み」
> ＋「全文検索（title/本文/説明）」の3層で構成する。

---

## 2. テーブル構造案（既存データ型を根拠に）

### 2-1. entities（横断の親・検索の入口）
6種の情報を1つの検索面に載せるための共通ビュー（物理1表 or ビュー）。

| カラム | 例 | 由来 |
|--------|-----|------|
| `entity_type` | chat / project / photo / document / estimate / invoice | 本規格 |
| `entity_id` | REV-2026-0001 / P-003 / EST-01 | 既存ID体系 |
| `project_id` | REV-2026-0001 | ✅ |
| `title` | 表示名・チャット名 | 各データ |
| `category` | REVO/JIMU/AIT/KNOW | 08 |
| `tags` | 案件分類・写真区分・自由タグ | 10/11 |
| `created_at` / `updated_at` | ISO8601 | 🟡07 A-4 |
| `tenant_id` / `id(uuid)` | 事業者 / 一意 | 🟡07 A-1,A-2 |

### 2-2. chats（ChatGPT / Claude 会話）
| カラム | 由来 |
|--------|------|
| chat_name, category(REVO/JIMU/AIT/KNOW), priority(S/A/B/C/X), status(IDEA…ARCHIVE), reason | ✅規格 08（CSV5列） |
| project_id?（案件に紐づく会話のみ） | 08 の将来拡張 |

### 2-3. projects（案件）
既存 `Project`（projects.ts:37-51）を土台に、10 の軸カラムを追加。
| カラム | 根拠 |
|--------|------|
| projectId, projectName, siteAddress, customerName, clientName, projectType, buildingType, status, createdAt, updatedAt | ✅実装済（projects.ts:37-51） |
| insuranceType（火災/水漏れ/風災/雪害/落雷/その他） | 🟡10 軸2（fire/water_leak/wind は insuranceInfo.ts:9-14 に既存、雪害/落雷は内部設計） |
| koujiTypes[], koujiContents[], materialTags[] | 🟡10 軸4-6（工種/内容は new/page.tsx:38-55 に既存、材料は内部設計） |
| customer_id（顧客FK） | 🟡07 B-1 |

### 2-4. photos（写真台帳）
既存 `PhotoRecord`（photoRecords.ts:22-35）を土台に、11 の区分を採用。
| カラム | 根拠 |
|--------|------|
| photoId, projectId, damageId?, location, description, capturedAt, createdAt | ✅実装済（photoRecords.ts:22-35） |
| photo_category（9分類：施工前…安全） | 🟡11（before/during/after/cause は既存、defect/measure/material/tool/safety は内部設計） |
| storage_key / url（クラウド保存） | 🟡07 B-3（現状 base64 を localStorage 保持） |
| exif（撮影日時/GPS/機種） | 🟡07 B-3 |

### 2-5. documents（資料）
Google Drive / Notion の資料を横断に載せる。
| カラム | 由来 |
|--------|------|
| doc_name（分類-日付-内容-v版数）, category, project_id?, drive_url/notion_id, version | ✅命名規則 02/08、🟡外部連携 |

### 2-6. estimates（見積） / invoices（請求）
既存 `SavedEstimate`（savedEstimates.ts:33-59）/ `SavedInvoice`（savedInvoices.ts:9-30）を土台。
| カラム | 根拠 |
|--------|------|
| estimateNo/invoiceNo（REV-…-EST-01 / -INV-01）, projectId, total, taxBreakdown, lineSnapshots, version | ✅実装済（workItemEstimate.ts:147-160、savedEstimates/savedInvoices） |
| 入金実績（paidDate/paidAmount） | 🟡07 B-5 |

---

## 3. 横断検索のクエリ例（論理）

- **案件を軸にした全体像**：`WHERE project_id = 'REV-2026-0001'`
  → その案件のチャット・写真・見積・請求・資料・作業報告を一覧（`project_id` 厳密結合）。
- **保険×水漏れの写真から原因分析**：
  `entity_type='photo' AND case_tags @> '保険種別:水漏れ' AND photo_category='cause'`。
- **安全写真の横断収集（AI棟梁 安全管理）**：`photo_category='safety'`（全案件横断）。
- **REVO かつ 今週（S）かつ 進行中**：`category='REVO' AND priority='S' AND status='DOING'`。
- **材料=クロスの単価学習**：`case_tags @> '材料:クロス'` の見積 lineSnapshots を集約。

---

## 4. 実装状況・前提・将来

- 本ドキュメントは**構造案のみ**。DB・コードは作成していない。
- 実装の前提（07 の最優先ギャップ）：
  1. UUID化（A-1）／2. tenant_id（A-2）／3. 写真クラウド保存キー（B-3）／
  4. 日時ISO統一（A-4）／5. 同期メタ（A-6）。
- 段階：Phase2（共通DB移行）で 2.3/2.4 を実装 → Phase4以降で AI棟梁の横断検索を内部評価。
- **AI棟梁は未公開**。横断検索・安全分析・ノウハウ抽出は
  案件5000件・精度検証完了まで内部設計扱いとし、UI/メニュー/β機能に出さない（06・ロードマップ）。
