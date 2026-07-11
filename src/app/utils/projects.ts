// 案件（Project）の型定義と保存ユーティリティ
// すべての現場データ（調査・写真・工事項目・見積・請求・報告・学び）を
// projectId で紐付ける「一案件一元管理」の中心となる型。
//
// 既存の savedProjects.ts（genba_jimu_saved_projects）は旧形式として温存し、
// このファイルは新キー genba_projects_v1 に保存する。
// 旧形式からの変換は migrateLegacySavedProject() を使う。

import { createListStore } from "./listStore";
import { issueProjectId } from "./idGenerator";
import type { SavedProject } from "./savedProjects";

export const PROJECTS_KEY = "genba_projects_v1";

export type ProjectType = "normal" | "insurance";

export type BuildingType =
  | "condominium"
  | "apartment"
  | "detached_house"
  | "commercial"
  | "office"
  | "other";

export type ProjectStatus =
  | "survey"
  | "estimating"
  | "submitted"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "invoiced"
  | "paid"
  | "cancelled";

export type Project = {
  projectId: string;
  projectName: string;
  propertyName: string;
  roomNumber: string;
  siteAddress: string;
  customerName: string;
  clientName: string;
  submitTo: string;
  projectType: ProjectType;
  buildingType: BuildingType;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

// ─── 画面表示用の日本語ラベル ─────────────────────────────────
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  normal:    "通常案件",
  insurance: "保険案件",
};

export const BUILDING_TYPE_LABELS: Record<BuildingType, string> = {
  condominium:    "分譲マンション",
  apartment:      "アパート・賃貸",
  detached_house: "戸建て",
  commercial:     "店舗",
  office:         "事務所",
  other:          "その他",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  survey:      "現地調査",
  estimating:  "見積作成中",
  submitted:   "見積提出済み",
  approved:    "受注",
  scheduled:   "施工予定",
  in_progress: "施工中",
  completed:   "施工完了",
  invoiced:    "請求済み",
  paid:        "入金済み",
  cancelled:   "中止",
};

// ─── 保存ユーティリティ ───────────────────────────────────────
export const projectsStore = createListStore<Project>(
  PROJECTS_KEY,
  (p) => p.projectId,
  (p) => p.projectId,
);

/** 新しい案件IDを発行する（例: REV-2026-0001。既存案件と重複しない） */
export function issueNewProjectId(): string {
  return issueProjectId(projectsStore.getAll().map((p) => p.projectId));
}

/** 空の新規案件を作成する（保存はしない） */
export function createEmptyProject(projectId: string): Project {
  const now = new Date().toISOString();
  return {
    projectId,
    projectName: "",
    propertyName: "",
    roomNumber: "",
    siteAddress: "",
    customerName: "",
    clientName: "",
    submitTo: "",
    projectType: "normal",
    buildingType: "other",
    status: "survey",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 旧形式の案件（genba_jimu_saved_projects）を新 Project 型へ変換する。
 * 変換のみで保存はしない。旧データは変更しない。
 */
export function migrateLegacySavedProject(
  legacy: SavedProject,
  projectId: string,
): Project {
  const now = new Date().toISOString();
  return {
    projectId,
    projectName: legacy.projectName,
    propertyName: "",
    roomNumber: "",
    siteAddress: legacy.address,
    customerName: legacy.contactName,
    clientName: legacy.clientName,
    submitTo: legacy.clientName,
    projectType: "normal",
    buildingType: "other",
    status: "survey",
    createdAt: legacy.createdAt || now,
    updatedAt: now,
  };
}
