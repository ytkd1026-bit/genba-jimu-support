const PROJECT_HISTORIES_KEY = "genba_jimu_project_histories";

export type ChangeType = "overwrite" | "new_version";

export type ProjectHistoryEntry = {
  historyId: string;
  projectId: string;
  version: number;
  createdAt: string;
  changeType: ChangeType;
  before: Record<string, string>;
  after: Record<string, string>;
  memo: string;
};

export function getProjectHistories(projectId?: string): ProjectHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECT_HISTORIES_KEY);
    const all = raw ? (JSON.parse(raw) as ProjectHistoryEntry[]) : [];
    return projectId ? all.filter((h) => h.projectId === projectId) : all;
  } catch {
    return [];
  }
}

export function addProjectHistory(entry: ProjectHistoryEntry): void {
  if (typeof window === "undefined") return;
  const list = getProjectHistories();
  list.unshift(entry);
  localStorage.setItem(PROJECT_HISTORIES_KEY, JSON.stringify(list));
}

export const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  overwrite:   "上書き保存",
  new_version: "別版保存",
};
