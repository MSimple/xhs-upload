"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
        Error
      </p>
      <h1 className="mt-2 font-display text-2xl tracking-tight">页面出错了</h1>
      <p className="mt-2 max-w-md break-words text-sm leading-relaxed text-muted">
        {error.message || "发生了未预期的错误，可以重试或回到工作台。"}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button onClick={reset} className="btn-primary btn-sm">
          重试
        </button>
        <Link href="/" className="btn-secondary btn-sm">
          回到工作台
        </Link>
      </div>
    </div>
  );
}
