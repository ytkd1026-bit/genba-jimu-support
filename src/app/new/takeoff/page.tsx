"use client";

// 新UI 拾い出し（/new/takeoff）
// ─────────────────────────────────────────────────────────────
// 「測る→話す→構造化→数量計算→確認・修正→保存→見積・発注へ反映」の中核画面。
// ・数量計算は _lib/takeoff/engine.ts（決定論）に委譲。生成AIに算数を渡さない。
// ・音声は Web Speech API（useVoice）。未対応端末は手入力のみで完結する。
// ・DB変更なし：確定データは既存 workItemsStore / savedMaterialOrders へ書き、
//   下書きのみ新規キー genba_takeoff_draft_v1（既存キーには触らない）。
// ・?projectId= で案件詳細からの起動に対応（案件を自動セット）。

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "../_components/PageHeader";
import { loadProjects, type Project } from "../_lib/data";
import {
  TAKEOFF_ORDER,
  TAKEOFF_CONFIGS,
  type TakeoffType,
  type TakeoffEntry,
  type WallpaperLine,
  parseDimension,
  type DimParseResult,
  summarizeWallpaper,
  summarizeArea,
  calculateLength,
} from "../_lib/takeoff/engine";
import { parseUtterance, type UtteranceAction } from "../_lib/takeoff/parseUtterance";
import { useVoice } from "../_lib/takeoff/useVoice";
import {
  workItemsStore,
  issueWorkItemId,
  createEmptyWorkItem,
  computeWorkItemAmounts,
} from "@/app/utils/workItems";
import { advanceProjectStatus } from "@/app/utils/projects";
import { upsertMaterialOrder, type SavedMaterialRow } from "@/app/utils/savedMaterialOrders";

// ─── 下書き（新規キー。既存localStorageキーには一切触れない） ──
const DRAFT_KEY = "genba_takeoff_draft_v1";

type TakeoffDraft = {
  takeoffType: TakeoffType;
  projectId: string | null;
  projectName: string;
  entries: TakeoffEntry[];
  lossByProduct: Record<string, number>;
  savedAt: string;
};

function loadDraft(): TakeoffDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as TakeoffDraft) : null;
  } catch {
    return null;
  }
}

// ─── 共通ヘルパ ──────────────────────────────────────────────
let seq = 0;
function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

