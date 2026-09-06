import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPhase1MigrationProgress,
  phase1MigrationStorageKey,
  toStoredPhase1MigrationState,
} from "../src/app/lib/supabase/migrationState.ts";
import { friendlyAuthError } from "../src/app/lib/supabase/authErrors.ts";

const empty = {
  counts: { company: 0, contractors: 0, unitPrice: 0 },
  contractorRefs: [],
  unitPriceRefs: [],
};

test("移行キーはuserとorganizationで分離される", () => {
  const userA = phase1MigrationStorageKey("user-a", "org-1");
  const userB = phase1MigrationStorageKey("user-b", "org-1");
  const orgB = phase1MigrationStorageKey("user-a", "org-2");
  assert.notEqual(userA, userB);
  assert.notEqual(userA, orgB);
  assert.match(userA, /_v1:user-a:org-1$/);
});

test("user Aの完了状態はuser Bのキーへ入らない", () => {
  const complete = buildPhase1MigrationProgress(empty, empty, true);
  const stateA = toStoredPhase1MigrationState("user-a", "org-1", complete, "2026-08-18T00:00:00.000Z");
  const storage = new Map([[phase1MigrationStorageKey("user-a", "org-1"), JSON.stringify(stateA)]]);
  assert.equal(storage.has(phase1MigrationStorageKey("user-a", "org-1")), true);
  assert.equal(storage.has(phase1MigrationStorageKey("user-b", "org-1")), false);
});

test("会社だけcloudにあっても元請・単価がlocalのみなら未移行", () => {
  const local = {
    counts: { company: 1, contractors: 2, unitPrice: 2 },
    contractorRefs: ["CON-0001", "CON-0002"],
    unitPriceRefs: ["UPM-0001", "UPM-0002"],
  };
  const cloud = {
    counts: { company: 1, contractors: 0, unitPrice: 0 },
    contractorRefs: [],
    unitPriceRefs: [],
  };
  const progress = buildPhase1MigrationProgress(local, cloud, true);
  assert.equal(progress.categories.company.completed, true);
  assert.equal(progress.categories.contractors.completed, false);
  assert.equal(progress.categories.unitPrice.completed, false);
  assert.equal(progress.allCompleted, false);
});

test("件数が同じでもlocal_refが違えば移行済みにしない", () => {
  const local = {
    counts: { company: 0, contractors: 1, unitPrice: 1 },
    contractorRefs: ["CON-local"],
    unitPriceRefs: ["UPM-local"],
  };
  const cloud = {
    counts: { company: 0, contractors: 1, unitPrice: 1 },
    contractorRefs: ["CON-other"],
    unitPriceRefs: ["UPM-other"],
  };
  const progress = buildPhase1MigrationProgress(local, cloud, true);
  assert.equal(progress.categories.contractors.completed, false);
  assert.equal(progress.categories.unitPrice.completed, false);
});

test("全local_ref反映後だけ全カテゴリ完了", () => {
  const local = {
    counts: { company: 1, contractors: 1, unitPrice: 1 },
    contractorRefs: ["CON-0001"],
    unitPriceRefs: ["UPM-0001"],
  };
  const cloud = {
    counts: { company: 1, contractors: 1, unitPrice: 1 },
    contractorRefs: ["CON-0001"],
    unitPriceRefs: ["UPM-0001"],
  };
  const progress = buildPhase1MigrationProgress(local, cloud, true);
  assert.equal(progress.allCompleted, true);
  assert.deepEqual(
    toStoredPhase1MigrationState("user-a", "org-1", progress).categories,
    { company: true, contractors: true, unitPrice: true },
  );
});

test("再移行相当でcloud側に追加データがあってもlocal_refが揃えば完了", () => {
  const local = {
    counts: { company: 1, contractors: 1, unitPrice: 1 },
    contractorRefs: ["CON-0001"],
    unitPriceRefs: ["UPM-0001"],
  };
  const cloud = {
    counts: { company: 1, contractors: 2, unitPrice: 2 },
    contractorRefs: ["CON-0001", "CON-cloud-only"],
    unitPriceRefs: ["UPM-0001", "UPM-cloud-only"],
  };
  assert.equal(buildPhase1MigrationProgress(local, cloud, true).allCompleted, true);
});

test("localが空の新端末は移行対象なしとしてcloudへ切替可能", () => {
  const cloud = {
    counts: { company: 1, contractors: 5, unitPrice: 23 },
    contractorRefs: ["CON-0001"],
    unitPriceRefs: ["UPM-0001"],
  };
  assert.equal(buildPhase1MigrationProgress(empty, cloud, true).allCompleted, true);
});

test("クラウド状態取得失敗は完了扱いにしない", () => {
  assert.equal(buildPhase1MigrationProgress(empty, empty, false).allCompleted, false);
});

test("認証エラーを実機向け文言へ分類する", () => {
  assert.equal(friendlyAuthError("Invalid login credentials", "invalid_credentials"), "メールアドレスまたはパスワードが違います。");
  assert.equal(friendlyAuthError("Failed to fetch"), "ネットワークエラーです。Supabaseへ接続できません。");
});

