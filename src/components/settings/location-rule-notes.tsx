import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert, UserCog } from "lucide-react";
import { apiClient } from "@/lib/api-client";

// Two notes that stop the company switch and the per-employee / per-branch
// settings from silently contradicting each other. On 10 Oct a company had
// "Require location" on while every branch had its location check off: the
// old app refused every punch, lunch and punch-out, and four employees with
// their own rule kept the problem after the company switch was turned off.

interface EmployeeRuleRow {
  _id: string;
  name: string;
  status?: string;
  attendanceExceptions?: { overrideGlobal?: boolean; requireLocation?: boolean };
}

function useOwnRuleEmployees() {
  return useQuery({
    queryKey: ["location-rule-employees"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/employees");
      const rows = (Array.isArray(data) ? data : []) as EmployeeRuleRow[];
      return rows.filter((e) => e.status !== "inactive" && e.attendanceExceptions?.overrideGlobal);
    },
    staleTime: 60_000,
  });
}

/**
 * Under Settings → Geofencing: who does NOT follow this switch, because they
 * have their own rule (Employees → Attendance Exceptions).
 */
export function OwnLocationRulesNote() {
  const { data } = useOwnRuleEmployees();
  if (!data || data.length === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px]">
      <UserCog className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
      <div className="min-w-0">
        <p className="font-bold text-foreground">
          {data.length} employee{data.length === 1 ? " has" : "s have"} their own location rule and {data.length === 1 ? "does" : "do"} not follow this switch
        </p>
        <p className="text-muted-foreground mt-0.5 leading-relaxed">
          {data.map((e, i) => (
            <span key={e._id}>
              {i > 0 && ", "}
              <Link to="/employees/$employeeId" params={{ employeeId: e._id }} className="font-semibold text-primary underline-offset-2 hover:underline">
                {e.name?.trim() || "Employee"}
              </Link>{" "}
              ({e.attendanceExceptions?.requireLocation ? "location required" : "not required"})
            </span>
          ))}
          . Change it on each employee under Attendance Exceptions.
        </p>
      </div>
    </div>
  );
}

/**
 * In the branch form, when its location check is switched off while the
 * company still requires a location.
 */
export function BranchFenceOffNote() {
  const settings = useQuery({
    queryKey: ["settings-require-location"],
    queryFn: async () => {
      const { data } = await apiClient.get("/settings");
      return data?.attendance?.requireLocation === true;
    },
    staleTime: 60_000,
  });
  const own = useOwnRuleEmployees();
  const ownRequire = (own.data || []).filter((e) => e.attendanceExceptions?.requireLocation).length;
  if (!settings.data && ownRequire === 0) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px]">
      <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
      <p className="text-muted-foreground leading-relaxed">
        <span className="font-bold text-foreground">
          {settings.data ? "Geofencing is on in Settings" : `${ownRequire} employee(s) have "Require location" on their own rule`}.
        </span>{" "}
        With this branch's check off, its staff on the current app punch without a location check, but staff still on the
        old app (1.2) are refused every punch, lunch and punch-out. If you do not want location checks, turn Geofencing off
        in Settings (and on any employee with their own rule) as well.
      </p>
    </div>
  );
}
