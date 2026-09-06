"use client";

// Phase 1 localStorage → Supabase移行。
// user＋organization単位の状態記録、カテゴリ別検証、local_refによる冪等再実行を担う。

import { contractorStore } from "@/app/utils/contractorMaster";
import { unitPriceMasterStore } from "@/app/utils/unitPriceMaster";
import { getCompanySettings, getBankSettings, getStandardProfitRate } from "@/app/utils/companySettings";
import { contractorRepository } from "./contractorRepository";
import { unitPriceRepository } from "./unitPriceRepository";
import { companyRepository } from "./companyRepository";
import {
  clearBackendCache,
  getLocalPhase1Snapshot,
  getPhase1MigrationProgress,
  readScopedMigrationState,
  resolveSupabaseContext,
  writeScopedMigrationState,
} from "@/app/lib/supabase/backend";
import type { Phase1MigrationProgress, StoredPhase1MigrationState } from "@/app/lib/supabase/migrationState";

function rawLocalHasCompany(): boolean {
  return getLocalPhase1Snapshot().counts.company > 0;
}

export type LocalDataCounts = { contractors: number; masters: number; company: number };

export function countLocalBusinessData(): LocalDataCounts {
  const { counts } = getLocalPhase1Snapshot();
  return { contractors: counts.contractors, masters: counts.unitPrice, company: counts.company };
}

export function hasLocalDataToMigrate(): boolean {
  const c = countLocalBusinessData();
  return c.contractors > 0 || c.masters > 0 || c.company > 0;
}

/** 現在ログイン中のuser＋organizationに限定した保存済み状態。 */
export async function getMigrationState(): Promise<StoredPhase1MigrationState | null> {
  const ctx = await resolveSupabaseContext();
  return ctx ? readScopedMigrationState(ctx) : null;
}

export type MigrationResult = {
  ok: boolean;
  migrated: { contractors: number; masters: number; company: boolean };
  errors: string[];
  progress: Phase1MigrationProgress | null;
};

export async function migrateLocalToCloud(): Promise<MigrationResult> {
  const result: MigrationResult = {
    ok: false,
    migrated: { contractors: 0, masters: 0, company: false },
    errors: [],
    progress: null,
  };
  const ctx = await resolveSupabaseContext();
  if (!ctx) {
    result.errors.push("クラウドに接続していません（ログインしてください）。");
    return result;
  }

  // 会社情報は既存クラウド値を上書きしない。行があればカテゴリ反映済みとして後段で検証する。
  try {
    if (rawLocalHasCompany() && !(await companyRepository.cloudHasCompany())) {
      const c = getCompanySettings();
      const b = getBankSettings();
      const save = await companyRepository.migrateSave({
        businessName: c.businessName,
        representative: c.representative,
        postalCode: c.postalCode,
        address: c.address,
        tel: c.tel,
        email: c.email,
        invoiceNumber: c.invoiceNumber,
        bankName: b.bankName,
        branchName: b.branchName,
        accountType: b.accountType,
        accountNumber: b.accountNumber,
        accountHolder: b.accountHolder,
        standardProfitRate: getStandardProfitRate(),
      });
      if (save.ok) result.migrated.company = true;
      else result.errors.push(`会社情報: ${save.error}`);
    }
  } catch (error) {
    result.errors.push(`会社情報: ${error instanceof Error ? error.message : "失敗"}`);
  }

  for (const contractor of contractorStore.getAll()) {
    const write = await contractorRepository.migrateUpsert(contractor);
    if (write.ok) result.migrated.contractors += 1;
    else result.errors.push(`元請 ${contractor.name}: ${write.error}`);
  }

  for (const unitPrice of unitPriceMasterStore.getAll()) {
    const write = await unitPriceRepository.migrateUpsert(unitPrice);
    if (write.ok) result.migrated.masters += 1;
    else result.errors.push(`単価 ${unitPrice.itemName}: ${write.error}`);
  }

  // upsert後はキャッシュを破棄し、件数＋local_refをSupabaseから読み直して検証する。
  clearBackendCache();
  const refreshedCtx = await resolveSupabaseContext();
  const progress = refreshedCtx
    ? await getPhase1MigrationProgress(refreshedCtx, { forceCloudRefresh: true })
    : null;
  result.progress = progress;

  if (!progress?.cloudLoaded) {
    result.errors.push("移行後のクラウド状態を確認できませんでした。");
  } else {
    if (!progress.categories.company.completed) result.errors.push("自社情報の移行が完了していません。");
    if (!progress.categories.contractors.completed) result.errors.push("元請の移行が完了していません。");
    if (!progress.categories.unitPrice.completed) result.errors.push("単価マスタの移行が完了していません。");
    if (refreshedCtx) writeScopedMigrationState(refreshedCtx, progress);
  }

  result.ok = result.errors.length === 0 && progress?.allCompleted === true;
  clearBackendCache();
  return result;
}

