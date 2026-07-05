// 案件本保存ユーティリティ
// savedEstimates.ts / savedInvoices.ts と同じパターンで、将来 Supabase へ移行できる構造にしている

const SAVED_PROJECTS_KEY = "genba_jimu_saved_projects";

export type SavedProject = {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectName: string;
  clientName: string;
  contactName: string;
  address: string;
  koujiTypes: string[];
  koujiTypeOther: string;
  koujiContents: string[];
  koujiContentCustom: string;
  koujiContentMemo: string;
  scaleNote: string;
  parkingNote: string;
  sekouDate: string;
  mitsumoriState: string;
  seikyuuState: string;
  memo: string;
  selectedCustomerId: string;
};

export function getSavedProjects(): SavedProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SAVED_PROJECTS_KEY);
    return raw ? (JSON.parse(raw) as SavedProject[]) : [];
  } catch {
    return [];
  }
}

export function upsertProject(project: SavedProject): void {
  const list = getSavedProjects();
  const idx = list.findIndex((p) => p.id === project.id);
  if (idx >= 0) {
    list[idx] = project;
  } else {
    list.unshift(project);
  }
  localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(list));
}

export function deleteProject(id: string): void {
  const list = getSavedProjects().filter((p) => p.id !== id);
  localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(list));
}
