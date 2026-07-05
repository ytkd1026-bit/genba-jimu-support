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

  // マウント時に既存下書きを読み込む（一度だけ）
  useEffect(() => {
    const draft = loadDraft<T>(key);
    if (draft) setRestoredDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // アンマウント時のタイマークリーンアップ
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
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
    removeDraft(key);
    setSaveStatus('idle');
    setSavedAt(null);
    setRestoredDraft(null);
    prevDataStringRef.current = null;
  }, [key]);

  return { saveStatus, savedAt, forceSave, clearDraft, restoredDraft };
}
