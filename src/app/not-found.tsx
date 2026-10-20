import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
        404
      </p>
      <h1 className="mt-2 font-display text-3xl tracking-tight">页面不存在</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        这个地址可能已经改过，或者链接输错了。回到工作台继续整理你的相册吧。
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="btn-primary btn-sm">
          回到工作台
        </Link>
        <Link href="/library" className="btn-secondary btn-sm">
          去素材库
        </Link>
      </div>
    </div>
  );
}
