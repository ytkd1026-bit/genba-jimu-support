// 案件ログ（ProjectLog）の型定義と保存ユーティリティ
// 保険会社・元請・施主・管理会社などとのやり取りを時系列で記録する。

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";

export const PROJECT_LOGS_KEY = "genba_project_logs_v1";

export type LogPartyType =
  | "customer"
  | "general_contractor"
  | "insurance_company"
  | "management_company"
  | "supplier"
  | "subcontractor"
  | "other";

export type ContactMethod =
  | "phone"
  | "email"
  | "line"
  | "meeting"
  | "site"
  | "other";

export type ProjectLog = {
  logId: string;          // 例: L-001（案件内連番）
  projectId: string;
  date: string;           // やり取りの日付
  partyType: LogPartyType;
  partyName: string;      // 相手先名
  contactMethod: ContactMethod;
  content: string;        // 内容
  result: string;         // 結果
  nextAction: string;     // 次にやること
  createdAt: string;
};

// ─── 画面表示用の日本語ラベル ─────────────────────────────────
export const PARTY_TYPE_LABELS: Record<LogPartyType, string> = {
  customer:           "施主・顧客",
  general_contractor: "元請",
  insurance_company:  "保険会社",
  management_company: "管理会社",
  supplier:           "材料商社・仕入先",
  subcontractor:      "協力業者・外注",
  other:              "その他",
};

export const CONTACT_METHOD_LABELS: Record<ContactMethod, string> = {
  phone:   "電話",
  email:   "メール",
  line:    "LINE",
  meeting: "打合せ",
  site:    "現場",
  other:   "その他",
};

// ─── 保存ユーティリティ ───────────────────────────────────────
export const projectLogsStore = createListStore<ProjectLog>(
  PROJECT_LOGS_KEY,
  (l) => l.logId,
  (l) => l.projectId,
);

/** 案件内で一意なログIDを発行する（例: L-001） */
export function issueProjectLogId(projectId: string): string {
  const existing = projectLogsStore
    .getByProjectId(projectId)
    .map((l) => l.logId);
  return issueRecordId("projectLog", projectId, existing);
}

/** 空の案件ログを作成する（保存はしない） */
export function createEmptyProjectLog(
  projectId: string,
  logId: string,
): ProjectLog {
  return {
    logId,
    projectId,
    date: "",
    partyType: "customer",
    partyName: "",
    contactMethod: "phone",
    content: "",
    result: "",
    nextAction: "",
    createdAt: new Date().toISOString(),
  };
}
