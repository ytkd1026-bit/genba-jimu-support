// 一覧型データの localStorage 保存を共通化するファクトリ
// savedProjects.ts / savedEstimates.ts で繰り返していた getAll / upsert / remove の
// パターンを型ごとに再実装しないための基盤。
// 将来 Supabase へ移行する際は、このファイルの read / write の実装だけを差し替える。

export type ListStore<T> = {
  /** 全件取得（読み込み失敗時は空配列） */
  getAll: () => T[];
  /** ID指定で1件取得（存在しなければ null） */
  getById: (id: string) => T | null;
  /** 案件IDに紐づくレコードを保存順で取得 */
  getByProjectId: (projectId: string) => T[];
  /** 追加または上書き。localStorage 容量超過などで保存できなかった場合は false */
  upsert: (item: T) => boolean;
  /** ID指定で削除 */
  remove: (id: string) => void;
  /** 案件IDに紐づくレコードをまとめて削除（案件削除時のカスケード用） */
  removeByProjectId: (projectId: string) => void;
};

export function createListStore<T>(
  storageKey: string,
  getId: (item: T) => string,
  getProjectId: (item: T) => string,
): ListStore<T> {
  function read(): T[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }

  function write(list: T[]): boolean {
    if (typeof window === "undefined") return false;
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
      return true;
    } catch {
      // QuotaExceededError（写真データ等での容量超過）を含む
      return false;
    }
  }

  return {
    getAll: read,
    getById: (id) => read().find((item) => getId(item) === id) ?? null,
    getByProjectId: (projectId) =>
      read().filter((item) => getProjectId(item) === projectId),
    upsert: (item) => {
      const list = read();
      const idx = list.findIndex((i) => getId(i) === getId(item));
      if (idx >= 0) {
        list[idx] = item;
      } else {
        // 一覧の並びを発行ID順に保つため末尾へ追加する（写真台帳の表示順の基準）
        list.push(item);
      }
      return write(list);
    },
    remove: (id) => {
      write(read().filter((item) => getId(item) !== id));
    },
    removeByProjectId: (projectId) => {
      write(read().filter((item) => getProjectId(item) !== projectId));
    },
  };
}
