// 作業報告（WorkReport）の型定義と保存ユーティリティ

import { createListStore } from "./listStore";
import { issueRecordId } from "./idGenerator";

export const WORK_REPORTS_KEY = "genba_work_reports_v1";

export type WorkReport = {
  reportId: string;             // 例: R-001（案件内連番）
  projectId: string;
  workDate: string;             // 作業日
  workerName: string;           // 作業者
  workSummary: string;          // 作業内容
  completedWork: string;        // 完了内容
  remainingWork: string;        // 残作業
  issue: string;                // 問題
  cause: string;                // 原因
  actionTaken: string;          // 対応
  customerConfirmation: string; // 顧客確認事項
  relatedPhotoIds: string[];
  createdAt: string;
  updatedAt: string;
};

// ─── 保存ユーティリティ ───────────────────────────────────────
export const workReportsStore = createListStore<WorkReport>(
  WORK_REPORTS_KEY,
  (r) => r.reportId,
  (r) => r.projectId,
);

/** 案件内で一意な作業報告IDを発行する（例: R-001） */
export function issueWorkReportId(projectId: string): string {
  const existing = workReportsStore
    .getByProjectId(projectId)
    .map((r) => r.reportId);
  return issueRecordId("workReport", projectId, existing);
}

/** 空の作業報告を作成する（保存はしない） */
export function createEmptyWorkReport(
  projectId: string,
  reportId: string,
): WorkReport {
  const now = new Date().toISOString();
  return {
    reportId,
    projectId,
    workDate: "",
    workerName: "",
    workSummary: "",
    completedWork: "",
    remainingWork: "",
    issue: "",
    cause: "",
    actionTaken: "",
    customerConfirmation: "",
    relatedPhotoIds: [],
    createdAt: now,
    updatedAt: now,
  };
}
