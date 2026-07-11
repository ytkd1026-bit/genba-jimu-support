// 保険案件情報（InsuranceInfo）の型定義と保存ユーティリティ
// 案件（Project.projectType === "insurance"）の場合だけ入力・保存する。
// 1案件につき1件（projectId をそのままIDとして使う）。

import { createListStore } from "./listStore";

export const INSURANCE_INFO_KEY = "genba_insurance_info_v1";

export type AccidentType =
  | "water_leak"
  | "fire"
  | "wind"
  | "equipment_failure"
  | "impact"
  | "other";

export type InsuranceApprovalStatus =
  | "not_submitted"
  | "submitted"
  | "under_review"
  | "approved"
  | "partially_approved"
  | "rejected";

export type InsuranceInfo = {
  projectId: string;
  accidentType: AccidentType;
  insuranceCompany: string;
  insuranceProduct: string;
  claimNumber: string;
  insuranceContactName: string;
  insuranceContactTel: string;
  accidentDate: string;
  discoveredDate: string;
  surveyDate: string;
  suspectedCause: string;
  approvalStatus: InsuranceApprovalStatus;
  approvedAmount: number | null;
};

// ─── 画面表示用の日本語ラベル ─────────────────────────────────
export const ACCIDENT_TYPE_LABELS: Record<AccidentType, string> = {
  water_leak:        "水漏れ",
  fire:              "火災",
  wind:              "風災",
  equipment_failure: "設備故障",
  impact:            "衝突・物損",
  other:             "その他",
};

export const APPROVAL_STATUS_LABELS: Record<InsuranceApprovalStatus, string> = {
  not_submitted:      "未申請",
  submitted:          "申請済み",
  under_review:       "審査中",
  approved:           "承認",
  partially_approved: "一部承認",
  rejected:           "否認",
};

// ─── 保存ユーティリティ ───────────────────────────────────────
// 1案件1件のため、getById(projectId) で単一取得できる
export const insuranceInfoStore = createListStore<InsuranceInfo>(
  INSURANCE_INFO_KEY,
  (i) => i.projectId,
  (i) => i.projectId,
);

/** 空の保険情報を作成する（保存はしない） */
export function createEmptyInsuranceInfo(projectId: string): InsuranceInfo {
  return {
    projectId,
    accidentType: "water_leak",
    insuranceCompany: "",
    insuranceProduct: "",
    claimNumber: "",
    insuranceContactName: "",
    insuranceContactTel: "",
    accidentDate: "",
    discoveredDate: "",
    surveyDate: "",
    suspectedCause: "",
    approvalStatus: "not_submitted",
    approvedAmount: null,
  };
}
