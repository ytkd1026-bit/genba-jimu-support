// 学び・振り返り（LearningRecord）の型定義と保存ユーティリティ
// 完工後に記録する「AI棟梁」用の現場知見データ。1案件につき1件。

import { createListStore } from "./listStore";

export const LEARNING_RECORDS_KEY = "genba_learning_records_v1";

export type LearningRecord = {
  projectId: string;
  success: string;          // うまくいったこと
  failure: string;          // 失敗したこと
  unexpectedIssue: string;  // 想定外の問題
  rootCause: string;        // 根本原因
  solution: string;         // 解決方法
  prevention: string;       // 再発防止策
  nextTimeCaution: string;  // 次回の注意点
  skilledWorkerTip: string; // 熟練職人のコツ
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

// ─── 保存ユーティリティ ───────────────────────────────────────
// 1案件1件のため、getById(projectId) で単一取得できる
export const learningRecordsStore = createListStore<LearningRecord>(
  LEARNING_RECORDS_KEY,
  (l) => l.projectId,
  (l) => l.projectId,
);

/** 空の学び記録を作成する（保存はしない） */
export function createEmptyLearningRecord(projectId: string): LearningRecord {
  const now = new Date().toISOString();
  return {
    projectId,
    success: "",
    failure: "",
    unexpectedIssue: "",
    rootCause: "",
    solution: "",
    prevention: "",
    nextTimeCaution: "",
    skilledWorkerTip: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
