// 案件ID・被害ID・写真ID・工事項目IDなどの連番発行ユーティリティ
//
// 発行済みの最大番号を localStorage のカウンターで永続化するため、
// レコードを削除しても同じIDが再発行されない（写真IDの詰め直し禁止に対応）。
// カウンターが消えた場合に備え、呼び出し側から既存IDの一覧を渡すと
// その最大値を下限としてカウンターを自己修復する。

const ID_COUNTERS_KEY = "genba_id_counters_v1";

/** 案件IDの接頭辞（例: REV-2026-0001） */
export const PROJECT_ID_PREFIX = "REV";

type CounterMap = Record<string, number>;

function readCounters(): CounterMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ID_COUNTERS_KEY);
    return raw ? (JSON.parse(raw) as CounterMap) : {};
  } catch {
    return {};
  }
}

function writeCounters(map: CounterMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ID_COUNTERS_KEY, JSON.stringify(map));
  } catch {
    // カウンター保存失敗時も採番自体は続行する（次回は既存IDから自己修復される）
  }
}

/** scope のカウンターを floor 以上に引き上げてから +1 した値を発行する */
function nextCounter(scope: string, floor: number): number {
  const map = readCounters();
  const next = Math.max(map[scope] ?? 0, floor) + 1;
  map[scope] = next;
  writeCounters(map);
  return next;
}

/** ID一覧から正規表現（数値のキャプチャ1つ）で最大連番を求める */
function maxSequence(ids: string[], pattern: RegExp): number {
  let max = 0;
  for (const id of ids) {
    const m = pattern.exec(id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

/**
 * 案件IDを発行する（例: REV-2026-0001）。年ごとに連番をリセットする。
 * @param existingIds 既存案件IDの一覧（カウンター消失時の自己修復に使用）
 */
export function issueProjectId(existingIds: string[], now: Date = new Date()): string {
  const year = now.getFullYear();
  const re = new RegExp(`^${PROJECT_ID_PREFIX}-${year}-(\\d+)$`);
  const floor = maxSequence(existingIds, re);
  const n = nextCounter(`project:${year}`, floor);
  return `${PROJECT_ID_PREFIX}-${year}-${String(n).padStart(4, "0")}`;
}

export type RecordIdKind =
  | "damage"     // 被害記録    D-001
  | "photo"      // 写真        P-001
  | "workItem"   // 工事項目    W-001
  | "workReport" // 作業報告    R-001
  | "projectLog"; // 案件ログ   L-001

const RECORD_ID_PREFIX: Record<RecordIdKind, string> = {
  damage:     "D",
  photo:      "P",
  workItem:   "W",
  workReport: "R",
  projectLog: "L",
};

/**
 * 案件内で一意なレコードIDを発行する（例: D-001 / P-001 / W-001）。
 * 案件ごとに独立した連番。削除済みの番号は再利用しない。
 * @param existingIds 同一案件内の既存IDの一覧（カウンター消失時の自己修復に使用）
 */
export function issueRecordId(
  kind: RecordIdKind,
  projectId: string,
  existingIds: string[],
): string {
  const prefix = RECORD_ID_PREFIX[kind];
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const floor = maxSequence(existingIds, re);
  const n = nextCounter(`${kind}:${projectId}`, floor);
  return `${prefix}-${String(n).padStart(3, "0")}`;
}
