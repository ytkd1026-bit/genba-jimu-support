"use client";

// Phase 1 の保存先切替と、セッション／organization／移行進捗の解決。
// 自社情報・元請・単価マスタの3カテゴリすべてをクラウドで確認できるまで、
// 通常の読み書きは localStorage を維持する。部分移行で正本を混在させない。

import { getSupabase, isSupabaseConfigured } from "./client";
import { contractorStore } from "@/app/utils/contractorMaster";
import { unitPriceMasterStore } from "@/app/utils/unitPriceMaster";
import {
  buildPhase1MigrationProgress,
  phase1MigrationStorageKey,
  PHASE1_MIGRATION_VERSION,
  toStoredPhase1MigrationState,
  type Phase1DataSnapshot,
  type Phase1MigrationProgress,
  type StoredPhase1MigrationState,
} from "./migrationState";
import type { SupabaseClient } from "@supabase/supabase-js";

const LEGACY_MIGRATION_KEY = "genba_supabase_migration_v1";
const SETTINGS_STORAGE_KEY = "genba_settings";

export type BackendMode = "supabase" | "local";

export type ActiveBackend = {
  mode: BackendMode;
  organizationId: string | null;
  userId: string | null;
  /** ローカルのPhase 1データがあり、3カテゴリのいずれかが未移行か。 */
  needsMigration: boolean;
  migrationProgress: Phase1MigrationProgress | null;
};

export type SupabaseContext = { sb: SupabaseClient; organizationId: string; userId: string };

let orgCache: { userId: string; organizationId: string } | null = null;
let cloudSnapshotCache: { scope: string; value: Phase1DataSnapshot } | null = null;

function hasRawLocalCompany(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}");
    return typeof raw.businessName === "string" && raw.businessName.trim() !== "";
  } catch {
    return false;
  }
}

/** このブラウザにあるPhase 1移行対象。元請・単価はlocal_refになる既存IDも保持する。 */
export function getLocalPhase1Snapshot(): Phase1DataSnapshot {
  const contractors = contractorStore.getAll();
  const unitPrices = unitPriceMasterStore.getAll();
  return {
    counts: {
      company: hasRawLocalCompany() ? 1 : 0,
      contractors: contractors.length,
      unitPrice: unitPrices.length,
    },
    contractorRefs: contractors.map((item) => item.id),
    unitPriceRefs: unitPrices.map((item) => item.id),
  };
}

export function hasLocalBusinessData(): boolean {
  const { counts } = getLocalPhase1Snapshot();
  return counts.company > 0 || counts.contractors > 0 || counts.unitPrice > 0;
}

/** ログイン中ユーザーの所属orgを1件解決する（Phase 1は1ユーザー1事業者）。 */
export async function resolveOrganizationId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: userData, error: userError } = await sb.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    orgCache = null;
    return null;
  }
  if (orgCache && orgCache.userId === user.id) return orgCache.organizationId;

  const { data, error } = await sb
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  orgCache = { userId: user.id, organizationId: data.organization_id };
  return data.organization_id;
}

/** Supabaseコンテキスト。移行書き込みはこの非ゲート経路を使う。 */
export async function resolveSupabaseContext(): Promise<SupabaseContext | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getSession();
    const user = data.session?.user;
    if (error || !user) return null;
    const organizationId = await resolveOrganizationId();
    if (!organizationId) return null;
    return { sb, organizationId, userId: user.id };
  } catch {
    return null;
  }
}

