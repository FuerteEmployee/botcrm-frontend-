import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, Download, Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestErrorMessage } from "@/services/request-error";
import { hasQuestion, useNoticeResults, type NoticeResults } from "@/services/announcement-service";
import { audienceText, fmtWhen, QUESTION_BADGE } from "./notice-utils";

type Person = NoticeResults["people"][number];
type Filter = "all" | "answered" | "not_answered" | "read" | "not_read" | "not_seen";

function Tile({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number;
  of?: number;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card px-3 py-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-[20px] font-black leading-tight", tone)}>
        {value}
        {typeof of === "number" && (
          <span className="text-[13px] font-semibold text-muted-foreground"> / {of}</span>
        )}
      </p>
    </div>
  );
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsv(r: NoticeResults) {
  const q = r.announcement.question;
  const rows = [
    [
      "Name",
      "Phone",
      "Branch",
      "Department",
      "Seen",
      "Read",
      "Answer",
      "Answered at",
      "In audience",
    ],
  ];
  for (const p of r.people) {
    const answer = !p.answer
      ? ""
      : q?.kind === "number"
        ? String(p.answer.number ?? "")
        : p.answer.labels.join("; ");
    rows.push([
      p.name,
      p.phone,
      p.branch,
      p.department,
      fmtWhen(p.seenAt),
      fmtWhen(p.readAt),
      answer,
      fmtWhen(p.answeredAt),
      p.inAudience ? "yes" : "no (moved or left)",
    ]);
  }
  const blob = new Blob(["﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${
    r.announcement.title
      .replace(/[^\w -]+/g, "")
      .trim()
      .slice(0, 40) || "notice"
  } - responses.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Who read a notice, who answered what, and who has not responded yet. */
export function NoticeResultsDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useNoticeResults(id);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openOption, setOpenOption] = useState<number | null>(null);

  const a = data?.announcement;
  const question = !!a && hasQuestion(a);
  const ack = !!a?.display?.markAsRead;
  const unit = a?.question?.unit ? ` ${a.question.unit}` : "";

  const people = useMemo(() => {
    const list = data?.people || [];
    const match: Record<Filter, (p: Person) => boolean> = {
      all: () => true,
      answered: (p) => !!p.answeredAt,
      not_answered: (p) => p.inAudience && !p.answeredAt,
      read: (p) => !!p.readAt,
      not_read: (p) => p.inAudience && !p.readAt,
      not_seen: (p) => p.inAudience && !p.seenAt && !p.readAt && !p.answeredAt,
    };
    const needle = search.trim().toLowerCase();
    return list
      .filter(match[filter])
      .filter(
        (p) =>
          !needle ||
          `${p.name} ${p.phone} ${p.branch} ${p.department}`.toLowerCase().includes(needle),
      );
  }, [data, filter, search]);

  const count = (f: Filter) => {
    const list = data?.people || [];
    if (f === "all") return list.length;
    if (f === "answered") return list.filter((p) => p.answeredAt).length;
    if (f === "not_answered") return list.filter((p) => p.inAudience && !p.answeredAt).length;
    if (f === "read") return list.filter((p) => p.readAt).length;
    if (f === "not_read") return list.filter((p) => p.inAudience && !p.readAt).length;
    return list.filter((p) => p.inAudience && !p.seenAt && !p.readAt && !p.answeredAt).length;
  };

  const chips: { f: Filter; label: string; show: boolean }[] = [
    { f: "all", label: "All", show: true },
    { f: "answered", label: "Answered", show: question },
    { f: "not_answered", label: "Not answered", show: question },
    { f: "read", label: "Read", show: ack },
    { f: "not_read", label: "Not read", show: ack },
    { f: "not_seen", label: "Not seen yet", show: true },
  ];

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setFilter("all");
          setSearch("");
          setOpenOption(null);
        }
      }}
    >
      <DialogContent className="max-w-3xl rounded-[24px] p-0 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-5 pb-3 shrink-0 border-b border-border/50">
          <DialogHeader>
            <div className="flex items-center gap-3 pr-6">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div className="min-w-0 text-left">
                <DialogTitle className="text-[16px] font-black break-words">
                  {a?.title || "Results"}
                </DialogTitle>
                <DialogDescription className="text-[12px]">
                  {a ? (
                    <>
                      {audienceText(a)}
                      {question && ` · ${QUESTION_BADGE[a.question!.kind]}`}
                      {a.closesAt
                        ? a.isOpen
                          ? ` · closes ${fmtWhen(a.closesAt)}`
                          : ` · closed ${fmtWhen(a.closesAt)}`
                        : ""}
                    </>
                  ) : (
                    "Who read it and who answered what"
                  )}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error || !data ? (
            <p className="py-12 text-center text-[13px] text-destructive">
              {requestErrorMessage(error, "Could not load the results. Please try again.") ||
                "Could not load the results."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Tile label="Sent to" value={data.totals.audience} />
                <Tile label="Seen" value={data.totals.seen} of={data.totals.audience} />
                {ack && (
                  <Tile
                    label="Marked read"
                    value={data.totals.read}
                    of={data.totals.audience}
                    tone="text-emerald-600"
                  />
                )}
                {question && (
                  <Tile
                    label="Answered"
                    value={data.totals.answered}
                    of={data.totals.audience}
                    tone="text-primary"
                  />
                )}
                {question && (
                  <Tile
                    label="Not answered"
                    value={data.totals.notAnswered}
                    tone="text-amber-600"
                  />
                )}
              </div>

              {question && a?.question?.prompt && (
                <p className="text-[14px] font-bold">{a.question.prompt}</p>
              )}

              {data.options.length > 0 && (
                <div className="space-y-2">
                  {data.options.map((o) => {
                    const pct = data.totals.answered
                      ? Math.round(
                          (o.count /
                            Math.max(1, (data.people || []).filter((p) => p.answeredAt).length)) *
                            100,
                        )
                      : 0;
                    const expanded = openOption === o.index;
                    return (
                      <div
                        key={o.index}
                        className="rounded-xl border border-border/50 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenOption(expanded ? null : o.index)}
                          className="relative w-full text-left px-3 py-2.5 min-h-11"
                          aria-expanded={expanded}
                        >
                          <span
                            className="absolute inset-y-0 left-0 bg-primary/10"
                            style={{ width: `${pct}%` }}
                            aria-hidden
                          />
                          <span className="relative flex items-center gap-2">
                            <span className="flex-1 min-w-0 text-[13px] font-bold break-words">
                              {o.label}
                            </span>
                            <span className="text-[13px] font-black text-primary">{o.count}</span>
                            <span className="text-[11px] text-muted-foreground w-9 text-right">
                              {pct}%
                            </span>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform",
                                expanded && "rotate-180",
                              )}
                            />
                          </span>
                        </button>
                        {expanded && (
                          <p className="px-3 pb-3 text-[12px] text-muted-foreground leading-relaxed">
                            {o.people.length
                              ? o.people.map((p) => p.name).join(", ")
                              : "Nobody yet."}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {a?.question?.kind === "multiple" && (
                    <p className="text-[11px] text-muted-foreground">
                      People could tick more than one, so the numbers can add up to more than the
                      answers.
                    </p>
                  )}
                </div>
              )}

              {data.number && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Tile label={`Total${unit}`} value={data.number.total} tone="text-primary" />
                  <Tile label="Average" value={data.number.average ?? 0} />
                  <Tile label="Lowest" value={data.number.min ?? 0} />
                  <Tile label="Highest" value={data.number.max ?? 0} />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {chips
                      .filter((c) => c.show)
                      .map((c) => (
                        <button
                          key={c.f}
                          type="button"
                          onClick={() => setFilter(c.f)}
                          className={cn(
                            "h-9 px-3 rounded-full border text-[12px] font-bold",
                            filter === c.f
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border/60 text-muted-foreground hover:bg-muted/40",
                          )}
                        >
                          {c.label} ({count(c.f)})
                        </button>
                      ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadCsv(data)}
                    className="h-10 px-3 rounded-xl border border-border/60 text-[12px] font-bold flex items-center justify-center gap-1.5 hover:bg-muted/40"
                  >
                    <Download className="h-4 w-4" /> Download CSV
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone, branch..."
                    aria-label="Search people"
                    className="h-10 pl-9 rounded-xl text-[13px]"
                  />
                </div>
                {people.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    Nobody in this list.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/50 rounded-xl border border-border/50">
                    {people.map((p) => (
                      <li
                        key={p.employeeId}
                        className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0 md:w-[38%]">
                          <p className="text-[13px] font-bold truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {[p.branch, p.department].filter(Boolean).join(" · ") || p.phone}
                            {!p.inAudience && " · no longer in the audience"}
                          </p>
                        </div>
                        <div className="flex-1 min-w-0 text-[12px]">
                          {question ? (
                            p.answer ? (
                              <span className="font-bold text-primary break-words">
                                {a?.question?.kind === "number"
                                  ? `${p.answer.number ?? ""}${unit}`
                                  : p.answer.labels.join(", ")}
                              </span>
                            ) : (
                              <span className="text-amber-600 font-semibold">No answer yet</span>
                            )
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground md:text-right md:w-[30%]">
                          {p.answeredAt
                            ? `Answered ${fmtWhen(p.answeredAt)}`
                            : p.readAt
                              ? `Read ${fmtWhen(p.readAt)}`
                              : p.seenAt
                                ? `Seen ${fmtWhen(p.seenAt)}${ack ? ", not marked read" : ""}`
                                : "Not seen yet"}
                          {p.answeredAt && ack && (
                            <span className="block">
                              {p.readAt ? `Read ${fmtWhen(p.readAt)}` : "Not marked read"}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
