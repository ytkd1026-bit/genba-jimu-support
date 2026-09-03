"use client";

// 新UI チャット（/new/chat）
// 今回は UI・画面構造の完成が目的。バックエンド・DB Migration は行わない。
// 表示は設計プレビュー（mock）。正本は案件DBであることを前提に設計している。

import { useState } from "react";
import PageHeader from "../_components/PageHeader";
import ProjectCard from "../_components/ProjectCard";
import {
  MOCK_ROOMS,
  MOCK_MESSAGES,
  type ChatRoom,
} from "../_lib/chatMock";
import { statusBadgeClass } from "../_lib/theme";
import { PROJECT_STATUS_LABELS } from "@/app/utils/projects";

export default function NewChatPage() {
  const [openRoom, setOpenRoom] = useState<ChatRoom | null>(null);

  if (openRoom) {
    return <ChatThread room={openRoom} onBack={() => setOpenRoom(null)} />;
  }

  return (
    <div>
      <PageHeader title="チャット" subtitle="元請・顧客との連絡（設計プレビュー）" />

      <div className="px-4 py-3">
        <p className="mb-3 rounded-xl bg-[var(--nu-primary-bg)] px-3 py-2 text-[11px] leading-snug text-[var(--nu-primary-dk)]">
          これは画面設計のプレビューです。メッセージ送受信の連携は今後の工程で、
          正本の案件DBを壊さない形で追加します。
        </p>

        <ul className="space-y-2">
          {MOCK_ROOMS.map((room) => (
            <li key={room.id}>
              <button
                onClick={() => setOpenRoom(room)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#e6ebeb] bg-white p-3.5 text-left shadow-sm active:bg-[#f6f8f8]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--nu-primary-bg)] text-lg">
                  🏢
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[#1f2a2e]">
                      {room.counterparty}
                    </p>
                    <span className="shrink-0 text-[11px] text-slate-400">{room.lastAt}</span>
                  </div>
                  {room.relatedProject && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${statusBadgeClass(
                          room.relatedProject.status,
                        )}`}
                      >
                        {PROJECT_STATUS_LABELS[room.relatedProject.status]}
                      </span>
                      <span className="truncate">{room.relatedProject.projectName}</span>
                    </p>
                  )}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-500">{room.lastMessage}</p>
                    {room.unreadCount > 0 && (
                      <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[var(--nu-primary)] px-1.5 text-[11px] font-bold text-white">
                        {room.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChatThread({ room, onBack }: { room: ChatRoom; onBack: () => void }) {
  const messages = MOCK_MESSAGES[room.id] ?? [];

  return (
    <div>
      <PageHeader
        title={room.counterparty}
        subtitle="設計プレビュー"
        right={
          <button
            onClick={onBack}
            className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--nu-primary)] active:bg-[#f1f5f5]"
          >
            ← 戻る
          </button>
        }
      />

      <div className="px-4 py-3">
        {/* この会話に関連する案件 */}
        {room.relatedProject && (
          <div className="mb-3">
            <p className="mb-1.5 px-1 text-[11px] font-semibold text-slate-400">
              この会話に関連する案件
            </p>
            <ProjectCard project={room.relatedProject} />
          </div>
        )}

        {/* メッセージ */}
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            メッセージはまだありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`flex ${m.from === "self" ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[80%]">
                  {m.from === "other" && (
                    <p className="mb-0.5 px-1 text-[10px] text-slate-400">{m.senderName}</p>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      m.from === "self"
                        ? "bg-[var(--nu-primary)] text-white"
                        : "border border-[#e6ebeb] bg-white text-[#1f2a2e]"
                    }`}
                  >
                    {m.body}
                  </div>
                  <p
                    className={`mt-0.5 text-[10px] text-slate-400 ${
                      m.from === "self" ? "text-right" : "text-left"
                    }`}
                  >
                    {m.at}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 入力欄（プレビュー・非活性） */}
      <div
        className="fixed inset-x-0 z-30 mx-auto max-w-md border-t border-[#e6ebeb] bg-white px-3 py-2"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2">
          <input
            disabled
            placeholder="メッセージ（連携準備中）"
            className="flex-1 rounded-full border border-[#e6ebeb] bg-[#f6f8f8] px-4 py-2 text-sm text-slate-400"
          />
          <button
            disabled
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#cfdad8] text-white"
            aria-label="送信"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