async function loadCloudPhase1Snapshot(ctx: SupabaseContext, force = false): Promise<Phase1DataSnapshot> {
  const scope = `${ctx.userId}:${ctx.organizationId}`;
  if (!force && cloudSnapshotCache?.scope === scope) return cloudSnapshotCache.value;

  const [company, contractors, unitPrices] = await Promise.all([
    ctx.sb.from("company_settings").select("id, company_name").eq("organization_id", ctx.organizationId),
    ctx.sb.from("contractors").select("local_ref").eq("organization_id", ctx.organizationId),
    ctx.sb.from("unit_price_master").select("local_ref").eq("organization_id", ctx.organizationId),
  ]);
  const error = company.error ?? contractors.error ?? unitPrices.error;
  if (error) throw new Error(error.message);

  const value: Phase1DataSnapshot = {
    counts: {
      // 空の初期行だけでは、自社情報を移行できたとは判定しない。
      company: (company.data ?? []).filter((row) => row.company_name?.trim()).length,
      contractors: contractors.data?.length ?? 0,
      unitPrice: unitPrices.data?.length ?? 0,
    },
    contractorRefs: (contractors.data ?? []).map((row) => row.local_ref ?? ""),
    unitPriceRefs: (unitPrices.data ?? []).map((row) => row.local_ref ?? ""),
  };
  cloudSnapshotCache = { scope, value };
  return value;
}

/** 件数とlocal_refをカテゴリ別に照合する。接続失敗は完了扱いにしない。 */
export async function getPhase1MigrationProgress(
  ctx?: SupabaseContext,
  options?: { forceCloudRefresh?: boolean },
): Promise<Phase1MigrationProgress | null> {
  const resolved = ctx ?? (await resolveSupabaseContext());
  if (!resolved) return null;
  const local = getLocalPhase1Snapshot();
  try {
    const cloud = await loadCloudPhase1Snapshot(resolved, options?.forceCloudRefresh ?? false);
    return buildPhase1MigrationProgress(local, cloud, true);
  } catch {
    const emptyCloud: Phase1DataSnapshot = {
      counts: { company: 0, contractors: 0, unitPrice: 0 },
      contractorRefs: [],
      unitPriceRefs: [],
    };
    return buildPhase1MigrationProgress(local, emptyCloud, false);
  }
}

/** 現在のuser＋organization専用の移行状態だけを読む。旧固定キーは意図的に再利用しない。 */
export function readScopedMigrationState(ctx: SupabaseContext): StoredPhase1MigrationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(phase1MigrationStorageKey(ctx.userId, ctx.organizationId));
    if (!raw) return null;
    const state = JSON.parse(raw) as StoredPhase1MigrationState;
    if (
      state.version !== PHASE1_MIGRATION_VERSION ||
      state.userId !== ctx.userId ||
      state.organizationId !== ctx.organizationId
    ) return null;
    return state;
  } catch {
    return null;
  }
}

/** 部分移行もカテゴリ別に記録する。正本切替はライブ検証結果で別途判断する。 */
export function writeScopedMigrationState(ctx: SupabaseContext, progress: Phase1MigrationProgress): void {
  if (typeof window === "undefined") return;
  try {
    const state = toStoredPhase1MigrationState(ctx.userId, ctx.organizationId, progress);
    localStorage.setItem(phase1MigrationStorageKey(ctx.userId, ctx.organizationId), JSON.stringify(state));
    // 旧固定キーはユーザー混同の原因になるため、新形式保存時にのみ安全に除去する。
    localStorage.removeItem(LEGACY_MIGRATION_KEY);
  } catch {
    // 記録できなくても、local_ref照合で再実行時の重複は防止できる。
  }
}

/**
 * 3カテゴリすべてのクラウド反映が確認できた場合だけSupabaseを正本にする。
 * ローカルデータが0件の新端末は、移行対象なしなのでクラウドを表示できる。
 */
export async function activeBackend(): Promise<ActiveBackend> {
  const ctx = await resolveSupabaseContext();
  if (!ctx) {
    return { mode: "local", organizationId: null, userId: null, needsMigration: false, migrationProgress: null };
  }

  const progress = await getPhase1MigrationProgress(ctx);
  if (!progress || !progress.allCompleted) {
    return {
      mode: "local",
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      needsMigration: hasLocalBusinessData(),
      migrationProgress: progress,
    };
  }

  return {
    mode: "supabase",
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    needsMigration: false,
    migrationProgress: progress,
  };
}

export async function isSignedIn(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { data, error } = await sb.auth.getSession();
  return !error && !!data.session?.user;
}

/** サインイン・アウト・移行後は別ユーザー／最新クラウド状態を必ず再評価する。 */
export function clearBackendCache(): void {
  orgCache = null;
  cloudSnapshotCache = null;
}
