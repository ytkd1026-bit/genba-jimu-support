// 被害記録（DamageRecord）の型定義と保存ユーティリティ
// 現地調査時の問題・被害を「1被害1行」で管理する。
// 「確認した事実（confirmedFact）」と「推定原因（suspectedCause）」は必ず別項目。

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";

export const DAMAGE_RECORDS_KEY = "genba_damage_records_v1";

export type DamageRecord = {
  damageId: string;          // 例: D-001（案件内連番。削除しても再利用しない）
  projectId: string;
  location: string;          // 被害箇所
  damageCategory: string;    // 被害分類
  observedDamage: string;    // 目視確認した被害
  confirmedFact: string;     // 確認した事実
  suspectedCause: string;    // 推定原因
  requiredRestoration: string; // 必要な復旧工事
  caution: string;           // 注意事項
  relatedPhotoIds: string[];
  relatedWorkItemIds: string[];
  createdAt: string;
  updatedAt: string;
};

// ─── 保存ユーティリティ ───────────────────────────────────────
export const damageRecordsStore = createListStore<DamageRecord>(
  DAMAGE_RECORDS_KEY,
  (d) => d.damageId,
  (d) => d.projectId,
);

/** 案件内で一意な被害IDを発行する（例: D-001） */
export function issueDamageId(projectId: string): string {
  const existing = damageRecordsStore
    .getByProjectId(projectId)
    .map((d) => d.damageId);
  return issueRecordId("damage", projectId, existing);
}

/** 空の被害記録を作成する（保存はしない） */
export function createEmptyDamageRecord(
  projectId: string,
  damageId: string,
): DamageRecord {
  const now = new Date().toISOString();
  return {
    damageId,
    projectId,
    location: "",
    damageCategory: "",
    observedDamage: "",
    confirmedFact: "",
    suspectedCause: "",
    requiredRestoration: "",
    caution: "",
    relatedPhotoIds: [],
    relatedWorkItemIds: [],
    createdAt: now,
    updatedAt: now,
  };
}
