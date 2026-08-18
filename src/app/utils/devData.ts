// テストデータ管理（仕様1〜4）
//
// 開発中は実機テストのため、実際の自社情報・元請・単価・案件を登録して使う。
// リリース前に「テスト用に登録したデータ」だけを確実に消せるようにする。
//
// 重要: テストデータかどうかは実行環境（NODE_ENV）で決めない。データ自身が
// isTestData フラグで保持する。本番ビルドで登録しても、この区分は変わらない。
// 新規レコードには、下の「テストデータ登録モード」の値を isTestData として付ける。
//
// 対象: 元請マスタ・単価マスタ・Project（isTestData のあるもの）。
// 会社設定（genba_settings）は単一レコードのため個別判定せず、ここでは触らない。

import { contractorStore } from "./contractorMaster";
import { unitPriceMasterStore } from "./unitPriceMaster";
import { projectsStore } from "./projects";
import { workItemsStore } from "./workItems";

// ─── テストデータ登録モード（明示フラグ。実行環境に依存しない） ──────
// 新規に作るデータをテストデータとして保存するかどうかの設定。localStorage に持つため、
// 開発ビルドでも本番ビルドでも同じ値を参照でき、リビルドで区分が変わらない。
const TEST_DATA_MODE_KEY = "genba_test_data_mode_v1";

/**
 * テストデータ登録モードが有効か。既定は true（開発・実機テスト段階のため）。
 * 本番運用データを登録するときは、開発データ管理画面でこれを OFF にする。
 */
export function isTestDataMode(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(TEST_DATA_MODE_KEY);
    if (raw === null) return true; // 未設定は true（テストデータ扱い）
    return raw === "1";
  } catch {
    return true;
  }
}

export function setTestDataMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TEST_DATA_MODE_KEY, on ? "1" : "0");
  } catch {
    // 保存失敗は致命的でない
  }
}

/** 新規レコードに付ける isTestData の値（現在のモードに従う） */
export function newRecordIsTestData(): boolean {
  return isTestDataMode();
}

/** テストデータかどうか。旧データ（environment:"development"）も後方互換でテスト扱い。 */
export function isTestRecord(rec: { isTestData?: boolean; environment?: string }): boolean {
  return rec.isTestData === true || rec.environment === "development";
}

export type DevDataCounts = {
  contractors: number;
  masters: number;
  projects: number;
};

/** テストデータ（isTestData）のレコード数を数える */
export function countTestData(): DevDataCounts {
  return {
    contractors: contractorStore.getAll().filter(isTestRecord).length,
    masters: unitPriceMasterStore.getAll().filter(isTestRecord).length,
    projects: projectsStore.getAll().filter(isTestRecord).length,
  };
}

/**
 * テストデータ（isTestData === true）のみを削除する。
 * 本番データ（フラグなし／false）は残す。削除件数を返す。
 * Project を消す場合、その配下の WorkItem もカスケード削除する。
 */
export function deleteTestData(): DevDataCounts {
  const before = countTestData();

  for (const c of contractorStore.getAll()) {
    if (isTestRecord(c)) contractorStore.remove(c.id);
  }
  for (const m of unitPriceMasterStore.getAll()) {
    if (isTestRecord(m)) unitPriceMasterStore.remove(m.id);
  }
  for (const p of projectsStore.getAll()) {
    if (isTestRecord(p)) {
      workItemsStore.removeByProjectId(p.projectId);
      projectsStore.remove(p.projectId);
    }
  }
  return before;
}
