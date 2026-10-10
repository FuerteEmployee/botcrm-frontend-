import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Info, Megaphone } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { isNativeApp } from "@/lib/geolocation";
import { cn } from "@/lib/utils";
import { CenterModal } from "@/components/shared/center-modal";
import { useFeatureToggles } from "@/hooks/use-feature-toggles";
import { hasQuestion, useNoticeActions, type Announcement } from "@/services/announcement-service";
import { NoticeResponse } from "./notice-answer";
import { fmtWhen } from "./notice-utils";

const TYPE = {
  urgent: { icon: AlertTriangle, label: "Urgent", className: "bg-rose-500/10 text-rose-600" },
  event: { icon: CalendarDays, label: "Event", className: "bg-blue-500/10 text-blue-600" },
  policy: { icon: Info, label: "Policy", className: "bg-primary/10 text-primary" },
  general: { icon: Megaphone, label: "Announcement", className: "bg-amber-500/10 text-amber-700" },
} as const;

// "Later" lasts until the app is closed and opened again: kept in memory, not
// storage, so the next launch asks again.
const laterThisRun = new Set<string>();

/**
 * Pops up, one at a time, the notices the admin marked "show as popup" that
 * this employee has not dealt with yet (the server's `pending`). Checked when
 * the app starts and each time it comes back to the front.
 */
export function NoticePopup() {
  const { isFeatureEnabled } = useFeatureToggles();
  const enabled = isFeatureEnabled("announcements");
  const { markSeen } = useNoticeActions();

  const { data, refetch } = useQuery<Announcement[]>({
    // Under ["announcements"], so answering anywhere refreshes it.
    queryKey: ["announcements", "popup"],
    queryFn: async () => {
      const { data } = await apiClient.get("/announcements", { quietUpgrade: true });
      return Array.isArray(data) ? data : [];
    },
    enabled,
    retry: false,
    staleTime: 30 * 1000,
  });

  // Back in the front = "app open" again.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    document.addEventListener("visibilitychange", onVisible);
    let remove: (() => void) | undefined;
    let disposed = false;
    if (isNativeApp()) {
      import("@capacitor/app")
        .then(({ App }) =>
          App.addListener("appStateChange", ({ isActive }) => {
            if (isActive) void refetch();
          }),
        )
        .then((h) => {
          if (disposed) void h.remove();
          else remove = () => void h.remove();
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      remove?.();
    };
  }, [enabled, refetch]);

  // Let the screen settle before the first popup, so it is not lost behind
  // the page loading.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  // The notice on screen stays until the employee closes it, even when its
  // `pending` flips (marking it seen does that the moment it shows).
  const [shownId, setShownId] = useState<string | null>(null);
  const seenSent = useRef(new Set<string>());

  const queue = useMemo(() => {
    const list = (data || []).filter((a) => a.pending && !laterThisRun.has(a._id));
    // Urgent first, then oldest first, so they read in the order they were posted.
    return list.sort((a, b) => {
      const u = Number(b.type === "urgent") - Number(a.type === "urgent");
      return u || Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
    // shownId: re-read the queue after one is closed.
  }, [data, shownId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !settled || shownId || queue.length === 0) return;
    const next = queue[0];
    setShownId(next._id);
    if (!seenSent.current.has(next._id) && !next.myResponse?.seenAt) {
      seenSent.current.add(next._id);
      markSeen([next._id]);
    }
  }, [enabled, settled, shownId, queue, markSeen]);

  const notice = shownId ? (data || []).find((a) => a._id === shownId) : undefined;

  // Deleted by the admin while on screen.
  useEffect(() => {
    if (shownId && data && !notice) setShownId(null);
  }, [shownId, data, notice]);

  if (!enabled || !notice) return null;

  const close = () => {
    laterThisRun.add(notice._id);
    setShownId(null);
  };
  const type = TYPE[notice.type] ?? TYPE.general;
  const Icon = type.icon;
  const answered = !!notice.myResponse?.answeredAt;
  const needsAnswer = hasQuestion(notice) && notice.isOpen !== false && !answered;
  const needsRead = !!notice.display?.markAsRead && !notice.myResponse?.readAt;
  const left = Math.max(0, queue.filter((a) => a._id !== notice._id).length);

  return (
    <CenterModal
      onClose={close}
      dismissOnBackdrop={false}
      zIndex={85}
      labelledBy="notice-popup-title"
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className={cn(
              "h-11 rounded-xl text-[14px] font-bold transition-colors",
              needsAnswer || needsRead
                ? "px-4 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                : "flex-1 bg-primary text-primary-foreground",
            )}
          >
            {needsAnswer || needsRead ? "Later" : "OK"}
          </button>
          {left > 0 && <span className="ml-auto text-[11px] text-slate-400">{left} more</span>}
        </div>
      }
    >
      <div className="space-y-3 pr-6">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
            type.className,
          )}
        >
          <Icon className="h-3.5 w-3.5" /> {type.label}
        </span>
        <h2
          id="notice-popup-title"
          className="text-[17px] font-black leading-snug text-slate-900 dark:text-slate-50 break-words"
        >
          {notice.title}
        </h2>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-line break-words">
        {notice.content}
      </p>
      <p className="mt-2 text-[11px] text-slate-400">
        {notice.author} · {fmtWhen(notice.createdAt)}
      </p>
      <div className="mt-4">
        {/* Once it asks for nothing more, move on to the next notice. */}
        <NoticeResponse
          notice={notice}
          onAnswered={() => {
            if (!needsRead) close();
          }}
          onRead={() => {
            if (!needsAnswer) close();
          }}
        />
      </div>
    </CenterModal>
  );
}
