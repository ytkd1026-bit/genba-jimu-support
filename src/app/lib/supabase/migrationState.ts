// Phase 1（自社情報・元請・単価マスタ）の移行状態を判定する純粋ロジック。
// ブラウザや Supabase に依存させず、ユーザー切替・部分移行を自動テストできるようにする。

export const PHASE1_MIGRATION_VERSION = 1;
export const PHASE1_MIGRATION_KEY_PREFIX = "genba_supabase_migration";

export type Phase1Counts = {
  company: number;
  contractors: number;
  unitPrice: number;
};

export type Phase1DataSnapshot = {
  counts: Phase1Counts;
  contractorRefs: string[];
  unitPriceRefs: string[];
};

export type Phase1CategoryStatus = {
  localCount: number;
  cloudCount: number;
  completed: boolean;
};

export type Phase1MigrationProgress = {
  version: number;
  cloudLoaded: boolean;
  categories: {
    company: Phase1CategoryStatus;
    contractors: Phase1CategoryStatus;
    unitPrice: Phase1CategoryStatus;
  };
  allCompleted: boolean;
};

export type StoredPhase1MigrationState = {
  version: number;
  userId: string;
  organizationId: string;
  updatedAt: string;
  categories: {
    company: boolean;
    contractors: boolean;
    unitPrice: boolean;
  };
  completedAt: string | null;
};

/** 移行状態は必ず migration version + user + organization の組み合わせで分離する。 */
export function phase1MigrationStorageKey(userId: string, organizationId: string): string {
  return `${PHASE1_MIGRATION_KEY_PREFIX}_v${PHASE1_MIGRATION_VERSION}:${userId}:${organizationId}`;
}

function refsContainAll(localRefs: string[], cloudRefs: string[]): boolean {
  if (localRefs.length === 0) return true;
  const cloud = new Set(cloudRefs.filter(Boolean));
  return localRefs.every((ref) => ref !== "" && cloud.has(ref));
}

/**
 * ローカルに存在する全レコードがクラウドで確認できたカテゴリだけを完了扱いにする。
 * 件数だけでは別レコードを誤って移行済みと判定できるため、元請・単価は local_ref も照合する。
 */
export function buildPhase1MigrationProgress(
  local: Phase1DataSnapshot,
  cloud: Phase1DataSnapshot,
  cloudLoaded = true,
): Phase1MigrationProgress {
  const companyCompleted = cloudLoaded && (local.counts.company === 0 || cloud.counts.company > 0);
  const contractorsCompleted = cloudLoaded && refsContainAll(local.contractorRefs, cloud.contractorRefs);
  const unitPriceCompleted = cloudLoaded && refsContainAll(local.unitPriceRefs, cloud.unitPriceRefs);

  const categories = {
    company: {
      localCount: local.counts.company,
      cloudCount: cloud.counts.company,
      completed: companyCompleted,
    },
    contractors: {
      localCount: local.counts.contractors,
      cloudCount: cloud.counts.contractors,
      completed: contractorsCompleted,
    },
    unitPrice: {
      localCount: local.counts.unitPrice,
      cloudCount: cloud.counts.unitPrice,
      completed: unitPriceCompleted,
    },
  };

  return {
    version: PHASE1_MIGRATION_VERSION,
    cloudLoaded,
    categories,
    allCompleted: companyCompleted && contractorsCompleted && unitPriceCompleted,
  };
}

export function toStoredPhase1MigrationState(
  userId: string,
  organizationId: string,
  progress: Phase1MigrationProgress,
  now = new Date().toISOString(),
): StoredPhase1MigrationState {
  return {
    version: PHASE1_MIGRATION_VERSION,
    userId,
    organizationId,
    updatedAt: now,
    categories: {
      company: progress.categories.company.completed,
      contractors: progress.categories.contractors.completed,
      unitPrice: progress.categories.unitPrice.completed,
    },
    completedAt: progress.allCompleted ? now : null,
  };
}

