// ─── 自動下書き保存ユーティリティ ─────────────────────────────
// localStorage への読み書きをラップする共通関数。
// 将来 Supabase へ移行する際は saveDraft / loadDraft の実装だけ差し替える。

export const DRAFT_VERSION = 1;
export const DRAFT_PREFIX = 'genba-jimu-support:draft:';

export type DraftEntry<T = unknown> = {
  version: number;
  type: string;
  id: string;
  updatedAt: string; // ISO 8601
  data: T;
};

/** 画面種別と ID から localStorage キーを生成する */
export function draftKey(type: string, id: string): string {
  return `${DRAFT_PREFIX}${type}:${id}`;
}

/** 下書きを保存する。成功したら true を返す */
export function saveDraft<T>(
  key: string,
  type: string,
  id: string,
  data: T,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const entry: DraftEntry<T> = {
      version: DRAFT_VERSION,
      type,
      id,
      updatedAt: new Date().toISOString(),
      data,
    };
    localStorage.setItem(key, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/** 下書きを読み込む。存在しない・バージョン不一致・破損の場合は null */
export function loadDraft<T>(key: string): DraftEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as DraftEntry<T>;
    if (typeof entry !== 'object' || entry.version !== DRAFT_VERSION) return null;
    return entry;
  } catch {
    return null;
  }
}

/** 下書きを削除する */
export function removeDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** 下書きが存在するかチェック */
export function hasDraft(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/** 全下書きを一覧で取得（更新日時の降順） */
export function listDrafts(): DraftEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const results: DraftEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      const entry = loadDraft(k);
      if (entry) results.push(entry);
    }
    return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}
