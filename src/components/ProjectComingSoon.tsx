"use client";

// 未実装タブの「準備中」表示（案件配下でリンク先が落ちないようにするための共通画面）
// 案件が存在しない場合は案件一覧へ誘導する。

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { projectsStore, type Project } from "@/app/utils/projects";
import { ProjectTabs, ProjectHeader, type ProjectTabKey } from "@/components/ProjectTabs";

export function ProjectComingSoon({
  active,
  title,
  description,
}: {
  active: ProjectTabKey;
  title: string;
  description: string;
}) {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);
  const [project, setProject] = useState<Project | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const p = projectsStore.getById(projectId);
    if (p) setProject(p);
    else setNotFound(true);
  }, [projectId]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#fdf8f2]">
        <div className="mx-auto max-w-md px-4 py-10 text-center sm:max-w-lg">
          <p className="text-sm font-bold text-stone-700">案件が見つかりません。</p>
          <p className="mt-1 font-mono text-xs text-stone-400">{projectId}</p>
          <Link href="/projects/list" className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#8B4A3C] px-5 py-2.5 text-sm font-bold text-white active:opacity-80">
            案件一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!project) return <div className="min-h-screen bg-[#fdf8f2]" />;

  return (
    <div className="min-h-screen bg-[#fdf8f2] pb-24">
      <div className="mx-auto max-w-md px-4 py-4 sm:max-w-lg">
        <header className="mb-3">
          <Link href={`/projects/${encodeURIComponent(projectId)}`} className="mb-2 inline-flex items-center gap-1 text-sm text-[#8B4A3C] hover:opacity-75">
            ← 案件詳細へ戻る
          </Link>
          <h1 className="text-xl font-bold text-stone-800">{title}</h1>
        </header>

        <ProjectHeader project={project} />
        <ProjectTabs projectId={projectId} active={active} />

        <div className="rounded-2xl border-2 border-dashed border-stone-200 px-4 py-12 text-center">
          <p className="text-2xl">🚧</p>
          <p className="mt-2 text-sm font-bold text-stone-600">準備中</p>
          <p className="mt-1 text-sm text-stone-500">{description}</p>
        </div>
      </div>
    </div>
  );
}
