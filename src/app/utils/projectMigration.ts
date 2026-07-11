// 旧案件（savedProjects）→ 新 Project（projectsStore）の移行と移行済み判定
//
// 方針:
// - 旧 savedProjects データは削除しない（読み取り専用の移行元として扱う）
// - 同じ旧案件を重複移行しない（旧 id → 新 projectId のマッピングを保存）
// - /projects/new の本保存で新規 Project を作った場合も、対応する旧 id を
//   マッピングへ記録しておくことで、一覧の移行バナーが二重計上しないようにする
//
// TODO: Supabase移行時はDB採番またはUUIDへ変更する。
//       localStorage採番は複数端末・同時編集に対応しない。

import { getSavedProjects, type SavedProject } from "./savedProjects";
import {
  projectsStore,
  issueNewProjectId,
  migrateLegacySavedProject,
  type Project,
} from "./projects";

const MIGRATION_MAP_KEY = "genba_project_migration_map_v1";

/** 旧 savedProject.id → 新 projectId のマッピング */
type MigrationMap = Record<string, string>;

function readMap(): MigrationMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MIGRATION_MAP_KEY);
    return raw ? (JSON.parse(raw) as MigrationMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: MigrationMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MIGRATION_MAP_KEY, JSON.stringify(map));
  } catch {
    // 記録に失敗しても移行自体は続行する（次回は既存判定に頼らず重複が起きうるが実害は小）
  }
}

/** 旧 id を移行済みとして記録する（新規 Project 作成時にも使う） */
export function recordMigration(legacyId: string, projectId: string): void {
  const map = readMap();
  map[legacyId] = projectId;
  writeMap(map);
}

/** 旧 id が移行済みか */
export function isMigrated(legacyId: string): boolean {
  return legacyId in readMap();
}

/** 旧 id に対応する新 projectId を返す（未移行なら null） */
export function migratedProjectIdOf(legacyId: string): string | null {
  return readMap()[legacyId] ?? null;
}

/** まだ新 Project へ移行されていない旧案件の一覧 */
export function getUnmigratedLegacyProjects(): SavedProject[] {
  const map = readMap();
  return getSavedProjects().filter((p) => !(p.id in map));
}

export type MigrationResult = {
  migratedCount: number;
  projects: Project[];
};

/**
 * 未移行の旧案件をすべて新 Project へ引き継ぐ。
 * 旧データは削除しない。既に移行済みの案件はスキップする。
 */
export function migrateAllLegacyProjects(): MigrationResult {
  const targets = getUnmigratedLegacyProjects();
  const created: Project[] = [];
  for (const legacy of targets) {
    const projectId = issueNewProjectId();
    const project = migrateLegacySavedProject(legacy, projectId);
    if (projectsStore.upsert(project)) {
      recordMigration(legacy.id, projectId);
      created.push(project);
    }
  }
  return { migratedCount: created.length, projects: created };
}