function fmt(n: number, digits = 2): string {
  return (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString("ja-JP", {
    maximumFractionDigits: digits,
  });
}

function fmtM(m: number): string {
  return `${fmt(m, 3)}m`;
}

const LOSS_PRESETS = [0, 5, 10, 15];

type Step = "type" | "input" | "confirm" | "summary";

const STEP_LABELS: Record<Step, string> = {
  type: "工種選択",
  input: "入力",
  confirm: "確認・修正",
  summary: "集計・反映",
};

// 曖昧寸法の確認待ち
type PendingDim = {
  raw: string;
  count: number;
  candidates: Array<{ label: string; meters: number }>;
  target: "line" | "flow" | "width";
};

// 音声ログ（最新が先頭）
type VoiceLogItem = { id: string; text: string; note: string; ok: boolean };

// ─── 本体 ────────────────────────────────────────────────────
function TakeoffInner() {
  const searchParams = useSearchParams();

  // ?type= はSSR時に読める（useSearchParamsはSuspense内でサーバーでも解決される）。
  // 初期stateをURLから導出することで、hydration前・JS無効でも
  // 「工種タップ→STEP2表示」がサーバーHTMLだけで成立する。
  const initialTypeParam = searchParams.get("type");
  const initialType: TakeoffType | null =
    initialTypeParam && initialTypeParam in TAKEOFF_CONFIGS
      ? (initialTypeParam as TakeoffType)
      : null;
  const [step, setStep] = useState<Step>(initialType ? "input" : "type");
  const [takeoffType, setTakeoffType] = useState<TakeoffType | null>(initialType);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const [entries, setEntries] = useState<TakeoffEntry[]>([]);
  const [lossByProduct, setLossByProduct] = useState<Record<string, number>>({});

  // クロス入力コンテキスト
  const [room, setRoom] = useState("");
  const [part, setPart] = useState("壁");
  const [product, setProduct] = useState("");

  // 床系入力フォーム
  const [floorForm, setFloorForm] = useState({
    room: "", product: "", flowRaw: "", widthRaw: "",
    materialWidthMm: "", lossRate: "0", flowDir: "", jointDir: "",
  });

  // 手入力（クロス寸法）
  const [manualDim, setManualDim] = useState("");
  const [manualCount, setManualCount] = useState("1");

  const [pendingDim, setPendingDim] = useState<PendingDim | null>(null);
  const [voiceLog, setVoiceLog] = useState<VoiceLogItem[]>([]);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<TakeoffDraft | null>(null);
  const [applied, setApplied] = useState<{ estimate: boolean; order: boolean }>({
    estimate: false, order: false,
  });

  // 「一つ戻る」用スナップショット（最大10）
  const undoStack = useRef<TakeoffEntry[][]>([]);
  function pushUndo(current: TakeoffEntry[]) {
    undoStack.current = [...undoStack.current.slice(-9), current];
  }
  function undo() {
    const prev = undoStack.current.pop();
    if (prev) {
      setEntries(prev);
      flash(true, "一つ戻しました。");
    } else {
      flash(false, "戻る操作の履歴がありません。");
    }
  }

  const config = takeoffType ? TAKEOFF_CONFIGS[takeoffType] : null;
  const isWallpaper = takeoffType === "wallpaper";

  function flash(ok: boolean, text: string) {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 4000);
  }

  // ── ?type=（工種選択Linkからの遷移）をstateへ反映 ────────────
  // STEP1はネイティブ<a>遷移（iPhone Safariで最も確実）。URLが正なのでここで同期する。
  const typeParam = searchParams.get("type");
  useEffect(() => {
    if (typeParam && typeParam in TAKEOFF_CONFIGS) {
      const t = typeParam as TakeoffType;
      setTakeoffType(t);
      setStep((s) => (s === "type" ? "input" : s));
    }
  }, [typeParam]);

  // ── 初期化：案件リスト＋?projectId=＋下書き ──────────────────
  useEffect(() => {
    const ps = loadProjects();
    setProjects(ps);
    const qId = searchParams.get("projectId");
    if (qId) {
      const p = ps.find((x) => x.projectId === qId);
      if (p) {
        setProjectId(p.projectId);
        setProjectName(p.projectName || p.projectId);
      }
    }
    setDraft(loadDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function restoreDraft() {
    if (!draft) return;
    setTakeoffType(draft.takeoffType);
    setEntries(draft.entries);
    setLossByProduct(draft.lossByProduct);
    if (draft.projectId) {
      setProjectId(draft.projectId);
      setProjectName(draft.projectName);
    }
    setStep(draft.entries.length > 0 ? "confirm" : "input");
    setDraft(null);
    flash(true, "下書きを復元しました。");
  }

  function saveDraft() {
    if (!takeoffType) return;
    const d: TakeoffDraft = {
      takeoffType,
      projectId,
      projectName,
      entries,
      lossByProduct,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      flash(true, "下書きを保存しました（この端末内）。");
    } catch {
      flash(false, "下書きの保存に失敗しました。");
    }
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    setDraft(null);
  }

  // ── クロス：明細追加 ─────────────────────────────────────────
  const appendWallpaperLine = useCallback(
    (meters: number, dimRaw: string, count: number) => {
      if (!room.trim()) {
        flash(false, "先に部屋名を入れてください。");
        return false;
      }
      setEntries((prev) => {
        pushUndo(prev);
        const idx = prev.findIndex(
          (e) => e.room === room && e.part === part && e.product === product,
        );
        const line: WallpaperLine = { id: newId("wl"), dimRaw, meters, count };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], lines: [...(next[idx].lines ?? []), line] };
          return next;
        }
        return [...prev, { id: newId("we"), room, part, product, lines: [line] }];
      });
      return true;
    },
    [room, part, product],
  );

  function handleDimInput(raw: string, count: number, target: PendingDim["target"] = "line") {
    const dim = parseDimension(raw);
    if (dim.meters !== null && !dim.ambiguous) {
      applyDim(dim.meters, dim.raw, count, target);
      return true;
    }
    if (dim.candidates.length > 0) {
      setPendingDim({
        raw, count, target,
        candidates: dim.candidates.map((c) => ({ label: c.label, meters: c.meters })),
      });
      flash(false, `「${raw}」の単位が曖昧です。候補から選んでください。`);
    } else {
      flash(false, `「${raw}」を寸法として解釈できませんでした。`);
    }
    return false;
  }

  function applyDim(meters: number, raw: string, count: number, target: PendingDim["target"]) {
    if (target === "line") {
      if (appendWallpaperLine(meters, raw, count)) {
        flash(true, `${raw} × ${count}本 → ${fmtM(calculateLength(meters, count))}`);
      }
    } else if (target === "flow") {
      setFloorForm((f) => ({ ...f, flowRaw: raw }));
    } else {
      setFloorForm((f) => ({ ...f, widthRaw: raw }));
    }
  }

  // ── 音声 ────────────────────────────────────────────────────
  const logVoice = useCallback((text: string, note: string, ok: boolean) => {
    setVoiceLog((prev) => [{ id: newId("vl"), text, note, ok }, ...prev].slice(0, 6));
  }, []);

  const handleUtterance = useCallback(
    (transcript: string) => {
      const action: UtteranceAction = parseUtterance(transcript);
      switch (action.kind) {
        case "command":
          switch (action.command) {
            case "delete_last":
            case "undo":
              undo();
              logVoice(transcript, "一つ戻る", true);
              break;
            case "next":
              setProduct("");
              logVoice(transcript, "次の品番へ（品番をクリア）", true);
              break;
            case "same_product":
              logVoice(transcript, "品番を維持", true);
              break;
            case "same_room":
              logVoice(transcript, "部屋を維持", true);
              break;
            case "change_room":
              setRoom("");
              logVoice(transcript, "部屋名を再指定してください", true);
              break;
            case "correct":
              undo();
              logVoice(transcript, "訂正（一つ戻る）", true);
              break;
            case "finish":
              voice.stop();
              setStep("confirm");
              logVoice(transcript, "入力を終了し確認へ", true);
              break;
          }
          break;
        case "part":
          if (isWallpaper) {
            setPart(action.part);
            logVoice(transcript, `部位 → ${action.part}`, true);
          } else {
            logVoice(transcript, "この工種では部位指定は使いません", false);
          }
          break;
        case "product":
          if (isWallpaper) setProduct(action.product);
          else setFloorForm((f) => ({ ...f, product: action.product }));
          logVoice(transcript, `品番 → ${action.product}`, true);
          break;
        case "dimension": {
          if (isWallpaper) {
            const ok = action.dim.meters !== null && !action.dim.ambiguous;
            handleDimInput(action.dim.raw, action.count, "line");
            logVoice(
              transcript,
              ok
                ? `${action.dim.raw} × ${action.count}本`
                : "単位が曖昧なため確認が必要です",
              ok,
            );
          } else {
            // 床系：流し→幅の順に埋める
            const target = floorForm.flowRaw === "" ? "flow" : "width";
            const ok = action.dim.meters !== null && !action.dim.ambiguous;
            handleDimInput(action.dim.raw, 1, target);
            logVoice(transcript, ok ? `${target === "flow" ? "流し" : "幅"} → ${action.dim.raw}` : "単位が曖昧です", ok);
          }
          break;
        }
        case "flow_dim": {
          const ok = action.dim.meters !== null && !action.dim.ambiguous;
          handleDimInput(action.dim.raw, 1, "flow");
          setFloorForm((f) => ({ ...f, flowDir: "指定あり" }));
          logVoice(transcript, ok ? `流し方向 → ${action.dim.raw}` : "単位が曖昧です", ok);
          break;
        }
        case "width_dim": {
          const ok = action.dim.meters !== null && !action.dim.ambiguous;
          handleDimInput(action.dim.raw, 1, "width");
          logVoice(transcript, ok ? `幅方向 → ${action.dim.raw}` : "単位が曖昧です", ok);
          break;
        }
        case "room":
          if (isWallpaper) setRoom(action.room);
          else setFloorForm((f) => ({ ...f, room: action.room }));
          logVoice(transcript, `部屋 → ${action.room}`, true);
          break;
        default:
          logVoice(transcript, "解釈できませんでした（手入力できます）", false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isWallpaper, floorForm.flowRaw, appendWallpaperLine, logVoice],
  );

  const voice = useVoice({
    onResult: handleUtterance,
    onError: (msg) => flash(false, `${msg}。再入力するか、下の手入力をご利用ください。`),
  });

  // ── 床系：エントリ追加 ───────────────────────────────────────
  function addFloorEntry() {
    if (!config) return;
    const flow = parseDimension(floorForm.flowRaw);
    const width = parseDimension(floorForm.widthRaw);
    if (!floorForm.room.trim()) return flash(false, "部屋名を入れてください。");
    if (flow.meters === null || flow.ambiguous)
      return flash(false, "流し方向の寸法を確認してください。");
    if (width.meters === null || width.ambiguous)
      return flash(false, "幅方向の寸法を確認してください。");
    const matMm = floorForm.materialWidthMm.trim() === ""
      ? config.materialWidthMm
      : parseFloat(floorForm.materialWidthMm);
    const loss = parseFloat(floorForm.lossRate) || 0;

    setEntries((prev) => {
      pushUndo(prev);
      return [
        ...prev,
        {
          id: newId("fe"),
          room: floorForm.room,
          product: floorForm.product,
          flowRaw: floorForm.flowRaw, flowM: flow.meters!,
          widthRaw: floorForm.widthRaw, widthM: width.meters!,
          materialWidthMm: matMm,
          lossRate: loss,
          flowDir: floorForm.flowDir || undefined,
          jointDir: floorForm.jointDir || undefined,
        },
      ];
    });
    flash(true, `${floorForm.room} を追加しました。`);
    setFloorForm((f) => ({ ...f, flowRaw: "", widthRaw: "" }));
  }

  // ── 集計 ────────────────────────────────────────────────────
  const wallpaperSummary = useMemo(
    () => (isWallpaper ? summarizeWallpaper(entries, lossByProduct) : null),
    [isWallpaper, entries, lossByProduct],
  );
  const areaSummary = useMemo(
    () => (!isWallpaper && config ? summarizeArea(entries, config) : null),
    [isWallpaper, config, entries],
  );

  // ── 反映：見積（既存 WorkItem を再利用） ─────────────────────
  function applyToEstimate() {
    if (!config) return;
    if (!projectId) {
      setShowProjectPicker(true);
      flash(false, "反映先の案件を選択してください。");
      return;
    }
    const now = new Date().toISOString();
    let count = 0;
    if (isWallpaper && wallpaperSummary) {
      for (const p of wallpaperSummary.byProduct) {
        const w = createEmptyWorkItem(projectId, issueWorkItemId(projectId));
        const rooms = [...new Set(p.breakdown.map((b) => b.room))].join("・");
        const quantity = p.orderQty;
        const filled = {
          ...w,
          category: "内装工事",
          workName: `クロス貼り ${p.product}`,
          workDescription: `拾い出しより（${rooms}）`,
          location1: rooms,
          quantity,
          unit: "m",
          note: p.lossRate > 0 ? `ロス${p.lossRate}%込み` : "",
          createdAt: now,
          updatedAt: now,
        };
        const amounts = computeWorkItemAmounts({
          quantity, sellingUnitPrice: 0,
          materialCost: 0, laborCost: 0, subcontractCost: 0, expenseCost: 0, otherCost: 0,
        });
        if (workItemsStore.upsert({ ...filled, ...amounts })) count++;
      }
    } else if (areaSummary) {
      for (const p of areaSummary.byProduct) {
        const w = createEmptyWorkItem(projectId, issueWorkItemId(projectId));
        const rooms = [
          ...new Set(areaSummary.entries.filter((e) => (e.product || "(品番未設定)") === p.product).map((e) => e.room)),
        ].join("・");
        const quantity = p.estimateValue;
        const filled = {
          ...w,
          category: "床工事",
          workName: `${config.label} ${p.product !== "(品番未設定)" ? p.product : ""}`.trim(),
          workDescription: `拾い出しより（${rooms}）`,
          location1: rooms,
          quantity,
          unit: p.estimateUnit,
          createdAt: now,
          updatedAt: now,
        };
        const amounts = computeWorkItemAmounts({
          quantity, sellingUnitPrice: 0,
          materialCost: 0, laborCost: 0, subcontractCost: 0, expenseCost: 0, otherCost: 0,
        });
        if (workItemsStore.upsert({ ...filled, ...amounts })) count++;
      }
    }
    if (count > 0) {
      advanceProjectStatus(projectId, "estimating");
      setApplied((a) => ({ ...a, estimate: true }));
      flash(true, `${count}件を工事項目として見積へ反映しました（単価は見積画面で入力）。`);
    } else {
      flash(false, "反映できる集計行がありません。");
    }
  }

  // ── 反映：発注候補（既存 savedMaterialOrders を再利用） ──────
  function applyToOrder() {
    if (!config) return;
    const rows: SavedMaterialRow[] = [];
    let rid = 1;
    const emptyRow = {
      location2: "", unitPrice: "", orderNote: "", supplier: "",
      isSupplied: false, isOrdered: false, orderDate: "", deliveryDate: "", deliveryNote: "",
    };
    if (isWallpaper && wallpaperSummary) {
      for (const p of wallpaperSummary.byProduct) {
        rows.push({
          id: rid++,
          koujiType: config.label,
          location1: [...new Set(p.breakdown.map((b) => b.room))].join("・"),
          qty: String(p.orderQty),
          unit: "m",
          lossRate: String(p.lossRate),
          itemName: p.product,
          ...emptyRow,
        });
      }
    } else if (areaSummary) {
      for (const p of areaSummary.byProduct) {
        rows.push({
          id: rid++,
          koujiType: config.label,
          location1: [
            ...new Set(areaSummary.entries.filter((e) => (e.product || "(品番未設定)") === p.product).map((e) => e.room)),
          ].join("・"),
          qty: String(p.orderValue),
          unit: p.orderUnit,
          lossRate: "",
          itemName: p.product === "(品番未設定)" ? "" : p.product,
          ...emptyRow,
        });
      }
    }
    if (rows.length === 0) {
      flash(false, "反映できる集計行がありません。");
      return;
    }
    const now = new Date().toISOString();
    upsertMaterialOrder({
      id: `takeoff-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      projectId: projectId ?? undefined,
      projectName: projectName || "（拾い出し）",
      rows,
      totalMaterialCost: 0,
    });
    setApplied((a) => ({ ...a, order: true }));
    flash(true, `発注候補として${rows.length}行を保存しました（材料・発注画面で確認できます）。`);
  }

  function selectProject(p: Project) {
    setProjectId(p.projectId);
    setProjectName(p.projectName || p.projectId);
    setShowProjectPicker(false);
  }

  // ── 描画 ────────────────────────────────────────────────────
  const stepsOrder: Step[] = ["type", "input", "confirm", "summary"];

  return (
    <div>
      <PageHeader
        title="拾い出し"
        subtitle={config ? `${config.label}${projectName ? `｜${projectName}` : ""}` : "音声で採寸を数量にする"}
        back="/new/create"
      />

      {/* ステップバー */}
      <div className="px-4 pt-3">
        <ol className="flex items-center gap-1">
          {stepsOrder.map((s, i) => {
            const active = step === s;
            const done = stepsOrder.indexOf(step) > i;
            return (
              <li key={s} className="flex flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    // 戻り方向のみタップ移動可（前提未満のステップへは飛ばない）
                    if (done || active) setStep(s);
                    else if (s === "confirm" && takeoffType) setStep(s);
                    else if (s === "summary" && entries.length > 0) setStep(s);
                  }}
                  className={`flex min-h-[44px] w-full items-center justify-center rounded-xl px-1 py-1.5 text-center text-[11px] font-semibold ${
                    active
                      ? "bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                      : done
                      ? "bg-[var(--nu-primary-bg)] text-[var(--nu-primary-dk)]"
                      : "bg-white text-slate-400 ring-1 ring-[var(--nu-border)]"
                  }`}
                >
                  {i + 1} {STEP_LABELS[s]}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* 通知 */}
      {notice && (
        <div className="px-4 pt-2">
          <p
            className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${
              notice.ok
                ? "bg-[var(--nu-primary-bg)] text-[var(--nu-primary-dk)] ring-[var(--nu-border)]"
                : "bg-rose-50 text-rose-700 ring-rose-200"
            }`}
          >
            {notice.text}
          </p>
        </div>
      )}

      {/* 下書き復元 */}
      {draft && step === "type" && (
        <div className="px-4 pt-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-800">
              保存済みの拾い出し下書きがあります（
              {new Date(draft.savedAt).toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" })}
              ・{TAKEOFF_CONFIGS[draft.takeoffType].label}・{draft.entries.length}件）
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={restoreDraft}
                className="min-h-[44px] flex-1 rounded-xl bg-amber-600 text-xs font-bold text-white active:opacity-80">
                復元する
              </button>
              <button type="button" onClick={discardDraft}
                className="min-h-[44px] flex-1 rounded-xl border border-amber-300 bg-white text-xs font-bold text-amber-700 active:opacity-80">
                破棄する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 px-4 py-4">
        {/* ══ STEP 1：工種選択 ══ */}
        {step === "type" && (
          <>
            <section>
              <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">拾い出しを開始</h2>
              <div className="grid grid-cols-2 gap-3">
                {TAKEOFF_ORDER.map((t) => {
                  const c = TAKEOFF_CONFIGS[t];
                  // iPhone Safari実機でReact onClickが届かない事例があったため、
                  // 工種選択は<a>（Link）にする。アンカーはhydration完了前でも
                  // ネイティブ遷移で確実に動く（?type= を効果で拾ってSTEP2へ）。
                  return (
                    <Link
                      key={t}
                      href={`/new/takeoff?type=${t}`}
                      className="flex min-h-[76px] flex-col items-start rounded-2xl border border-[var(--nu-border)] bg-white p-4 text-left shadow-sm active:bg-[var(--nu-primary-bg)]"
                    >
                      <span className="text-base font-bold text-[var(--nu-text)]">{c.label}</span>
                      <span className="mt-1 text-[11px] text-slate-500">
                        発注 {c.orderUnit}／見積 {c.estimateUnit}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            {/* 案件選択（任意） */}
            <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--nu-text)]">案件（任意）</h2>
                <button
                  type="button"
                  onClick={() => setShowProjectPicker((v) => !v)}
                  className="flex min-h-[44px] items-center rounded-xl bg-[var(--nu-primary-bg)] px-4 py-2 text-xs font-semibold text-[var(--nu-primary-dk)] active:opacity-80"
                >
                  {projectId ? "変更" : "案件を選ぶ"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {projectId ? `反映先：${projectName}` : "後から集計画面でも選べます。"}
              </p>
              {showProjectPicker && (
                <ProjectPicker projects={projects} onSelect={selectProject} />
              )}
            </section>
          </>
        )}

        {/* ══ STEP 2：入力 ══ */}
        {step === "input" && config && (
          <>
            {/* 音声パネル */}
            <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-[var(--nu-text)]">
                    {config.label} 拾い出し
                  </h2>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {voice.supported
                      ? "話すと自動で数量になります（手入力も可）"
                      : "この端末は音声非対応です。手入力をご利用ください。"}
                  </p>
                </div>
                {voice.supported && (
                  <button
                    type="button"
                    onClick={() => (voice.listening ? voice.stop() : voice.start())}
                    aria-pressed={voice.listening}
                    className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-[10px] font-bold text-white shadow-md active:scale-95 ${
                      voice.listening ? "animate-pulse bg-rose-500" : "bg-[var(--nu-primary)]"
                    }`}
                  >
                    <span className="text-2xl leading-none">🎙</span>
                    {voice.listening ? "停止" : "開始"}
                  </button>
                )}
              </div>
              {voice.listening && (
                <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-200">
                  ● 録音中… {voice.interim || "どうぞ話してください"}
                </p>
              )}
              {/* 認識ログ */}
              {voiceLog.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {voiceLog.map((l) => (
                    <li key={l.id} className="flex items-start gap-1.5 text-[11px]">
                      <span>{l.ok ? "✅" : "⚠️"}</span>
                      <span className="min-w-0">
                        <span className="font-semibold text-[var(--nu-text)]">「{l.text}」</span>
                        <span className="text-slate-500"> → {l.note}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 曖昧寸法の確認 */}
            {pendingDim && (
              <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="text-sm font-bold text-amber-800">
                  「{pendingDim.raw}」はどちらですか？
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {pendingDim.candidates.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => {
                        applyDim(c.meters, pendingDim.raw, pendingDim.count, pendingDim.target);
                        setPendingDim(null);
                      }}
                      className="min-h-[48px] rounded-xl bg-white px-3 text-sm font-bold text-amber-800 ring-1 ring-amber-300 active:opacity-80"
                    >
                      {c.label}
                      {pendingDim.target === "line" && ` × ${pendingDim.count}本`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPendingDim(null)}
                    className="min-h-[44px] rounded-xl text-xs font-semibold text-amber-700 active:opacity-70"
                  >
                    やり直す
                  </button>
                </div>
              </section>
            )}

            {isWallpaper ? (
              <WallpaperInput
                room={room} part={part} product={product}
                setRoom={setRoom} setPart={setPart} setProduct={setProduct}
                parts={config.parts ?? []}
                manualDim={manualDim} setManualDim={setManualDim}
                manualCount={manualCount} setManualCount={setManualCount}
                onAdd={() => {
                  const c = Math.max(1, parseInt(manualCount, 10) || 1);
                  if (handleDimInput(manualDim, c, "line")) {
                    setManualDim("");
                    setManualCount("1");
                  }
                }}
                entries={entries}
                onUndo={undo}
              />
            ) : (
              <FloorInput
                config={config}
                form={floorForm}
                setForm={setFloorForm}
                onAdd={addFloorEntry}
                entryCount={entries.length}
                onUndo={undo}
              />
            )}

            {/* 次へ */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveDraft}
                className="min-h-[52px] flex-1 rounded-2xl border border-[var(--nu-border)] bg-white text-sm font-bold text-[var(--nu-text)] active:bg-[var(--nu-bg)]"
              >
                下書き保存
              </button>
              <button
                type="button"
                disabled={entries.length === 0}
                onClick={() => { voice.stop(); setStep("confirm"); }}
                className="min-h-[52px] flex-[2] rounded-2xl bg-[var(--nu-primary)] text-sm font-bold text-[var(--nu-on-primary)] shadow-sm active:bg-[var(--nu-primary-dk)] disabled:opacity-40"
              >
                確認へ進む（{entries.length}件）
              </button>
            </div>
          </>
        )}

        {/* ══ STEP 3：確認・修正 ══ */}
        {step === "confirm" && config && (
          <>
            <p className="px-1 text-xs text-slate-500">
              部屋別に表示しています。タップして修正できます。
            </p>
            {entries.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--nu-border)] bg-white px-4 py-8 text-center text-sm text-slate-500">
                まだ入力がありません。
              </p>
            ) : isWallpaper ? (
              <WallpaperConfirm
                entries={entries}
                setEntries={(updater) => setEntries((prev) => { pushUndo(prev); return updater(prev); })}
              />
            ) : (
              <FloorConfirm
                config={config}
                entries={entries}
                setEntries={(updater) => setEntries((prev) => { pushUndo(prev); return updater(prev); })}
              />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="min-h-[52px] flex-1 rounded-2xl border border-[var(--nu-border)] bg-white text-sm font-bold text-[var(--nu-text)] active:bg-[var(--nu-bg)]"
              >
                入力に戻る
              </button>
              <button
                type="button"
                disabled={entries.length === 0}
                onClick={() => setStep("summary")}
                className="min-h-[52px] flex-[2] rounded-2xl bg-[var(--nu-primary)] text-sm font-bold text-[var(--nu-on-primary)] shadow-sm active:bg-[var(--nu-primary-dk)] disabled:opacity-40"
              >
                集計へ進む
              </button>
            </div>
          </>
        )}

        {/* ══ STEP 4：集計・反映 ══ */}
        {step === "summary" && config && (
          <>
            {isWallpaper && wallpaperSummary ? (
              <WallpaperSummaryView
                summary={wallpaperSummary}
                lossByProduct={lossByProduct}
                setLossByProduct={setLossByProduct}
              />
            ) : areaSummary ? (
              <AreaSummaryView config={config} summary={areaSummary} />
            ) : null}

            {/* 反映先案件 */}
            <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[var(--nu-text)]">反映先の案件</h2>
                <button
                  type="button"
                  onClick={() => setShowProjectPicker((v) => !v)}
                  className="flex min-h-[44px] items-center rounded-xl bg-[var(--nu-primary-bg)] px-4 py-2 text-xs font-semibold text-[var(--nu-primary-dk)] active:opacity-80"
                >
                  {projectId ? "変更" : "案件を選ぶ"}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {projectId ? projectName : "見積へ反映するには案件の選択が必要です。"}
              </p>
              {showProjectPicker && <ProjectPicker projects={projects} onSelect={selectProject} />}
            </section>

            {/* アクション */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={applyToEstimate}
                className="min-h-[52px] w-full rounded-2xl bg-[var(--nu-primary)] text-sm font-bold text-[var(--nu-on-primary)] shadow-sm active:bg-[var(--nu-primary-dk)]"
              >
                {applied.estimate ? "✅ 見積へ反映済み（再反映で行追加）" : "見積へ反映（工事項目を作成）"}
              </button>
              {applied.estimate && projectId && (
                <Link
                  href={`/new/projects/${encodeURIComponent(projectId)}/estimate`}
                  className="flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-[var(--nu-primary-bg)] text-sm font-bold text-[var(--nu-primary-dk)] active:opacity-80"
                >
                  見積・原価入力を開く ›
                </Link>
              )}
              <button
                type="button"
                onClick={applyToOrder}
                className="min-h-[52px] w-full rounded-2xl border border-[var(--nu-primary)] bg-white text-sm font-bold text-[var(--nu-primary-dk)] active:bg-[var(--nu-primary-bg)]"
              >
                {applied.order ? "✅ 発注候補に追加済み（再追加可）" : "発注候補へ追加（材料リスト保存）"}
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="min-h-[52px] w-full rounded-2xl border border-[var(--nu-border)] bg-white text-sm font-bold text-[var(--nu-text)] active:bg-[var(--nu-bg)]"
              >
                下書きとして保存
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 案件ピッカー ────────────────────────────────────────────
function ProjectPicker({
  projects,
  onSelect,
}: {
  projects: Project[];
  onSelect: (p: Project) => void;
}) {
  if (projects.length === 0) {
    return <p className="mt-2 text-xs text-slate-400">案件がまだありません。</p>;
  }
  return (
    <ul className="mt-2 max-h-60 space-y-1.5 overflow-y-auto">
      {projects.map((p) => (
        <li key={p.projectId}>
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="w-full rounded-xl border border-[var(--nu-border)] bg-[var(--nu-bg)] px-3 py-2.5 text-left active:bg-[var(--nu-primary-bg)]"
          >
            <span className="block truncate text-sm font-semibold text-[var(--nu-text)]">
              {p.projectName || "（名称未設定）"}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {p.clientName || p.customerName || p.projectId}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── クロス：入力ビュー ──────────────────────────────────────
const inputCls =
  "w-full rounded-xl border border-[var(--nu-border)] bg-white px-3 py-2.5 text-base text-[var(--nu-text)] outline-none focus:border-[var(--nu-primary)] focus:ring-2 focus:ring-[var(--nu-primary)]/20";
const lblCls = "mb-1 block text-xs font-semibold text-slate-500";

function WallpaperInput(props: {
  room: string; part: string; product: string;
  setRoom: (v: string) => void; setPart: (v: string) => void; setProduct: (v: string) => void;
  parts: string[];
  manualDim: string; setManualDim: (v: string) => void;
  manualCount: string; setManualCount: (v: string) => void;
  onAdd: () => void;
  entries: TakeoffEntry[];
  onUndo: () => void;
}) {
  const {
    room, part, product, setRoom, setPart, setProduct, parts,
    manualDim, setManualDim, manualCount, setManualCount, onAdd, entries, onUndo,
  } = props;

  // 現在コンテキストの明細
  const current = entries.find((e) => e.room === room && e.part === part && e.product === product);
  const currentTotal = (current?.lines ?? []).reduce(
    (s, l) => s + calculateLength(l.meters, l.count), 0,
  );

  return (
    <>
      {/* コンテキスト（部屋・部位・品番） */}
      <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lblCls}>部屋</label>
            <input type="text" value={room} onChange={(e) => setRoom(e.target.value)}
              placeholder="洋室1" className={inputCls} />
          </div>
          <div>
            <label className={lblCls}>品番</label>
            <input type="text" value={product} onChange={(e) => setProduct(e.target.value)}
              placeholder="SP2525" autoCapitalize="characters" className={inputCls} />
          </div>
        </div>
        <div className="mt-2">
          <label className={lblCls}>部位（天井と壁は必ず分ける）</label>
          <div className="flex flex-wrap gap-1.5">
            {parts.map((p) => (
              <button key={p} type="button" onClick={() => setPart(p)}
                className={`min-h-[44px] rounded-xl px-3.5 text-sm font-bold active:opacity-80 ${
                  part === p
                    ? "bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                    : "border border-[var(--nu-border)] bg-white text-slate-600"
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 手入力（寸法×本数） */}
      <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-xs font-bold text-slate-500">寸法を追加（2〜3桁はcm・4桁はmm）</h3>
        <div className="flex items-end gap-2">
          <div className="flex-[2]">
            <label className={lblCls}>寸法</label>
            <input type="text" inputMode="decimal" value={manualDim}
              onChange={(e) => setManualDim(e.target.value)}
              placeholder="245 / 2460 / 2.4m"
              className={inputCls} />
          </div>
          <div className="flex-1">
            <label className={lblCls}>本数</label>
            <input type="text" inputMode="numeric" value={manualCount}
              onChange={(e) => setManualCount(e.target.value)}
              className={inputCls} />
          </div>
          <button type="button" onClick={onAdd}
            className="min-h-[48px] shrink-0 rounded-xl bg-[var(--nu-primary)] px-4 text-sm font-bold text-[var(--nu-on-primary)] active:bg-[var(--nu-primary-dk)]">
            追加
          </button>
        </div>

        {/* 現在コンテキストの明細 */}
        {current && (current.lines ?? []).length > 0 && (
          <div className="mt-3 rounded-xl bg-[var(--nu-bg)] p-3">
            <p className="mb-1 text-[11px] font-semibold text-slate-500">
              {room}｜{part}｜{product || "品番未設定"}
            </p>
            <ul className="space-y-0.5">
              {(current.lines ?? []).map((l) => (
                <li key={l.id} className="flex justify-between text-sm text-[var(--nu-text)]">
                  <span>{l.dimRaw} × {l.count}本</span>
                  <span className="font-semibold">{fmtM(calculateLength(l.meters, l.count))}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 border-t border-[var(--nu-border)] pt-1 text-right text-sm font-bold text-[var(--nu-primary-dk)]">
              小計 {fmtM(currentTotal)}
            </p>
          </div>
        )}

        <button type="button" onClick={onUndo}
          className="mt-2 min-h-[44px] w-full rounded-xl border border-[var(--nu-border)] bg-white text-xs font-bold text-slate-500 active:bg-[var(--nu-bg)]">
          ↩ 一つ戻る
        </button>
      </section>
    </>
  );
}

// ─── 床系：入力ビュー ────────────────────────────────────────
function FloorInput(props: {
  config: (typeof TAKEOFF_CONFIGS)[TakeoffType];
  form: {
    room: string; product: string; flowRaw: string; widthRaw: string;
    materialWidthMm: string; lossRate: string; flowDir: string; jointDir: string;
  };
  setForm: React.Dispatch<React.SetStateAction<FloorInputForm>>;
  onAdd: () => void;
  entryCount: number;
  onUndo: () => void;
}) {
  const { config, form, setForm, onAdd, entryCount, onUndo } = props;
  const isRoll = config.calcKind === "area_rolls";

  return (
    <section className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-xs font-bold text-slate-500">
        {config.label}：部屋を1つずつ追加（2〜3桁はcm・4桁はmm）
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={lblCls}>部屋</label>
          <input type="text" value={form.room}
            onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
            placeholder="洗面室" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>品番</label>
          <input type="text" value={form.product}
            onChange={(e) => setForm((f) => ({ ...f, product: e.target.value }))}
            placeholder="HM12001" autoCapitalize="characters" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>流し方向寸法</label>
          <input type="text" inputMode="decimal" value={form.flowRaw}
            onChange={(e) => setForm((f) => ({ ...f, flowRaw: e.target.value }))}
            placeholder="3600" className={inputCls} />
        </div>
        <div>
          <label className={lblCls}>幅方向寸法</label>
          <input type="text" inputMode="decimal" value={form.widthRaw}
            onChange={(e) => setForm((f) => ({ ...f, widthRaw: e.target.value }))}
            placeholder="2600" className={inputCls} />
        </div>
        {isRoll && (
          <div>
            <label className={lblCls}>材料幅（mm）</label>
            <input type="text" inputMode="numeric" value={form.materialWidthMm}
              onChange={(e) => setForm((f) => ({ ...f, materialWidthMm: e.target.value }))}
              placeholder={String(config.materialWidthMm ?? 1820)} className={inputCls} />
          </div>
        )}
        <div>
          <label className={lblCls}>ロス率（%）</label>
          <div className="flex gap-1">
            {LOSS_PRESETS.map((l) => (
              <button key={l} type="button"
                onClick={() => setForm((f) => ({ ...f, lossRate: String(l) }))}
                className={`min-h-[44px] flex-1 rounded-lg text-xs font-bold active:opacity-80 ${
                  parseFloat(form.lossRate) === l
                    ? "bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                    : "border border-[var(--nu-border)] bg-white text-slate-600"
                }`}>
                {l}
              </button>
            ))}
            <input type="text" inputMode="decimal" value={form.lossRate}
              onChange={(e) => setForm((f) => ({ ...f, lossRate: e.target.value }))}
              className="min-h-[44px] w-14 rounded-lg border border-[var(--nu-border)] px-2 text-center text-sm" />
          </div>
        </div>
        {isRoll && (
          <>
            <div>
              <label className={lblCls}>流し方向（職人判断）</label>
              <select value={form.flowDir}
                onChange={(e) => setForm((f) => ({ ...f, flowDir: e.target.value }))}
                className={inputCls}>
                <option value="">（未指定）</option>
                <option value="奥行方向">奥行方向</option>
                <option value="幅方向">幅方向</option>
              </select>
            </div>
            <div>
              <label className={lblCls}>ジョイント方向</label>
              <select value={form.jointDir}
                onChange={(e) => setForm((f) => ({ ...f, jointDir: e.target.value }))}
                className={inputCls}>
                <option value="">（未指定）</option>
                <option value="流し平行">流し平行</option>
                <option value="流し直交">流し直交</option>
              </select>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onUndo}
          className="min-h-[48px] flex-1 rounded-xl border border-[var(--nu-border)] bg-white text-xs font-bold text-slate-500 active:bg-[var(--nu-bg)]">
          ↩ 一つ戻る
        </button>
        <button type="button" onClick={onAdd}
          className="min-h-[48px] flex-[2] rounded-xl bg-[var(--nu-primary)] text-sm font-bold text-[var(--nu-on-primary)] active:bg-[var(--nu-primary-dk)]">
          ＋ この部屋を追加（現在{entryCount}件）
        </button>
      </div>
    </section>
  );
}

type FloorInputForm = {
  room: string; product: string; flowRaw: string; widthRaw: string;
  materialWidthMm: string; lossRate: string; flowDir: string; jointDir: string;
};

// ─── クロス：確認・修正ビュー ────────────────────────────────
function WallpaperConfirm({
  entries,
  setEntries,
}: {
  entries: TakeoffEntry[];
  setEntries: (updater: (prev: TakeoffEntry[]) => TakeoffEntry[]) => void;
}) {
  // 部屋ごとにグループ化（登場順維持）
  const rooms: string[] = [];
  for (const e of entries) if (!rooms.includes(e.room)) rooms.push(e.room);

  function updateEntry(id: string, patch: Partial<TakeoffEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function updateLine(entryId: string, lineId: string, patch: Partial<WallpaperLine>) {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, lines: (e.lines ?? []).map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }
          : e,
      ),
    );
  }
  function removeLine(entryId: string, lineId: string) {
    setEntries((prev) =>
      prev
        .map((e) =>
          e.id === entryId ? { ...e, lines: (e.lines ?? []).filter((l) => l.id !== lineId) } : e,
        )
        .filter((e) => (e.lines ?? []).length > 0),
    );
  }

  return (
    <div className="space-y-3">
      {rooms.map((r) => (
        <section key={r} className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-bold text-[var(--nu-text)]">{r}</h3>
          <div className="space-y-3">
            {entries.filter((e) => e.room === r).map((e) => {
              const total = (e.lines ?? []).reduce((s, l) => s + calculateLength(l.meters, l.count), 0);
              return (
                <div key={e.id} className="rounded-xl bg-[var(--nu-bg)] p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={e.part ?? "壁"}
                      onChange={(ev) => updateEntry(e.id, { part: ev.target.value })}
                      className="rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-xs font-bold text-[var(--nu-text)]"
                    >
                      {["壁", "天井", "梁", "下がり天井"].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={e.product}
                      onChange={(ev) => updateEntry(e.id, { product: ev.target.value })}
                      placeholder="品番"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-xs font-bold text-[var(--nu-text)]"
                    />
                    <button type="button" onClick={() => removeEntry(e.id)}
                      className="min-h-[36px] shrink-0 rounded-lg px-2 text-xs font-bold text-rose-500 active:bg-rose-50">
                      削除
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {(e.lines ?? []).map((l) => (
                      <EditableLine
                        key={l.id}
                        line={l}
                        onChange={(patch) => updateLine(e.id, l.id, patch)}
                        onRemove={() => removeLine(e.id, l.id)}
                      />
                    ))}
                  </ul>
                  <p className="mt-1.5 text-right text-sm font-bold text-[var(--nu-primary-dk)]">
                    合計 {fmtM(total)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** 明細1行の編集（寸法テキスト＋本数。寸法は再パースして曖昧なら警告） */
function EditableLine({
  line,
  onChange,
  onRemove,
}: {
  line: WallpaperLine;
  onChange: (patch: Partial<WallpaperLine>) => void;
  onRemove: () => void;
}) {
  const [dimText, setDimText] = useState(line.dimRaw);
  const [warn, setWarn] = useState<string | null>(null);

  function commitDim(text: string) {
    const d: DimParseResult = parseDimension(text);
    if (d.meters !== null && !d.ambiguous) {
      onChange({ dimRaw: text, meters: d.meters });
      setWarn(null);
    } else {
      setWarn("寸法を解釈できません（例：245 / 2460 / 2.4m）");
    }
  }

  return (
    <li>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={dimText}
          onChange={(e) => setDimText(e.target.value)}
          onBlur={() => commitDim(dimText)}
          className="w-24 rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-sm text-[var(--nu-text)]"
        />
        <span className="text-xs text-slate-400">×</span>
        <input
          type="text" inputMode="numeric" value={String(line.count)}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n) && n >= 1) onChange({ count: n });
          }}
          className="w-14 rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-center text-sm text-[var(--nu-text)]"
        />
        <span className="text-xs text-slate-400">本</span>
        <span className="ml-auto text-sm font-semibold text-[var(--nu-text)]">
          {fmtM(calculateLength(line.meters, line.count))}
        </span>
        <button type="button" onClick={onRemove}
          className="min-h-[36px] shrink-0 rounded-lg px-1.5 text-xs text-rose-400 active:bg-rose-50">
          ✕
        </button>
      </div>
      {warn && <p className="mt-0.5 text-[11px] text-rose-500">{warn}</p>}
    </li>
  );
}

// ─── 床系：確認・修正ビュー ──────────────────────────────────
function FloorConfirm({
  config,
  entries,
  setEntries,
}: {
  config: (typeof TAKEOFF_CONFIGS)[TakeoffType];
  entries: TakeoffEntry[];
  setEntries: (updater: (prev: TakeoffEntry[]) => TakeoffEntry[]) => void;
}) {
  function update(id: string, patch: Partial<TakeoffEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }
  function remove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }
  function commitDim(id: string, key: "flow" | "width", text: string) {
    const d = parseDimension(text);
    if (d.meters !== null && !d.ambiguous) {
      update(id, key === "flow" ? { flowRaw: text, flowM: d.meters } : { widthRaw: text, widthM: d.meters });
    }
  }

  return (
    <div className="space-y-3">
      {entries.map((e) => {
        const r = summarizeArea([e], config).entries[0];
        return (
          <section key={e.id} className="rounded-2xl border border-[var(--nu-border)] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <input type="text" value={e.room}
                onChange={(ev) => update(e.id, { room: ev.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-sm font-bold text-[var(--nu-text)]" />
              <input type="text" value={e.product} placeholder="品番"
                onChange={(ev) => update(e.id, { product: ev.target.value })}
                className="min-w-0 flex-1 rounded-lg border border-[var(--nu-border)] bg-white px-2 py-1.5 text-sm text-[var(--nu-text)]" />
              <button type="button" onClick={() => remove(e.id)}
                className="min-h-[36px] shrink-0 rounded-lg px-2 text-xs font-bold text-rose-500 active:bg-rose-50">
                削除
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <label className={lblCls}>流し方向</label>
                <input type="text" inputMode="decimal" defaultValue={e.flowRaw}
                  onBlur={(ev) => commitDim(e.id, "flow", ev.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={lblCls}>幅方向</label>
                <input type="text" inputMode="decimal" defaultValue={e.widthRaw}
                  onBlur={(ev) => commitDim(e.id, "width", ev.target.value)}
                  className={inputCls} />
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-[var(--nu-bg)] px-3 py-2 text-xs text-slate-600">
              {r.rollCount !== null && <>必要本数 <b>{r.rollCount}本</b>（材料幅{r.materialWidthMm}mm）｜</>}
              見積 <b>{fmt(r.estimateValue)}{r.estimateUnit}</b>｜発注 <b>{fmt(r.orderValue, 1)}{r.orderUnit}</b>
              {r.lossRate > 0 && <>｜ロス{r.lossRate}%</>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── クロス：集計ビュー ──────────────────────────────────────
function WallpaperSummaryView({
  summary,
  lossByProduct,
  setLossByProduct,
}: {
  summary: NonNullable<ReturnType<typeof summarizeWallpaper>>;
  lossByProduct: Record<string, number>;
  setLossByProduct: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  // 部屋別（確認は部屋別）
  const rooms: string[] = [];
  for (const r of summary.byRoom) if (!rooms.includes(r.room)) rooms.push(r.room);

  return (
    <>
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">【部屋別】</h2>
        <div className="space-y-2">
          {rooms.map((room) => (
            <div key={room} className="rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
              <p className="text-sm font-bold text-[var(--nu-text)]">{room}</p>
              <ul className="mt-1 space-y-0.5">
                {summary.byRoom.filter((r) => r.room === room).map((r, i) => (
                  <li key={i} className="flex justify-between text-sm text-slate-600">
                    <span>{r.part ?? ""} {r.product || "（品番未設定）"}</span>
                    <span className="font-semibold text-[var(--nu-text)]">{fmtM(r.meters)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">【発注用 品番別】</h2>
        <div className="space-y-2">
          {summary.byProduct.map((p) => (
            <div key={p.product} className="rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--nu-text)]">{p.product}</p>
                <p className="text-xs text-slate-500">合計 {fmtM(p.rawTotal)}</p>
              </div>
              {/* ロス率（品番単位・任意） */}
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[11px] font-semibold text-slate-500">ロス</span>
                {LOSS_PRESETS.map((l) => (
                  <button key={l} type="button"
                    onClick={() => setLossByProduct((prev) => ({ ...prev, [p.product]: l }))}
                    className={`min-h-[40px] flex-1 rounded-lg text-xs font-bold active:opacity-80 ${
                      (lossByProduct[p.product] ?? 0) === l
                        ? "bg-[var(--nu-primary)] text-[var(--nu-on-primary)]"
                        : "border border-[var(--nu-border)] bg-white text-slate-600"
                    }`}>
                    {l}%
                  </button>
                ))}
                <input
                  type="text" inputMode="decimal"
                  value={String(lossByProduct[p.product] ?? 0)}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    setLossByProduct((prev) => ({ ...prev, [p.product]: isNaN(n) ? 0 : n }));
                  }}
                  className="min-h-[40px] w-12 rounded-lg border border-[var(--nu-border)] px-1 text-center text-xs"
                />
              </div>
              <div className="mt-2 flex items-end justify-between rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2">
                <span className="text-[11px] text-[var(--nu-primary-dk)]">
                  {p.lossRate > 0 && `ロス${p.lossRate}%後 ${fmtM(p.afterLoss)} → `}
                  最終発注（0.1m切り上げ）
                </span>
                <span className="text-lg font-bold text-[var(--nu-primary-dk)]">
                  {fmt(p.orderQty, 1)}m
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-400">
          明細寸法は入力値のまま保持し、品番合算→ロス→最終発注のみ0.1m切り上げます。
        </p>
      </section>
    </>
  );
}

// ─── 床系：集計ビュー ────────────────────────────────────────
function AreaSummaryView({
  config,
  summary,
}: {
  config: (typeof TAKEOFF_CONFIGS)[TakeoffType];
  summary: NonNullable<ReturnType<typeof summarizeArea>>;
}) {
  return (
    <>
      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">【部屋別】</h2>
        <div className="space-y-2">
          {summary.entries.map((r) => (
            <div key={r.entryId} className="rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--nu-text)]">{r.room}</p>
                <p className="text-xs text-slate-500">{r.product || "（品番未設定）"}</p>
              </div>
              <div className="mt-1 text-xs text-slate-600">
                {fmt(r.flowM, 2)}m × {fmt(r.widthM, 2)}m
                {r.rollCount !== null && <>｜{r.rollCount}本（材料幅{r.materialWidthMm}mm）</>}
                {r.lossRate > 0 && <>｜ロス{r.lossRate}%</>}
              </div>
              <div className="mt-1.5 flex justify-between rounded-xl bg-[var(--nu-bg)] px-3 py-2 text-sm">
                <span className="text-slate-500">見積 <b className="text-[var(--nu-text)]">{fmt(r.estimateValue)}{r.estimateUnit}</b></span>
                <span className="text-slate-500">発注 <b className="text-[var(--nu-primary-dk)]">{fmt(r.orderValue, 1)}{r.orderUnit}</b></span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-bold text-[var(--nu-text)]">【発注用 品番別】</h2>
        <div className="space-y-2">
          {summary.byProduct.map((p) => (
            <div key={p.product} className="flex items-center justify-between rounded-2xl border border-[var(--nu-border)] bg-white p-3.5 shadow-sm">
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--nu-text)]">{p.product}</p>
              <div className="shrink-0 text-right">
                <p className="text-xs text-slate-500">見積 {fmt(p.estimateValue)}{p.estimateUnit}</p>
                <p className="text-base font-bold text-[var(--nu-primary-dk)]">
                  発注 {fmt(p.orderValue, 1)}{p.orderUnit}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-slate-400">
          {config.label}：見積は{config.estimateUnit}、発注は{config.orderUnit}で表示しています。
        </p>
      </section>
    </>
  );
}

export default function TakeoffPage() {
  return (
    <Suspense
      fallback={<div className="p-6 text-center text-sm text-slate-400">読み込み中…</div>}
    >
      <TakeoffInner />
    </Suspense>
  );
}
