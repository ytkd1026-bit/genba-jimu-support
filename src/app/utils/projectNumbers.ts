// ユーザー別 案件番号（表示用管理番号）の発番ユーティリティ
//
// 形式: {案件ID用コード}-{西暦下2桁}-{年度内4桁連番}   例: REVO-26-0001 / YMD-26-0001
//
// 設計方針（複数ユーザー・Supabase移行前提）:
// - 表示用案件番号（projectNumber）と内部ID（projectId＝UUID）を分離する。
//   本当の主キーは内部ID。projectNumber は人間が検索・確認する管理番号。
// - 番号は発番時に案件へ固定保存する。会社設定のコードを後から変えても
//   過去案件の番号は再計算しない（変更不可）。
// - カウンターは localStorage（組織→コード→年 の入れ子）で永続化し、
//   カウンター消失・巻き戻り時は既存案件の最大連番から自己修復する。
// - 複数タブ対策: Web Locks API（対応ブラウザ）で発番処理を直列化し、
//   さらに発番直前の再読込＋発番後の重複チェックで二重発番を防ぐ。
//   ※localStorage にトランザクションは無いため完全な保証は Supabase 移行後の
//     DB採番（UNIQUE制約）で行う。ここでは端末内での実用上の防止に留める。

import type { Project } from "./projects";

const COUNTERS_KEY = "genba_project_number_counters_v1";

/** 案件ID用コードの書式: 半角英数字 2〜8文字（英字は大文字） */
export const PROJECT_CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

/** 入力値をコード書式へ正規化する（前後空白除去＋大文字化）。検証はしない */
export function normalizeProjectCode(input: string): string {
  return input.trim().toUpperCase();
}

/** コードの検証。問題なければ null、問題があれば日本語のエラーメッセージを返す */
export function validateProjectCode(input: string): string | null {
  const code = normalizeProjectCode(input);
  if (code === "") return "案件ID用コードが未設定です。";
  if (!/^[A-Za-z0-9]+$/.test(code)) {
    return "案件ID用コードは半角英数字のみ使えます（空白・記号・日本語は不可）。";
  }
  if (code.length < 2 || code.length > 8) {
    return "案件ID用コードは2〜8文字で入力してください。";
  }
  return null;
}

/** 発番結果（案件へそのまま保存できる形） */
export type IssuedProjectNumber = {
  projectNumber: string;   // 例: REVO-26-0001
  projectCode: string;     // 例: REVO（発番時点のコードを固定保存）
  sequenceYear: number;    // 例: 2026（西暦。表示は下2桁）
  sequenceNumber: number;  // 例: 1（年度内連番）
};

/** 表示用案件番号を組み立てる */
export function formatProjectNumber(code: string, year: number, seq: number): string {
  const yy = String(year % 100).padStart(2, "0");
  return `${code}-${yy}-${String(seq).padStart(4, "0")}`;
}

// ─── カウンター（組織ID → コード → 西暦 → 発番済み最大連番） ────────
type CounterTree = Record<string, Record<string, Record<string, number>>>;

function readCounters(): CounterTree {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(COUNTERS_KEY);
    return raw ? (JSON.parse(raw) as CounterTree) : {};
  } catch {
    return {}; // 破損時は空扱い（既存案件からの自己修復が下限を保証する）
  }
}

function writeCounters(tree: CounterTree): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COUNTERS_KEY, JSON.stringify(tree));
  } catch {
    // 保存失敗でも発番は続行（次回は既存案件の最大値から自己修復）
  }
}

/** 既存案件から「同コード・同年」の最大連番を求める（自己修復の下限） */
export function maxIssuedSequence(projects: Project[], code: string, year: number): number {
  const yy = String(year % 100).padStart(2, "0");
  const re = new RegExp(`^${code}-${yy}-(\\d{4})$`);
  let max = 0;
  for (const p of projects) {
    if (!p.projectNumber) continue;
    const m = re.exec(p.projectNumber);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max;
}

/**
 * 表示用案件番号を1件発番する（同期・ロックなしの本体）。
 * カウンターと既存案件の両方を見て次番号を決め、最後に重複チェックする。
 * 通常は issueProjectNumberSafe()（ロック付き）を使うこと。
 */
export function issueProjectNumber(
  organizationId: string,
  rawCode: string,
  projects: Project[],
  now: Date = new Date(),
): IssuedProjectNumber {
  const err = validateProjectCode(rawCode);
  if (err) throw new Error(err);
  const code = normalizeProjectCode(rawCode);
  const year = now.getFullYear();

  const tree = readCounters();
  const counter = tree[organizationId]?.[code]?.[String(year)] ?? 0;
  const floor = maxIssuedSequence(projects, code, year);
  let seq = Math.max(counter, floor) + 1;

  // 発番後の最終重複チェック（カウンター破損・他タブ発番の取りこぼし対策）
  const used = new Set(projects.map((p) => p.projectNumber).filter(Boolean));
  while (used.has(formatProjectNumber(code, year, seq))) seq += 1;

  tree[organizationId] = tree[organizationId] ?? {};
  tree[organizationId][code] = tree[organizationId][code] ?? {};
  tree[organizationId][code][String(year)] = seq;
  writeCounters(tree);

  return {
    projectNumber: formatProjectNumber(code, year, seq),
    projectCode: code,
    sequenceYear: year,
    sequenceNumber: seq,
  };
}

/**
 * Web Locks API で発番を直列化する（複数タブ同時操作対策）。
 * 非対応ブラウザではそのまま実行する（重複チェックは issueProjectNumber 内で実施）。
 * getProjects はロック取得後に呼ばれるため、他タブの発番結果を取り込める。
 */
export async function issueProjectNumberSafe(
  organizationId: string,
  rawCode: string,
  getProjects: () => Project[],
  now: Date = new Date(),
): Promise<IssuedProjectNumber> {
  const run = () => issueProjectNumber(organizationId, rawCode, getProjects(), now);
  if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
    return navigator.locks.request("genba-project-number", async () => run());
  }
  return run();
}

/**
 * カウンターを指定値まで引き上げる（既存案件への一括番号付与の後に使う）。
 * 下げる方向には変更しない（巻き戻り防止）。
 */
export function raiseCounter(
  organizationId: string,
  code: string,
  year: number,
  seq: number,
): void {
  const tree = readCounters();
  const current = tree[organizationId]?.[code]?.[String(year)] ?? 0;
  if (seq <= current) return;
  tree[organizationId] = tree[organizationId] ?? {};
  tree[organizationId][code] = tree[organizationId][code] ?? {};
  tree[organizationId][code][String(year)] = seq;
  writeCounters(tree);
}
