'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  saveDraft,
  loadDraft,
  removeDraft,
  type DraftEntry,
} from '@/app/utils/draftStorage';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type UseAutoDraftReturn<T> = {
  saveStatus: SaveStatus;
  savedAt: Date | null;
  forceSave: () => void;
  clearDraft: () => void;
  restoredDraft: DraftEntry<T> | null;
};

/**
 * 入力データの変更を検知して localStorage へ自動下書き保存するカスタムフック。
 *
 * @param key         localStorage キー（draftKey() で生成）
 * @param type        下書き種別（例: 'estimate'）
 * @param id          下書き ID（例: 'new' または projectId）
 * @param data        保存するデータ（useMemo でメモ化して渡す）
 * @param options.debounceMs  保存までの遅延 ms（デフォルト 800）
 * @param options.enabled     false のとき保存を無効化（デモモード等）
 *
 * フラッシュ保存: debounce 待機中にタブが閉じられる・非表示になる・
 * 画面遷移でアンマウントされる場合は、待たずに即時保存する（入力消失ゼロ）。
 */
export function useAutoDraft<T>(
  key: string,
  type: string,
  id: string,
  data: T,
  options?: {
    debounceMs?: number;
    enabled?: boolean;
  },
): UseAutoDraftReturn<T> {
  const debounceMs = options?.debounceMs ?? 800;
  const enabled = options?.enabled ?? true;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<DraftEntry<T> | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevDataStringRef = useRef<string | null>(null);
  const dataRef = useRef<T>(data);
  // 保存待ち（debounce 中）の変更があるか
  const pendingRef = useRef(false);
  const keyRef = useRef(key);
  const typeRef = useRef(type);
  const idRef = useRef(id);
  useEffect(() => {
    keyRef.current = key;
    typeRef.current = type;
    idRef.current = id;
  }, [key, type, id]);

  // マウント時に既存下書きを読み込む（一度だけ）
  useEffect(() => {
    const draft = loadDraft<T>(key);
    if (draft) setRestoredDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 保存待ちの変更があれば debounce を待たずに即時保存する。
   * 保存待ちが無ければ null、保存したら成否を返す。
   * setState を行わないため、アンマウント中でも安全に呼べる。
   */
  const commitPending = useCallback((): boolean | null => {
    if (!pendingRef.current) return null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = false;
    return saveDraft(keyRef.current, typeRef.current, idRef.current, dataRef.current);
  }, []);

  // アンマウント時: タイマー破棄だけでなく、保存待ちの変更を必ず書き出す
  // （タブ移動・画面遷移で debounce 中の入力を失わないため）
  useEffect(() => {
    return () => {
      commitPending();
    };
  }, [commitPending]);

  // タブ非表示・ページ離脱時のフラッシュ保存
  useEffect(() => {
    const flush = () => {
      const ok = commitPending();
      if (ok === null) return;
      if (ok) {
        setSaveStatus('saved');
        setSavedAt(new Date());
      } else {
        setSaveStatus('error');
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [commitPending]);

  // データ変更の検知と debounced 自動保存
  useEffect(() => {
    dataRef.current = data;

    if (!enabled) return;

    const dataStr = JSON.stringify(data);

    // 初回：初期値を記録するだけで保存しない
    if (prevDataStringRef.current === null) {
      prevDataStringRef.current = dataStr;
      return;
    }

    // 内容に変化がなければ何もしない
    if (dataStr === prevDataStringRef.current) return;
    prevDataStringRef.current = dataStr;

    setSaveStatus('dirty');
    pendingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      pendingRef.current = false;
      setSaveStatus('saving');
      const ok = saveDraft(key, type, id, dataRef.current);
      if (ok) {
        setSaveStatus('saved');
        setSavedAt(new Date());
      } else {
        setSaveStatus('error');
      }
    }, debounceMs);
  }, [data, enabled, key, type, id, debounceMs]);

  /** debounce をスキップして即時保存する（PDF発行前などに使う） */
  const forceSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = false;
    setSaveStatus('saving');
    const ok = saveDraft(key, type, id, dataRef.current);
    if (ok) {
      setSaveStatus('saved');
      setSavedAt(new Date());
    } else {
      setSaveStatus('error');
    }
  }, [key, type, id]);

  /** 本保存後に自動下書きを削除する（pending タイマーも同時にキャンセル） */
  const clearDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = false;
    removeDraft(key);
    setSaveStatus('idle');
    setSavedAt(null);
    setRestoredDraft(null);
    prevDataStringRef.current = null;
  }, [key]);

  return { saveStatus, savedAt, forceSave, clearDraft, restoredDraft };
}
