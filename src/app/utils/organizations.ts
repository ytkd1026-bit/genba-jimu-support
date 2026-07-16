// 組織（所属会社）ユーティリティ
//
// 将来は「1社に複数ユーザー（代表・事務・職人）」が所属し、案件・見積・請求・
// 材料発注・学び記録はユーザー個人ではなく組織に紐付く。
// 現段階（ログイン無し・端末内利用）では「この端末＝1組織」として、
// 端末ごとに一意な organizationId（UUID）を1つ発行して永続化する。
// Supabase 移行時はこのIDを organizations テーブルの行として持ち込み、
// users テーブル側に organizationId を持たせるだけで多人数化できる。
//
// 推奨構造（移行後）:
//   organization ─ users / projects / estimates / invoices / materialOrders / learningRecords

const ORGANIZATION_KEY = "genba_organization_v1";

export type OrganizationRecord = {
  organizationId: string; // UUID（真の主キー。表示用ではない）
  createdAt: string;
};

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 古い環境向けフォールバック（v4形式）
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** UUID を発行する（案件の内部IDなどにも使う共通関数） */
export function issueUuid(): string {
  return generateUuid();
}

/**
 * この端末の組織IDを取得する（無ければ発行して保存）。
 * SSR中（window無し）は空文字を返す。クライアントでのみ確定させること。
 */
export function getOrCreateOrganizationId(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = localStorage.getItem(ORGANIZATION_KEY);
    if (raw) {
      const rec = JSON.parse(raw) as OrganizationRecord;
      if (rec.organizationId) return rec.organizationId;
    }
  } catch {
    // 破損時は再発行する（案件側に保存済みの organizationId は変更されない）
  }
  const rec: OrganizationRecord = {
    organizationId: generateUuid(),
    createdAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(ORGANIZATION_KEY, JSON.stringify(rec));
  } catch {
    // 保存できなくても発行値を返す（次回は再発行になるが案件側の値は不変）
  }
  return rec.organizationId;
}
