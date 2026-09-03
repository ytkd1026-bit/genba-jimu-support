"use client";

// 新UI My（/new/my）
// 普段あまり触らない管理機能の集約。既存ストアを読むだけ・設定変更は既存画面へ遷移。
// DBに存在しない数字は架空計算せず「未集計」placeholder を出す。

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "../_components/PageHeader";
import { loadCustomers, loadInvoices, monthlyIssuedTotal, formatYen } from "../_lib/data";
import {
  getCompanySettings,
  getBankSettings,
  type CompanySettings,
  type BankSettings,
} from "@/app/utils/companySettings";

export default function NewMyPage() {
  const [ready, setReady] = useState(false);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [bank, setBank] = useState<BankSettings | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);

  useEffect(() => {
    setCompany(getCompanySettings());
    setBank(getBankSettings());
    setCustomerCount(loadCustomers().length);
    setMonthTotal(monthlyIssuedTotal(loadInvoices()));
    setReady(true);
  }, []);

  return (
    <div>
      <PageHeader title="My" subtitle="自社情報・取引先・帳票・経営・設定" />

      <div className="space-y-5 px-4 py-4">
        {/* 自社情報 */}
        <Section title="自社情報" actionLabel="編集" actionHref="/settings/company">
          {!ready || !company ? (
            <Loading />
          ) : (
            <dl className="divide-y divide-[#f0f3f3]">
              <Row label="会社名" value={company.businessName} />
              <Row label="代表者" value={company.representative} />
              <Row label="住所" value={`${company.postalCode} ${company.address}`} />
              <Row label="電話" value={company.tel} />
              <Row label="メール" value={company.email} />
              <Row label="インボイス番号" value={company.invoiceNumber} />
              {bank && (
                <Row
                  label="振込先"
                  value={`${bank.bankName} ${bank.branchName} ${bank.accountType} ${bank.accountNumber}`}
                />
              )}
            </dl>
          )}
        </Section>

        {/* 取引先管理 */}
        <Section title="取引先管理" actionLabel="開く" actionHref="/customers">
          <LinkRow icon="🏢" label="元請・顧客・協力会社" href="/customers">
            {ready ? `${customerCount}件` : "…"}
          </LinkRow>
        </Section>

        {/* 帳票設定 */}
        <Section title="帳票設定">
          <div className="grid grid-cols-2 gap-2">
            <TileLink label="見積" href="/settings/company" />
            <TileLink label="請求" href="/settings/company" />
            <TileLink label="発注" href="/settings/company" />
            <TileLink label="完了報告" href="/settings/company" />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            会社情報・振込先は「自社情報」の編集から設定します。
          </p>
        </Section>

        {/* 経営 */}
        <Section title="経営">
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="今月売上（発行済請求）"
              value={monthTotal === null ? null : formatYen(monthTotal)}
            />
            <Metric label="今月粗利" value={null} />
            <Metric label="未請求額" value={null} />
            <Metric label="入金待ち" value={null} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            「未集計」の項目は、支出・入金データの連携後に表示します（架空値は出しません）。
          </p>
        </Section>

        {/* 設定 */}
        <Section title="設定">
          <div className="divide-y divide-[#f0f3f3]">
            <SettingRow icon="🔔" label="通知" note="準備中" />
            <SettingRow icon="💾" label="バックアップ" note="準備中" />
            <SettingRow icon="👤" label="アカウント" note="準備中" />
          </div>
        </Section>

        {/* 旧UIへ */}
        <Link
          href="/"
          className="flex items-center justify-center rounded-2xl border border-[#e6ebeb] bg-white px-4 py-3 text-sm font-medium text-slate-500 active:bg-[#f6f8f8]"
        >
          従来のホーム画面へ移動
        </Link>
      </div>
    </div>
  );
}

// ─── 部品 ────────────────────────────────────────────────────
function Section({
  title,
  children,
  actionLabel,
  actionHref,
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-[#1f2a2e]">{title}</h2>
        {actionLabel && actionHref && (
          <Link href={actionHref} className="text-xs font-medium text-[#0d9488]">
            {actionLabel} ›
          </Link>
        )}
      </div>
      <div className="rounded-2xl border border-[#e6ebeb] bg-white p-3.5 shadow-sm">
        {children}
      </div>
    </section>
  );
}

function Loading() {
  return <div className="h-20 animate-pulse rounded-xl bg-[#f6f8f8]" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-right text-sm text-[#1f2a2e]">
        {value || "—"}
      </dd>
    </div>
  );
}

function LinkRow({
  icon,
  label,
  href,
  children,
}: {
  icon: string;
  label: string;
  href: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 py-1 active:opacity-75">
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-sm text-[#1f2a2e]">{label}</span>
      <span className="text-sm font-semibold text-[#0f766e]">{children}</span>
      <span className="text-slate-300">›</span>
    </Link>
  );
}

function TileLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl bg-[#f6f8f8] px-3 py-3 text-center text-sm font-medium text-[#1f2a2e] active:bg-[#eef2f2]"
    >
      {label}
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl bg-[#f6f8f8] px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-[#0f766e]">
        {value === null ? <span className="text-sm font-medium text-slate-400">未集計</span> : value}
      </p>
    </div>
  );
}

function SettingRow({ icon, label, note }: { icon: string; label: string; note: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-sm text-[#1f2a2e]">{label}</span>
      <span className="text-[11px] text-slate-400">{note}</span>
    </div>
  );
}
