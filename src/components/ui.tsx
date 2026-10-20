"use client";

import { useEffect, useId, useRef } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
  full: "sm:max-w-6xl",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const focusTimer = setTimeout(() => {
      (closeRef.current || dialogRef.current)?.focus();
    }, 30);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) || []
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      previousFocus.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "对话框"}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-line bg-white shadow-lift animate-fade-up outline-none sm:rounded-3xl",
          SIZES[size]
        )}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="min-w-0">
              {title && (
                <h2
                  id={titleId}
                  className="truncate font-display text-lg font-semibold tracking-tight"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
              )}
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              className="shrink-0 rounded-full border border-line p-2 text-muted transition hover:bg-paper hover:text-ink"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && (
          <div className="border-t border-line bg-paper/50 px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Spinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return <Loader2 size={size} className={cn("animate-spin", className)} />;
}

const STATUS_STYLE: Record<string, string> = {
  unused: "bg-stone-100 text-stone-500 border-stone-200",
  reserved: "bg-amber-50 text-amber-700 border-amber-200",
  used: "bg-emerald-50 text-emerald-700 border-emerald-200",
  draft: "bg-stone-100 text-stone-600 border-stone-200",
  ready: "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const STATUS_TEXT: Record<string, string> = {
  unused: "未使用",
  reserved: "已排期",
  used: "已使用",
  draft: "草稿",
  ready: "待发布",
  published: "已发布",
};

const DOT_STYLE: Record<string, string> = {
  unused: "bg-stone-300",
  reserved: "bg-amber-300",
  used: "bg-emerald-300",
  draft: "bg-stone-300",
  ready: "bg-amber-300",
  published: "bg-emerald-300",
};

export function StatusBadge({
  status,
  className,
  dot = true,
  variant = "default",
}: {
  status: string;
  className?: string;
  dot?: boolean;
  variant?: "default" | "overlay";
}) {
  if (variant === "overlay") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/45 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-sm backdrop-blur",
          className
        )}
      >
        {dot && (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              DOT_STYLE[status] || DOT_STYLE.unused
            )}
          />
        )}
        {STATUS_TEXT[status] || status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        STATUS_STYLE[status] || STATUS_STYLE.unused,
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
      {STATUS_TEXT[status] || status}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        {icon || <Sparkles size={22} />}
      </div>
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}


export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{
    value: string;
    label: string;
    count?: number;
    icon?: React.ReactNode;
  }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "no-scrollbar flex items-center gap-1 overflow-x-auto rounded-2xl border border-line bg-white/70 p-1.5",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs transition",
              active
                ? "bg-ink font-medium text-white shadow-sm"
                : "text-muted hover:bg-white hover:text-ink"
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  active ? "bg-white/15 text-white" : "bg-paper text-muted"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
