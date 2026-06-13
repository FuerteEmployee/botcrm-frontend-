import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { useLeaveTypeService } from "@/services/leave-type-service";
import { 
  Calendar, CheckCircle, XCircle, Clock, Plus, HelpCircle, 
  Layers, AlertCircle, Sparkles, RefreshCw, Info, CalendarRange
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion } from "framer-motion";

export const Route = createFileRoute("/user/leaves")({
  component: UserLeaves,
});

interface TicketRecord {
  _id: string;
  type: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
  createdAt: string;
}

interface UserProfile {
  _id: string;
  name: string;
  recentAttendance?: Array<{
    date: string;
    status: string;
  }>;
}

function UserLeaves() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [halfDay, setHalfDay] = useState<string>("full");
  const [description, setDescription] = useState<string>("");

  // 1. Fetch User Profile
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const { data } = await apiClient.get("/users/profile");
      return data;
    },
  });

  // 2. Fetch User Applied Tickets
  const { data: tickets = [], isLoading: isTicketsLoading } = useQuery<TicketRecord[]>({
    queryKey: ["user-tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets/my-tickets");
      return data;
    },
  });

  // Filter only Leave requests
  const leaveTickets = tickets.filter(t => t.type === "Leave");

  const { leaveTypes = [], isLoading: isLeaveTypesLoading } = useLeaveTypeService();

  // Set default leave type when DB types load
  useEffect(() => {
    if (leaveTypes.length > 0 && !leaveType) {
      setLeaveType(leaveTypes[0].leaveName);
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

  // Quota Calculator — fully dynamic from DB leave types
  const getQuotaStats = () => {
    return leaveTypes.map((type, index) => {
      const totalDays = type.totalDays || 0;
      let used = 0;

      leaveTickets.forEach(ticket => {
        if (ticket.status === "approved" || ticket.status === "pending") {
          const typeMatch = ticket.reason.match(/Leave: (.*?) \|/);
          const datesMatch = ticket.reason.match(/\| (.*?) to (.*?) \|/);

          if (typeMatch && datesMatch) {
            const matchedType = typeMatch[1].trim();
            const start = new Date(datesMatch[1].trim());
            const end = new Date(datesMatch[2].trim());

            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              const isSameType =
                matchedType.toLowerCase() === type.leaveName.toLowerCase() ||
                (type.code && matchedType.toLowerCase() === type.code.toLowerCase());

              if (isSameType) {
                const diffTime = Math.abs(end.getTime() - start.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                const isHalfDay = ticket.reason.includes("Duration: half");
                used += isHalfDay ? diffDays * 0.5 : diffDays;
              }
            }
          }
        }
      });

      return {
        code: type.code || type.leaveName.substring(0, 2).toUpperCase(),
        title: type.leaveName,
        remaining: Math.max(0, totalDays - used),
        total: totalDays,
        bg: GRADIENTS[index % GRADIENTS.length],
      };
    });
  };

  const leaveQuota = getQuotaStats();

  // Apply Leave Mutation
  const createLeaveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: "Leave",
        reason: `Leave: ${leaveType} | ${startDate} to ${endDate} | Note: ${description} | Duration: ${halfDay}`,
      };
      const { data } = await apiClient.post("/tickets", payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Leave Request Submitted Successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      setOpen(false);
      // Reset form
      setStartDate("");
      setEndDate("");
      setDescription("");
      setHalfDay("full");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Submit Failed");
    }
  });

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
          const percentUsed = (used / quota.total) * 100;
          return (
            <Card key={quota.code} className="border border-white/10 dark:border-white/5 overflow-hidden shadow-md relative rounded-2xl sm:rounded-3xl group hover:shadow-lg hover:scale-[1.02] transition-all duration-300">
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

                {/* Progress bar */}
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

      {/* Applied leaves timeline list - Elegant Centered Layout */}
      <div className="max-w-4xl mx-auto space-y-4">
        
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 text-left">
          Leave Request Timeline
        </h4>

        {isTicketsLoading ? (
          <div className="space-y-3.5 animate-pulse">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[100px]" />
            ))}
          </div>
        ) : leaveTickets.length > 0 ? (
          <div className="space-y-3.5">
            {leaveTickets.map((ticket) => {
              const parts = ticket.reason.split(" | ");
              const leaveDetails = parts[0]?.replace("Leave: ", "") || "Leave Request";
              const dateDetails = parts[1] || "Period Not Defined";
              const noteDetails = parts[2]?.replace("Note: ", "") || "";

              return (
                <motion.div
                  key={ticket._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-[24px] shadow-xs border border-slate-100/50 dark:border-white/5 flex items-start justify-between gap-4 hover:shadow-soft hover:border-primary/20 dark:hover:border-white/10 transition-all duration-300 relative overflow-hidden"
                >
                  <div className={`absolute top-0 left-0 w-1.5 h-full rounded-r-full ${
                    ticket.status === "approved" ? "bg-emerald-500" : ticket.status === "rejected" ? "bg-rose-500" : "bg-amber-500"
                  }`} />
                  
                  <div className="space-y-2 flex-1 text-left pl-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-wider bg-slate-50 dark:bg-slate-805 text-slate-650 dark:text-slate-400 border-slate-200 dark:border-slate-800 px-2 py-0">
                        {leaveDetails}
                      </Badge>
                      <span className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                        <CalendarRange className="h-3.5 w-3.5 text-primary/70" />
                        {new Date(ticket.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    
                    <h4 className="text-[12px] font-bold text-slate-800 dark:text-slate-100 leading-snug">
                      {dateDetails}
                    </h4>
                    
                    {noteDetails && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic mt-1">
                        "{noteDetails}"
                      </p>
                    )}
                    
                    {ticket.adminRemark && (
                      <div className="mt-2.5 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-[10px] leading-relaxed">
                        <span className="font-bold text-[#501537] dark:text-[#7B2453] uppercase block tracking-wider text-[7.5px] mb-0.5">Admin Remark</span>
                        <span className="text-slate-600 dark:text-slate-350 font-medium italic">"{ticket.adminRemark}"</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 pt-0.5">
                    {getStatusBadge(ticket.status)}
                  </div>
                </motion.div>
              );
            })}
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
              Complete the details below to submit a time off request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-left">
            {/* Leave Type */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Leave Type</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {leaveQuota.map((quota) => (
                    <SelectItem key={quota.title} value={quota.title}>
                      {quota.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Picker Grid */}
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

            {/* Duration Type */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</Label>
              <Select value={halfDay} onValueChange={setHalfDay}>
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs">
                  <SelectValue placeholder="Full Day / Half Day" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="full">Full Day</SelectItem>
                  <SelectItem value="half">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reason */}
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
              onClick={() => createLeaveMutation.mutate()}
              disabled={createLeaveMutation.isPending || !startDate || !endDate}
              className="flex-1 bg-gradient-primary text-white font-bold rounded-xl h-10 border-none shadow-md shadow-primary/20 text-xs"
            >
              {createLeaveMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserLeaves;
