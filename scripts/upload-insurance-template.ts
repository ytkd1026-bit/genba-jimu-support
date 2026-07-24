/**
 * INS-TPL-001 Storage アップロード専用スクリプト
 * ------------------------------------------------------------------
 * 保険復旧工事テンプレート INS-TPL-001 の元ファイル（PDF / DOCX）を、
 * Supabase Storage の insurance-templates バケットへアップロードする。
 *
 * このスクリプトは Storage へのアップロードと存在確認のみを行う。
 * テーブルや seed（DB 行）には一切書き込まない
 * （DB・body_text はライブ Supabase "AI-touryou" で登録済みのため）。
 *
 * 必要な環境変数（コード・Git には保存しない。実行時に注入すること）:
 *   SUPABASE_URL               … 例: https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  … service_role キー（サーバー専用・秘匿）
 *
 * 実行:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run upload:insurance-template
 *   もしくは
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/upload-insurance-template.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── 設定 ─────────────────────────────────────────────────────
const BUCKET = "insurance-templates";
const TEMPLATE_CODE = "INS-TPL-001";
const PREFIX = "INS-TPL-001"; // バケット内フォルダ

// リポジトリルート（このファイルは scripts/ 配下）
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PDF_NAME = "AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.pdf";
const DOCX_NAME = "AIG提出用_漏水事故復旧工事_見積項目施工必要性説明書.docx";

type Target = {
  label: string;
  localPath: string; // アップロード元（ローカル）
  destPath: string; // アップロード先（バケット内オブジェクトパス）
  contentType: string;
};

const TARGETS: Target[] = [
  {
    label: "PDF",
    localPath: resolve(REPO_ROOT, "supabase/templates/INS-TPL-001", PDF_NAME),
    destPath: `${PREFIX}/${PDF_NAME}`,
    contentType: "application/pdf",
  },
  {
    label: "DOCX",
    localPath: resolve(REPO_ROOT, "supabase/templates/INS-TPL-001", DOCX_NAME),
    destPath: `${PREFIX}/${DOCX_NAME}`,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
];

// ─── ヘルパ ───────────────────────────────────────────────────
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    console.error(`✗ 環境変数 ${name} が未設定です。`);
    process.exit(1);
  }
  return v;
}

function ok(msg: string) {
  console.log(`✓ ${msg}`);
}

function info(msg: string) {
  console.log(`  ${msg}`);
}

// ─── メイン ───────────────────────────────────────────────────
async function main() {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\n=== INS-TPL-001 Storage アップロード ===`);
  info(`プロジェクト: ${supabaseUrl}`);
  info(`バケット: ${BUCKET}`);

  // 1) バケットの存在確認（なければ非公開で作成）
  {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.error(`✗ バケット一覧の取得に失敗: ${error.message}`);
      process.exit(1);
    }
    const exists = buckets?.some((b) => b.name === BUCKET);
    if (exists) {
      ok(`バケット "${BUCKET}" は存在します。`);
    } else {
      info(`バケット "${BUCKET}" が無いため作成します（非公開）…`);
      const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
        public: false,
      });
      if (createErr) {
        console.error(`✗ バケット作成に失敗: ${createErr.message}`);
        process.exit(1);
      }
      ok(`バケット "${BUCKET}" を非公開で作成しました。`);
    }
  }

  // 2) PDF・DOCX を upsert でアップロード
  for (const t of TARGETS) {
    let buffer: Buffer;
    try {
      buffer = await readFile(t.localPath);
    } catch {
      console.error(`✗ ${t.label} が見つかりません: ${t.localPath}`);
      process.exit(1);
    }
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(t.destPath, buffer, {
        contentType: t.contentType,
        upsert: true,
      });
    if (error) {
      console.error(`✗ ${t.label} のアップロードに失敗: ${error.message}`);
      process.exit(1);
    }
    ok(`${t.label} をアップロード: ${t.destPath} (${buffer.length} bytes)`);
  }

  // 3) アップロード後の存在確認（フォルダ一覧を取得）
  {
    const { data: items, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: 100 });
    if (error) {
      console.error(`✗ ファイル一覧の取得に失敗: ${error.message}`);
      process.exit(1);
    }
    const names = new Set((items ?? []).map((i) => i.name));
    let allPresent = true;
    for (const t of TARGETS) {
      const base = t.destPath.slice(PREFIX.length + 1);
      if (names.has(base)) {
        ok(`存在確認: ${t.destPath}`);
      } else {
        console.error(`✗ 存在確認できません: ${t.destPath}`);
        allPresent = false;
      }
    }
    if (!allPresent) process.exit(1);
  }

  // 4) DB の insurance_template_versions と pdf_path/docx_path の一致確認
  //    （読み取りのみ。DB への書き込みは行わない）
  {
    const { data: tpl, error: tplErr } = await supabase
      .from("insurance_document_templates")
      .select("id, template_code, current_version")
      .eq("template_code", TEMPLATE_CODE)
      .single();
    if (tplErr || !tpl) {
      console.error(
        `✗ ${TEMPLATE_CODE} が insurance_document_templates に見つかりません: ${
          tplErr?.message ?? "not found"
        }`,
      );
      process.exit(1);
    }

    const { data: versions, error: verErr } = await supabase
      .from("insurance_template_versions")
      .select("version, pdf_path, docx_path, is_current")
      .eq("template_id", tpl.id);
    if (verErr) {
      console.error(
        `✗ insurance_template_versions の取得に失敗: ${verErr.message}`,
      );
      process.exit(1);
    }
    if (!versions || versions.length === 0) {
      console.error(`✗ ${TEMPLATE_CODE} のバージョン行が見つかりません。`);
      process.exit(1);
    }

    // is_current を優先、無ければ current_version、それも無ければ先頭
    const current =
      versions.find((v) => v.is_current) ??
      versions.find((v) => v.version === tpl.current_version) ??
      versions[0];

    const expectedPdf = TARGETS[0].destPath;
    const expectedDocx = TARGETS[1].destPath;

    let matched = true;
    if (current.pdf_path === expectedPdf) {
      ok(`DB 一致: pdf_path = ${current.pdf_path}`);
    } else {
      console.error(
        `✗ DB 不一致: pdf_path\n    DB      : ${current.pdf_path}\n    Storage : ${expectedPdf}`,
      );
      matched = false;
    }
    if (current.docx_path === expectedDocx) {
      ok(`DB 一致: docx_path = ${current.docx_path}`);
    } else {
      console.error(
        `✗ DB 不一致: docx_path\n    DB      : ${current.docx_path}\n    Storage : ${expectedDocx}`,
      );
      matched = false;
    }

    if (!matched) {
      console.error(
        `\n✗ Storage のパスと DB の登録値が一致しません。DB 側の pdf_path/docx_path を確認してください。`,
      );
      process.exit(1);
    }
  }

  console.log(`\n✓ 完了: INS-TPL-001 の PDF・DOCX を Storage へ反映し、DB 登録値と一致を確認しました。`);
  console.log(`  （seed / DB 書き込みは実行していません）\n`);
}

main().catch((err) => {
  console.error("✗ 予期しないエラー:", err);
  process.exit(1);
});
