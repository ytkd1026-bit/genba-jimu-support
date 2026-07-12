# 09. チャット分類規格 変更履歴（Changelog）

対象：[08-chat-classification-rule.md](./08-chat-classification-rule.md)
形式：新しい版を上に追記する。コード値の変更は必ずここに記録する。

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
