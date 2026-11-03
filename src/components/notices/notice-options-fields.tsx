import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Check, CheckCheck, Lock, Plus, RefreshCw, Search, Trash2, Users, X } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import type {
  AnnouncementInput,
  AudienceMode,
  QuestionKind,
} from "@/services/announcement-service";
import { personInAudience, QUESTION_LABEL, type AudiencePerson } from "./notice-utils";

const OPTIONS_MAX = 20;

const labelCls = "text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground ml-1";
const inputCls = "h-11 rounded-xl bg-muted/30 border-border/40 focus:bg-card text-[13px]";

function Tick({
  on,
  onClick,
  title,
  text,
  icon: Icon,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  text: string;
  icon: typeof BellRing;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
        on ? "border-primary/40 bg-primary/5" : "border-border/50 hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 flex items-center justify-center",
          on ? "bg-primary border-primary" : "border-border/80",
        )}
      >
        {on && <Check className="h-3 w-3 text-white" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
          <Icon className="h-3.5 w-3.5 text-primary" /> {title}
        </span>
        <span className="block text-[12px] text-muted-foreground leading-snug">{text}</span>
      </span>
    </button>
  );
}

/** ISO → the value a datetime-local input wants, in this browser's time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** "How employees get it": popup and "Mark as read". */
export function NoticeDisplayFields({
  form,
  setForm,
}: {
  form: AnnouncementInput;
  setForm: (f: AnnouncementInput) => void;
}) {
  const set = (k: "popup" | "markAsRead") =>
    setForm({ ...form, display: { ...form.display, [k]: !form.display[k] } });
  return (
    <div className="space-y-2">
      <p className={labelCls}>How employees get it</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Tick
          on={form.display.popup}
          onClick={() => set("popup")}
          icon={BellRing}
          title="Show as popup"
          text="Pops up when they open the app, until they deal with it."
        />
        <Tick
          on={form.display.markAsRead}
          onClick={() => set("markAsRead")}
          icon={CheckCheck}
          title='"Mark as read" button'
          text="They tap it to confirm; you see who has and who has not."
        />
      </div>
      {!form.display.popup && !form.display.markAsRead && (
        <p className="text-[12px] text-muted-foreground ml-1">
          With neither ticked, it shows under the bell and on the notice board only.
        </p>
      )}
    </div>
  );
}

