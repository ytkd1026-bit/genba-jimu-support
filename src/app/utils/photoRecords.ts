// 写真記録（PhotoRecord）の型定義と保存ユーティリティ
// 写真番号（photoId）は一度発行したら変更しない。削除しても番号を詰め直さない。
//
// 注意: imageDataUrl を localStorage に保存するため容量（約5MB）に上限がある。
// 保存前に画面側で圧縮すること。upsert が false を返した場合は容量超過の可能性が高い。
// TODO: 保存容量が問題になる場合は IndexedDB への移行を検討する（フェーズ4以降）。

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";

export const PHOTO_RECORDS_KEY = "genba_photo_records_v1";

export type PhotoPhase =
  | "survey"    // 現調
  | "before"    // 施工前
  | "during"    // 施工中
  | "after"     // 完了
  | "cause"     // 原因箇所
  | "dimension" // 寸法
  | "other";    // その他

export type PhotoRecord = {
  photoId: string;        // 例: P-001（案件内連番。削除しても再利用しない）
  projectId: string;
  damageId?: string;      // 紐づく被害ID（任意）
  phase: PhotoPhase;      // 撮影区分
  location: string;       // 撮影場所
  description: string;    // 説明
  fileName: string;
  imageDataUrl?: string;  // 圧縮済みの画像データURL
  capturedAt: string;     // 撮影日
  createdAt: string;
  /** 写真台帳での表示順（photoId は変更しないため並び替えはこの値で行う） */
  sortOrder?: number;
};

// ─── 画面表示用の日本語ラベル ─────────────────────────────────
export const PHOTO_PHASE_LABELS: Record<PhotoPhase, string> = {
  survey:    "現調",
  before:    "施工前",
  during:    "施工中",
  after:     "完了",
  cause:     "原因箇所",
  dimension: "寸法",
  other:     "その他",
};

// ─── 保存ユーティリティ ───────────────────────────────────────
export const photoRecordsStore = createListStore<PhotoRecord>(
  PHOTO_RECORDS_KEY,
  (p) => p.photoId,
  (p) => p.projectId,
);

/** 案件内で一意な写真IDを発行する（例: P-001。削除済み番号は再利用しない） */
export function issuePhotoId(projectId: string): string {
  const existing = photoRecordsStore
    .getByProjectId(projectId)
    .map((p) => p.photoId);
  return issueRecordId("photo", projectId, existing);
}

/** 案件の写真を表示順（sortOrder → photoId）で取得する */
export function getPhotosSorted(projectId: string): PhotoRecord[] {
  return photoRecordsStore
    .getByProjectId(projectId)
    .slice()
    .sort((a, b) => {
      const ao = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bo = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.photoId.localeCompare(b.photoId);
    });
}
