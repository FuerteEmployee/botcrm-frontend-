import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { useLeaveService } from "@/services/leave-service";
import {
  CheckCircle, XCircle, Clock, Plus, AlertCircle, RefreshCw, Info, CalendarRange
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

export const Route = createFileRoute("/user/leaves")({
  component: UserLeaves,
});

function UserLeaves() {
  const [open, setOpen] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const { leaveTypes = [], isLoading: isLeaveTypesLoading } = useLeaveTypeService();
  const { leaves, isLoading: isLeavesLoading, createLeave, isCreating } = useLeaveService();

  useEffect(() => {
    if (leaveTypes.length > 0 && !leaveTypeId) {
      setLeaveTypeId(leaveTypes[0]._id);
    }
  }, [leaveTypes]);

  const GRADIENTS = [
    "from-emerald-600 to-teal-500",
    "from-blue-600 to-indigo-500",
    "from-purple-600 to-[#501537]",
    "from-amber-600 to-[#7b4611]",
    "from-rose-600 to-pink-500",
    "from-cyan-600 to-sky-500",
  ];

  // Quota — driven by the server-computed `duration` on each of the
  // employee's own leave requests (already business-day-accurate), not a
  // client-side date-math guess.
  const leaveQuota = leaveTypes.map((type, index) => {
    const totalDays = type.totalDays || 0;
    const used = leaves
      .filter((l) => l.leaveTypeId?._id === type._id && (l.status === "approved" || l.status === "pending"))
      .reduce((sum, l) => sum + l.duration, 0);

    return {
      id: type._id,
      title: type.leaveName,
      remaining: Math.max(0, totalDays - used),
      total: totalDays,
      bg: GRADIENTS[index % GRADIENTS.length],
    };
  });

  const createLeaveMutation = async () => {
    try {
      await createLeave({ leaveTypeId, startDate, endDate, reason: description });
      setOpen(false);
      setStartDate("");
      setEndDate("");
      setDescription("");
    } catch {
      // toast already shown by the service
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-550/10 text-emerald-500 hover:bg-emerald-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-rose-550/10 text-rose-500 hover:bg-rose-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Rejected</Badge>;
      default:
        return <Badge className="bg-amber-550/10 text-amber-500 hover:bg-amber-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Pending</Badge>;
    }
  };

  return (
    <div className="w-full space-y-6">

      {/* Page Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Leave Management</h2>
          <p className="text-xs text-slate-500">Track and apply for corporate time-off balances.</p>
        </div>

        <Button
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto bg-gradient-primary hover:opacity-95 text-white font-bold rounded-2xl h-11 px-5 border-none shadow-md shadow-primary/20 text-xs gap-2 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Apply Leave</span>
        </Button>
      </div>

      {/* Leave Quota Cards */}
      <div className={`grid gap-3.5 sm:gap-4 md:gap-5 ${leaveQuota.length > 0 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1"}`}>
        {isLeaveTypesLoading ? (
          <div className="col-span-full text-center py-10 text-xs text-slate-400 font-medium">Loading leave types...</div>
        ) : leaveQuota.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] border border-slate-100/50 dark:border-white/5">
            <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500">No Leave Types Configured</p>
            <p className="text-xs text-slate-400 mt-1">Please contact your administrator to set up leave policies.</p>
          </div>
        ) : null}
        {leaveQuota.map((quota) => {
          const used = quota.total - quota.remaining;
          const percentUsed = quota.total > 0 ? (used / quota.total) * 100 : 0;
          return (
            <Card key={quota.id} className="border border-white/10 dark:border-white/5 overflow-hidden shadow-md relative rounded-2xl sm:rounded-3xl group hover:shadow-lg hover:scale-[1.02] transition-all duration-300">
              <div className={`absolute inset-0 bg-gradient-to-br ${quota.bg} opacity-90`} />
              <div className="absolute inset-0 bg-radial-at-t from-white/15 to-transparent pointer-events-none" />
              <CardContent className="p-3 sm:p-5 md:p-6 text-white relative z-10 space-y-2 sm:space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[7.5px] sm:text-[9px] md:text-[10px] font-bold uppercase tracking-widest block opacity-75 truncate">{quota.title}</span>
                  <Badge className="bg-white/15 text-white border-none text-[8.5px] font-bold rounded-full px-2 py-0 hidden sm:inline-flex">
                    Active
                  </Badge>
                </div>

                <div className="flex items-baseline gap-1 text-left">
                  <h3 className="text-xl sm:text-2xl md:text-4xl font-bold tracking-tight leading-none text-white">{quota.remaining}</h3>
                  <span className="text-[8.5px] sm:text-[10px] md:text-xs font-semibold opacity-75">left</span>
                </div>

                <div className="space-y-1.5 pt-0.5 sm:pt-1">
                  <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-500"
                      style={{ width: `${100 - percentUsed}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[9px] font-bold opacity-60 hidden sm:flex">
                    <span>Used: {used} / {quota.total} days</span>
                    <span>{quota.remaining} remaining</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Applied leaves timeline list */}
      <div className="max-w-4xl mx-auto space-y-4">

        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 text-left">
          Leave Request Timeline
        </h4>

        {isLeavesLoading ? (
          <div className="space-y-3.5 animate-pulse">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[100px]" />
            ))}
          </div>
        ) : leaves.length > 0 ? (
          <div className="space-y-3.5">
            {leaves.map((leave) => (
              <motion.div
                key={leave._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] shadow-xs border border-slate-100/50 dark:border-white/5 flex items-start justify-between gap-4 hover:shadow-soft hover:border-primary/20 dark:hover:border-white/10 transition-all duration-300 relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-1.5 h-full rounded-r-full ${
                  leave.status === "approved" ? "bg-emerald-500" : leave.status === "rejected" ? "bg-rose-500" : "bg-amber-500"
                }`} />

                <div className="space-y-2 flex-1 text-left pl-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-805 text-slate-650 dark:text-slate-400 border-slate-200 dark:border-slate-800 px-2 py-0">
                      {leave.leaveTypeId?.leaveName || "Leave"}
                    </Badge>
                    <span className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5 text-primary/70" />
                      {new Date(leave.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>

                  <h4 className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    {new Date(leave.startDate).toLocaleDateString()} to {new Date(leave.endDate).toLocaleDateString()} · {leave.duration} {leave.duration === 1 ? "day" : "days"}
                  </h4>

                  {leave.reason && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic mt-1">
                      "{leave.reason}"
                    </p>
                  )}

                  {leave.adminRemark && (
                    <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-[10px] leading-relaxed">
                      <span className="font-bold text-[#501537] dark:text-[#7B2453] uppercase block tracking-wider text-[7.5px] mb-0.5">Admin Remark</span>
                      <span className="text-slate-600 dark:text-slate-350 font-medium italic">"{leave.adminRemark}"</span>
                    </div>
                  )}
                </div>

                <div className="shrink-0 pt-0.5">
                  {getStatusBadge(leave.status)}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md border border-slate-100/50 dark:border-white/5 rounded-[24px]">
            <Info className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">No leave requests logged yet.</p>
          </div>
        )}
      </div>

      {/* Apply Leave Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px] sm:max-w-md rounded-3xl p-6 overflow-hidden border border-slate-100 dark:border-slate-800 dark:bg-slate-900 text-left">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Apply Leave Request
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Weekends and holidays in the range are excluded automatically — you'll only be charged for actual working days.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-left">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leave Type</Label>
              <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {leaveTypes.map((type) => (
                    <SelectItem key={type._id} value={type._id}>
                      {type.leaveName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-405">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs px-3 focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-405">End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs px-3 focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason / Description</Label>
              <Textarea
                placeholder="Brief description of the reason for leave..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border-slate-200 dark:border-slate-800 min-h-[70px] text-xs px-3 focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2 mt-2">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl h-10 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={createLeaveMutation}
              disabled={isCreating || !startDate || !endDate || !leaveTypeId}
              className="flex-1 bg-gradient-primary text-white font-bold rounded-xl h-10 border-none shadow-md shadow-primary/20 text-xs"
            >
              {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserLeaves;
