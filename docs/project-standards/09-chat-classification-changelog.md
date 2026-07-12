# 09. 情報管理標準 変更履歴（Changelog）

対象：08（チャット分類）/ 10（案件分類）/ 11（写真分類）/ 12（AI棟梁DB構造案）。
形式：新しい版を上に追記する。コード値の変更は必ずここに記録する。

---

## 2026-07-12 — チャット規格Ver1.1 最終レビュー ＋ 案件/写真/DB規格 新規制定

### A. チャット分類規格 Ver1.1 最終レビュー結果（矛盾チェック）
- 分類4（REVO/JIMU/AIT/KNOW）・優先度5（S/A/B/C/X）・状態7（IDEA/TODO/DOING/WAIT/HOLD/DONE/ARCHIVE）
  の**内部矛盾なし**を確認。
  - 優先度（＝いつ着手／時間軸）と状態（＝進行状況）は2軸独立。`C=保留(時期未定)` と
    `HOLD/WAIT(進行上の保留)` は別軸のため衝突しない。
  - `X=破棄`（優先度）と `ARCHIVE`（状態＝保管/凍結）は意味が異なり両立可
    （破棄と決めて保管、等）。重複定義なし。
  - 分類の強さ順 `JIMU＞REVO＞AIT＞KNOW` と KNOW の受け皿定義に抜け・重複なし。
- **判定：Ver1.1 は矛盾なし。規格値・CSV列の変更は不要**（本レビューでコード修正なし）。

### B. 案件分類規格 Ver1.0 新規（10-project-classification-rule.md）
- 多軸構成：種別 / 保険種別 / 建物 / 工種 / 工事内容 / 材料・仕上げ。
- 既存コードを根拠に採用（種別 projects.ts:54、建物 projects.ts:59、工種/内容 new/page.tsx:38-55、
  保険種別 insuranceInfo.ts:9-14）。
- **今回追加**：保険種別軸（火災/水漏れ/風災は既存、**雪害・落雷**は🟡内部設計）、
  工種「メンテナンス」、材料軸（クロス/CF/FT/長尺/シート/カーテン/ブラインド＝🟡内部設計）。

### C. 写真分類規格 Ver1.0 新規（11-photo-classification-rule.md）
- 9分類：施工前/施工中/施工後/不具合/原因/対策/材料/工具/**安全**。
- 既存 `PHOTO_PHASE_LABELS`（photoRecords.ts:38-46）を根拠に採用（before/during/after/cause）。
- **今回追加**：`safety(安全)`（AI棟梁の安全管理・KY・脚立・足場・危険箇所分析用）。
  defect/measure/material/tool/safety は🟡内部設計（既存 enum に無い）。

### D. AI棟梁DB 構造案 Ver1.0 新規（12-ai-toryo-db-structure.md）
- チャット/案件/写真/資料/見積/請求を `project_id` 厳密結合＋分類ファセット＋全文検索で横断。
- 既存データ型・ID体系（idGenerator.ts:11,67-80 ほか）を根拠に構造案化。
- 実装前提として 07 の最優先ギャップ（UUID/tenant_id/写真クラウド保存/日時ISO/同期メタ）を明記。

### 共通
- すべて**ドキュメントのみ・実装なし**。アプリのコード・enum は不変。
- AI棟梁は未公開。UI/メニュー/β機能に出さない。案件5000件・精度検証完了まで内部設計扱い。

---

## Ver1.1 — 2026-07-12

### 概要
分類を4分類化（KNOW 追加）、状態を7状態化、優先度を「時間軸」で再定義。
共通利用ツールに Claude を明記し、ChatGPT / Claude / Notion / Google Drive の
4ツール共通前提へ更新。

### 変更点

#### 1. 分類：3 → 4（**KNOW** 追加）
| Ver1.0 | Ver1.1 |
|--------|--------|
| JIMU / REVO / AIT | JIMU / REVO / AIT / **KNOW** |

- **KNOW（共通ナレッジ）** を新設：特定事業（JIMU/REVO/AIT）に属さない
  汎用知識・ツール活用・調べ物（例：Notion/Gitの使い方、AI活用術、一般調査）。
- 分類の強さ順を更新：`JIMU ＞ REVO ＞ AIT ＞ KNOW`。
- 判定材料が乏しい単発は、Ver1.0の「JIMU/C」から **「KNOW/C/IDEA」** へ既定変更。

#### 2. 状態：4 → 7
| Ver1.0 | Ver1.1 |
|--------|--------|
| TODO / DOING / HOLD / DONE | **IDEA** / TODO / DOING / **WAIT** / HOLD / DONE / **ARCHIVE** |

- 追加：**IDEA**（構想の種）／**WAIT**（他者・外部待ち）／**ARCHIVE**（長期保管・凍結）。
- 区別を明文化：**WAIT＝外部待ち** と **HOLD＝自分都合の保留**、
  **DONE＝完了直後** と **ARCHIVE＝長期保管/凍結**。
- 遷移図を更新：`IDEA → TODO → DOING → DONE → ARCHIVE`（WAIT/HOLD は DOING と往復）。

#### 3. 優先度：定義を「時間軸」で明確化（コードは S/A/B/C/X 据え置き）
| コード | Ver1.0 の意味 | Ver1.1 の定義（時間軸） |
|--------|----------------|--------------------------|
| S | 最優先 | **今週** |
| A | 高 | **今月** |
| B | 中 | **今年** |
| C | 低 | **保留（時期未定）** |
| X | 廃止候補 | **破棄（やらない）** |

- 優先度＝「いつ着手するか」、状態＝「進行状況」の**2軸独立**を明記。

#### 4. 共通利用ツール
- Ver1.0：ChatGPTワーク / Notion / Google Drive / AI棟梁DB を「将来対応」として記載。
- Ver1.1：**ChatGPT / Claude / Notion / Google Drive** の4ツール共通利用を前提に本文化。
  Claude を明記。AI棟梁DB は引き続き将来拡張（末尾カラム追加）として維持。

#### 5. CSV仕様
- 列構成は**不変**：`チャット名, 分類, 優先度, 状態, 理由`（後方互換を維持）。
- 使用できるコード値のみ Ver1.1 定義へ更新（分類4・状態7）。
- サンプル（`verification/project-standardization/06-chat-classification-example.csv`）を
  KNOW・新状態（IDEA/WAIT/ARCHIVE）・時間軸優先度を含む内容へ更新（27件）。

### 互換性・移行メモ
- **列は変わらないため、Ver1.0で作ったCSVはそのまま読める**（値の意味だけ更新）。
- Ver1.0の状態を Ver1.1へ移す目安：
  - `HOLD` のうち「相手待ち」だったものは **WAIT** へ見直し。
  - 完了して長期保管に回すものは `DONE` → **ARCHIVE**。
  - `X（廃止候補）` で保管に回すものは状態 **ARCHIVE** を併用。
- Ver1.0で「JIMU/C」に退避していた汎用の調べ物は **KNOW** へ再分類。

---

## Ver1.0 — 2026-07-12（初版）

- 分類3：JIMU / REVO / AIT。
- 状態4：TODO / DOING / HOLD / DONE。
- 優先度：S/A/B/C/X（最優先〜廃止候補）。
- チャット命名 `分類-YYYYMMDD-内容`、ファイル命名 `分類-日付-内容-v版数`。
- CSV仕様 `チャット名, 分類, 優先度, 状態, 理由`。
- 将来対応：ChatGPTワーク / Notion / Google Drive / AI棟梁DB。
- サンプルCSV 25件。
