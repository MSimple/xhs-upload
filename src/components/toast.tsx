"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx.toast;
}

const ICONS = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

const STYLES = {
  success: "border-emerald-200 bg-white text-emerald-700",
  error: "border-red-200 bg-white text-red-600",
  info: "border-line bg-white text-ink",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++counter.current;
    setItems((prev) => [...prev.slice(-3), { id, message, kind }]);
    setTimeout(
      () => {
        setItems((prev) => prev.filter((item) => item.id !== id));
      },
      kind === "error" ? 7000 : 4500
    );
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) toast(message, "error");
    };
    window.addEventListener("studio:api-error", handler);
    return () => window.removeEventListener("studio:api-error", handler);
  }, [toast]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[120] flex flex-col items-center gap-2 px-4 lg:bottom-8"
        aria-live="polite"
      >
        {items.map((item) => {
          const Icon = ICONS[item.kind];
          return (
            <div
              key={item.id}
              role={item.kind === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex max-w-[min(92vw,42rem)] items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lift animate-fade-up",
                STYLES[item.kind]
              )}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 flex-1 break-words leading-relaxed">
                {item.message}
              </span>
              <button
                className="ml-1 rounded-full p-1 text-muted hover:bg-paper"
                onClick={() =>
                  setItems((prev) => prev.filter((t) => t.id !== item.id))
                }
                aria-label="关闭"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
