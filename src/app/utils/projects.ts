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

// ─── 流入経路（どこから来た案件か） ─────────────────────────────
// 将来、経路別の売上・粗利・成約率、元請別の売上・利益率を集計する。
export type InflowRoute =
  | "existing_customer" // 既存顧客
  | "direct"            // 直請け
  | "line"              // 公式LINE
  | "instagram"         // Instagram
  | "google"            // Google
  | "referral"          // 紹介
  | "contractor"        // 元請け
  | "other";            // その他

export const INFLOW_ROUTE_LABELS: Record<InflowRoute, string> = {
  existing_customer: "既存顧客",
  direct:            "直請け",
  line:              "公式LINE",
  instagram:         "Instagram",
  google:            "Google",
  referral:          "紹介",
  contractor:        "元請け",
  other:             "その他",
};

export type Project = {
  // 内部ID（真の主キー）。新規案件は UUID。
  // 旧案件は REV-YYYY-NNNN 形式のまま変更しない（発番済みIDは変更不可）。
  // 見積・請求・写真・報告・学び等の紐付けはすべてこのIDで行う。
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
  // ─── ユーザー別案件番号（2026-07 追加。既存データは undefined のまま有効） ───
  organizationId?: string;  // 所属組織（会社）のUUID。ユーザー個人には紐付けない
  projectNumber?: string;   // 表示用案件番号（例: REVO-26-0001）。発番後は変更不可
  projectCode?: string;     // 発番時点の案件ID用コード（例: REVO）。設定変更の影響を受けない
  sequenceYear?: number;    // 発番年（西暦。例: 2026）
  sequenceNumber?: number;  // 年度内連番（例: 1）
  customerId?: string;      // 得意先マスタ（customers）のID
  inflowRoute?: InflowRoute;      // 流入経路
  inflowSourceName?: string;      // 経路の相手先名（元請け選択時の元請会社名など）
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

// ─── ステータスの優先順位（前進のみ・後退させない） ──────────
// 数値が大きいほど後の工程。自動更新はこの順位を後退させない。
const STATUS_RANK: Record<ProjectStatus, number> = {
  survey: 0,
  estimating: 1,
  submitted: 2,
  approved: 3,
  scheduled: 4,
  in_progress: 5,
  completed: 6,
  invoiced: 7,
  paid: 8,
  cancelled: 9, // 終端。自動更新では設定も後退もしない
};

/**
 * 案件ステータスを目標ステータスへ「前進のみ」で自動更新する。
 * 既にユーザーが先の工程へ進めている場合は後退させない。
 * cancelled の案件は自動更新しない。保存に失敗しても致命的ではないため戻り値は無視してよい。
 */
export function advanceProjectStatus(projectId: string, to: ProjectStatus): void {
  const p = projectsStore.getById(projectId);
  if (!p) return;
  if (p.status === "cancelled") return; // 中止案件は自動更新しない
  if (STATUS_RANK[to] <= STATUS_RANK[p.status]) return; // 後退・据え置きはしない
  projectsStore.upsert({ ...p, status: to, updatedAt: new Date().toISOString() });
}

// ─── 保存ユーティリティ ───────────────────────────────────────
export const projectsStore = createListStore<Project>(
  PROJECTS_KEY,
  (p) => p.projectId,
  (p) => p.projectId,
);

/**
 * 新しい案件IDを発行する（例: REV-2026-0001。既存案件と重複しない）。
 * 旧方式。新規案件の作成は registerNewProject()（UUID＋表示用番号）を使うこと。
 * 旧データ移行（projectMigration.ts）との互換のため残している。
 */
export function issueNewProjectId(): string {
  return issueProjectId(projectsStore.getAll().map((p) => p.projectId));
}

/**
 * 案件の表示用番号を返す（画面・PDF・書類番号の共通入口）。
 * 新案件 = projectNumber（例: REVO-26-0001）
 * 旧案件 = projectNumber 未付与の間は従来の projectId（例: REV-2026-0001）
 */
export function projectDisplayId(p: Pick<Project, "projectId" | "projectNumber">): string {
  return p.projectNumber ?? p.projectId;
}

/**
 * 正式案件として登録する＝案件化（内部UUID発行＋表示用案件番号の自動発番）。
 * - 会社設定の案件ID用コード未設定ならエラー（案件登録できない）
 * - 発番と保存を Web Locks で直列化（複数タブの二重発番対策）
 * - すでに projectNumber を持つ案件へは使わない（再発番禁止は呼び出し側と
 *   ensureProjectNumber の双方で防ぐ）
 */
export async function registerNewProject(
  fields: Partial<Project>,
): Promise<{ project: Project | null; error: string | null }> {
  const { issueProjectNumberSafe, validateProjectCode } = await import("./projectNumbers");
  const { getOrCreateOrganizationId, issueUuid } = await import("./organizations");
  const { getProjectCode } = await import("./companySettings");

  const code = getProjectCode();
  const codeError = validateProjectCode(code);
  if (codeError) {
    return {
      project: null,
      error: `${codeError} 事業者設定の「案件ID用コード」を登録してください。`,
    };
  }

  const organizationId = getOrCreateOrganizationId();
  try {
    const issued = await issueProjectNumberSafe(organizationId, code, () =>
      projectsStore.getAll(),
    );
    const project: Project = {
      ...createEmptyProject(issueUuid()),
      ...fields,
      organizationId,
      projectNumber: issued.projectNumber,
      projectCode: issued.projectCode,
      sequenceYear: issued.sequenceYear,
      sequenceNumber: issued.sequenceNumber,
      updatedAt: new Date().toISOString(),
    };
    const ok = projectsStore.upsert(project);
    if (!ok) return { project: null, error: "保存に失敗しました。ブラウザの保存容量を確認してください。" };
    return { project, error: null };
  } catch (e) {
    return { project: null, error: e instanceof Error ? e.message : "案件番号の発番に失敗しました。" };
  }
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