/** "Ask a question": yes/no, pick one, pick several, a number; closing time. */
export function NoticeQuestionFields({
  form,
  setForm,
  answered,
}: {
  form: AnnouncementInput;
  setForm: (f: AnnouncementInput) => void;
  answered: number;
}) {
  const q = form.question;
  const locked = answered > 0;
  const lockedOptions = locked ? (q.options?.length ?? 0) : 0;
  const setQ = (patch: Partial<AnnouncementInput["question"]>) =>
    setForm({ ...form, question: { ...q, ...patch } });
  const kinds: QuestionKind[] = ["none", "yes_no", "single", "multiple", "number"];
  const options = q.options || [];

  const pickKind = (kind: QuestionKind) => {
    if (locked) return;
    if (kind === "single" || kind === "multiple") {
      setQ({ kind, options: options.length >= 2 && q.kind !== "yes_no" ? options : ["", ""] });
    } else setQ({ kind });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className={labelCls}>Ask a question</p>
        <div className="flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              disabled={locked && k !== q.kind}
              onClick={() => pickKind(k)}
              className={cn(
                "h-10 px-3 rounded-xl border text-[12px] font-bold transition-colors disabled:opacity-40",
                q.kind === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 hover:bg-muted/40 text-muted-foreground",
              )}
            >
              {QUESTION_LABEL[k]}
            </button>
          ))}
        </div>
        {locked && (
          <p className="flex items-center gap-1.5 text-[12px] text-amber-700 ml-1">
            <Lock className="h-3.5 w-3.5" /> {answered}{" "}
            {answered === 1 ? "person has" : "people have"} answered. You can add choices at the
            end, not change the ones they picked.
          </p>
        )}
      </div>

      {q.kind !== "none" && (
        <div className="space-y-3 rounded-2xl border border-border/50 p-3">
          <div className="space-y-1.5">
            <label htmlFor="notice-prompt" className={labelCls}>
              Question (optional)
            </label>
            <Input
              id="notice-prompt"
              maxLength={300}
              value={q.prompt || ""}
              onChange={(e) => setQ({ prompt: e.target.value })}
              placeholder={
                q.kind === "number"
                  ? "e.g. How many Navratri passes do you need?"
                  : "e.g. Will you come for the movie on Sunday?"
              }
              className={inputCls}
            />
          </div>

          {(q.kind === "single" || q.kind === "multiple") && (
            <div className="space-y-1.5">
              <p className={labelCls}>Choices</p>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Choice ${i + 1}`}
                    maxLength={100}
                    value={o}
                    disabled={i < lockedOptions}
                    onChange={(e) =>
                      setQ({ options: options.map((x, j) => (j === i ? e.target.value : x)) })
                    }
                    placeholder={`Choice ${i + 1}`}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    aria-label={`Remove choice ${i + 1}`}
                    disabled={i < lockedOptions || options.length <= 2}
                    onClick={() => setQ({ options: options.filter((_, j) => j !== i) })}
                    className="h-11 w-11 shrink-0 rounded-xl border border-border/50 flex items-center justify-center text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {options.length < OPTIONS_MAX && (
                <button
                  type="button"
                  onClick={() => setQ({ options: [...options, ""] })}
                  className="h-10 px-3 rounded-xl border border-dashed border-primary/40 text-primary text-[12px] font-bold flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add choice
                </button>
              )}
            </div>
          )}

          {q.kind === "number" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <label htmlFor="notice-min" className={labelCls}>
                  Lowest
                </label>
                <Input
                  id="notice-min"
                  type="number"
                  inputMode="numeric"
                  value={q.min ?? ""}
                  onChange={(e) =>
                    setQ({ min: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notice-max" className={labelCls}>
                  Highest
                </label>
                <Input
                  id="notice-max"
                  type="number"
                  inputMode="numeric"
                  value={q.max ?? ""}
                  onChange={(e) =>
                    setQ({ max: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="No limit"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notice-unit" className={labelCls}>
                  Unit
                </label>
                <Input
                  id="notice-unit"
                  maxLength={20}
                  value={q.unit || ""}
                  onChange={(e) => setQ({ unit: e.target.value })}
                  placeholder="passes"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <Tick
            on={q.allowChange !== false}
            onClick={() => setQ({ allowChange: q.allowChange === false })}
            icon={RefreshCw}
            title="Employees can change their answer"
            text="Until answers close. Untick to take only the first answer."
          />

          <div className="space-y-1.5">
            <label htmlFor="notice-closes" className={labelCls}>
              Answers close (optional)
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="notice-closes"
                type="datetime-local"
                value={toLocalInput(form.closesAt)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    closesAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
                className={inputCls}
              />
              {form.closesAt && (
                <button
                  type="button"
                  aria-label="No closing time"
                  onClick={() => setForm({ ...form, closesAt: null })}
                  className="h-11 w-11 shrink-0 rounded-xl border border-border/50 flex items-center justify-center text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface Named {
  _id: string;
  name?: string;
  title?: string;
  phone?: string;
  status?: string;
}

const listQuery = (key: string, url: string) => ({
  queryKey: ["notice-audience", key],
  queryFn: async () => {
    const { data } = await apiClient.get(url, { quietUpgrade: true });
    return (Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []) as (Named &
      AudiencePerson)[];
  },
  staleTime: 60_000,
  retry: false,
});

const MODES: { mode: AudienceMode; label: string }[] = [
  { mode: "all", label: "Everyone" },
  { mode: "branches", label: "By branch" },
  { mode: "departments", label: "By department" },
  { mode: "shifts", label: "By shift" },
  { mode: "employees", label: "Pick employees" },
];

/** "Who sees it": everyone, branches, departments, shifts or picked employees. */
export function NoticeAudienceFields({
  form,
  setForm,
}: {
  form: AnnouncementInput;
  setForm: (f: AnnouncementInput) => void;
}) {
  const { mode, ids } = form.audience;
  const [search, setSearch] = useState("");
  const employees = useQuery(listQuery("employees", "/users/employees"));
  const branches = useQuery({
    ...listQuery("branches", "/branches"),
    enabled: mode === "branches",
  });
  const departments = useQuery({
    ...listQuery("departments", "/departments"),
    enabled: mode === "departments",
  });
  const shifts = useQuery({ ...listQuery("shifts", "/shifts"), enabled: mode === "shifts" });

  const active = useMemo(
    () => (employees.data || []).filter((e) => e.status !== "inactive"),
    [employees.data],
  );
  const source =
    mode === "branches"
      ? branches
      : mode === "departments"
        ? departments
        : mode === "shifts"
          ? shifts
          : employees;
  const items = mode === "employees" ? active : source.data || [];

  // How many employees each group holds, so "Kitchen (4)" says what ticking it means.
  const countFor = (id: string) => active.filter((e) => personInAudience(mode, [id], e)).length;
  const reach =
    mode === "all" ? active.length : active.filter((e) => personInAudience(mode, ids, e)).length;

  const needle = search.trim().toLowerCase();
  const shown = items.filter(
    (x) => !needle || `${x.name || x.title || ""} ${x.phone || ""}`.toLowerCase().includes(needle),
  );
  const setIds = (next: string[]) => setForm({ ...form, audience: { mode, ids: next } });
  const toggle = (id: string) =>
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  return (
    <div className="space-y-2">
      <p className={labelCls}>Who sees it</p>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => {
              setSearch("");
              setForm({ ...form, audience: { mode: m.mode, ids: [] } });
            }}
            className={cn(
              "h-10 px-3 rounded-xl border text-[12px] font-bold transition-colors",
              mode === m.mode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 hover:bg-muted/40 text-muted-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode !== "all" && (
        <div className="rounded-2xl border border-border/50 p-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${mode}...`}
                aria-label="Search the list"
                className={cn(inputCls, "pl-9")}
              />
            </div>
            <button
              type="button"
              onClick={() => setIds([...new Set([...ids, ...shown.map((x) => x._id)])])}
              className="h-11 px-3 rounded-xl border border-border/50 text-[12px] font-bold text-primary whitespace-nowrap"
            >
              Tick all
            </button>
            {ids.length > 0 && (
              <button
                type="button"
                onClick={() => setIds([])}
                className="h-11 px-3 rounded-xl border border-border/50 text-[12px] font-bold text-muted-foreground whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
            {source.isLoading ? (
              <p className="p-3 text-[12px] text-muted-foreground">Loading...</p>
            ) : source.isError ? (
              <p className="p-3 text-[12px] text-destructive">
                Could not load this list. You may not have access to it.
              </p>
            ) : shown.length === 0 ? (
              <p className="p-3 text-[12px] text-muted-foreground">
                Nothing to pick{needle ? " for that search" : ""}.
              </p>
            ) : (
              shown.map((x) => {
                const on = ids.includes(x._id);
                return (
                  <button
                    key={x._id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(x._id)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left",
                      on ? "bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "h-5 w-5 shrink-0 rounded-md border-2 flex items-center justify-center",
                        on ? "bg-primary border-primary" : "border-border/80",
                      )}
                    >
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="min-w-0 flex-1 text-[13px] font-semibold truncate">
                      {x.name || x.title || "Unnamed"}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {mode === "employees" ? x.phone || "" : `${countFor(x._id)} staff`}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground ml-1">
        <Users className="h-3.5 w-3.5" />
        {employees.isLoading
          ? "Counting..."
          : `Reaches ${reach} active employee${reach === 1 ? "" : "s"}${mode !== "all" ? ` (${ids.length} picked)` : ""}`}
      </p>
    </div>
  );
}
