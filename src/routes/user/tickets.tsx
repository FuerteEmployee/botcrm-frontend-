import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { 
  Plus, Ticket, CheckCircle, Clock, XCircle, Info, RefreshCw, Filter, Calendar
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
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/user/tickets")({
  component: UserTickets,
});

interface SupportTicket {
  _id: string;
  type: "Correction" | "Query" | "Complaint" | "Leave";
  reason: string;
  status: "pending" | "approved" | "rejected";
  adminRemark?: string;
  createdAt: string;
}

function UserTickets() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ticketType, setTicketType] = useState<string>("Correction");
  const [description, setDescription] = useState<string>("Punch Correction: ");
  
  // Category switch state
  const [ticketFilter, setTicketFilter] = useState<string>("all");

  // 1. Fetch User Tickets
  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["user-tickets"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tickets/my-tickets");
      return data;
    },
  });

  // Filter out leave tickets since they go to the Leaves portal
  const supportTickets = tickets.filter(t => t.type !== "Leave");

  // Filter based on toggle tab
  const filteredTickets = supportTickets.filter(t => {
    if (ticketFilter === "all") return true;
    return t.type.toLowerCase() === ticketFilter.toLowerCase();
  });

  // Raise Ticket Mutation
  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: ticketType,
        reason: description,
      };
      const { data } = await apiClient.post("/tickets", payload);
      return data;
    },
    onSuccess: () => {
      toast.success("Support Ticket Raised Successfully!");
      queryClient.invalidateQueries({ queryKey: ["user-tickets"] });
      setOpen(false);
      // Reset
      setDescription(ticketType === "Correction" ? "Punch Correction: " : "");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Submit Failed");
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-emerald-550/10 text-emerald-500 hover:bg-emerald-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Resolved</Badge>;
      case "rejected":
        return <Badge className="bg-rose-550/10 text-rose-500 hover:bg-rose-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Rejected</Badge>;
      default:
        return <Badge className="bg-amber-550/10 text-amber-500 hover:bg-amber-550/20 border-none rounded-full text-[8.5px] font-bold px-2.5 py-0.5">Pending</Badge>;
    }
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Title Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-left">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Helpdesk Support</h2>
          <p className="text-xs text-slate-500">
            Request manual adjustments, query HR configurations, or report system issues.
          </p>
        </div>
        
        <Button 
          onClick={() => setOpen(true)}
          className="w-full sm:w-auto bg-gradient-primary hover:opacity-95 text-white font-bold rounded-2xl h-11 px-5 border-none shadow-md shadow-primary/20 text-xs gap-2 flex items-center justify-center cursor-pointer shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Raise Ticket</span>
        </Button>
      </div>

      {/* QUICK METRICS GRID ROW */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-4xl mx-auto">
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center">
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest">Total Raised</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block">{supportTickets.length}</span>
        </Card>
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest pl-1">Pending</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">
            {supportTickets.filter(t => t.status === "pending").length}
          </span>
        </Card>
        <Card className="border border-slate-100/50 dark:border-white/5 shadow-xs bg-white/70 dark:bg-slate-900/40 backdrop-blur-md rounded-2xl p-4 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <span className="text-[8px] font-bold text-slate-400 block uppercase tracking-widest pl-1">Resolved</span>
          <span className="text-lg font-bold text-slate-850 dark:text-white mt-1 block pl-1">
            {supportTickets.filter(t => t.status === "approved").length}
          </span>
        </Card>
      </div>

      {/* CHRONOLOGICAL TICKET FEED & CATEGORIZED FILTERS ROW */}
      <div className="max-w-4xl mx-auto space-y-4">
        
        {/* Quick Category Switcher */}
        <div className="flex items-center gap-2 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md px-4 sm:px-5 py-3 rounded-2xl shadow-xs border border-slate-100/50 dark:border-white/5 overflow-x-auto whitespace-nowrap scrollbar-none max-w-full">
          <span className="text-[9.5px] font-bold uppercase text-slate-400 dark:text-slate-500 mr-2 flex items-center gap-1.5 shrink-0">
            <Filter className="h-3.5 w-3.5 text-primary/70" /> Toggle View:
          </span>
          
          {[
            { value: "all", label: "All Tickets" },
            { value: "correction", label: "Punch Corrections" },
            { value: "query", label: "IT Queries" },
            { value: "complaint", label: "Complaints" },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setTicketFilter(f.value)}
              className={`px-3.5 py-1.5 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 ${
                ticketFilter === f.value
                  ? "bg-[#501537] text-white shadow-sm"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* List display */}
        {isLoading ? (
          <div className="space-y-3.5 animate-pulse">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="p-5 bg-slate-200 dark:bg-slate-800/40 rounded-[24px] h-[100px]" />
            ))}
          </div>
        ) : filteredTickets.length > 0 ? (
          <div className="space-y-3.5">
            {filteredTickets.map((ticket) => (
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
                      {ticket.type}
                    </Badge>
                    <span className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-primary/70" />
                      {new Date(ticket.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  
                  <h4 className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-relaxed">
                    {ticket.reason}
                  </h4>
                  
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
            ))}
          </div>
        ) : (
          <div className="p-8 text-center bg-white/70 dark:bg-slate-900/40 backdrop-blur-md border border-slate-100/50 dark:border-white/5 rounded-[24px]">
            <Info className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">No tickets raised for this category yet.</p>
          </div>
        )}
      </div>

      {/* Raise Ticket Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px] sm:max-w-md rounded-3xl p-6 overflow-hidden border border-slate-100 dark:border-slate-800 dark:bg-slate-900 text-left">
          <DialogHeader className="text-left">
            <DialogTitle className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100">
              Raise Support Ticket
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Select ticket category and state your request description.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-left">
            {/* Ticket Category */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</Label>
              <Select 
                value={ticketType} 
                onValueChange={(val) => {
                  setTicketType(val);
                  setDescription(val === "Correction" ? "Punch Correction: " : "");
                }}
              >
                <SelectTrigger className="rounded-xl border-slate-200 dark:border-slate-800 h-10 text-xs">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="Correction">Punch Correction</SelectItem>
                  <SelectItem value="Query">HR Query</SelectItem>
                  <SelectItem value="Complaint">System Complaint</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Description details */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Request Description</Label>
              <Textarea 
                placeholder="Include date, approximate times and reason for correction request..." 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border-slate-200 dark:border-slate-800 min-h-[85px] text-xs px-3 focus-visible:ring-1 focus-visible:ring-primary"
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
              onClick={() => createTicketMutation.mutate()}
              disabled={createTicketMutation.isPending || !description.trim()}
              className="flex-1 bg-gradient-primary text-white font-bold rounded-xl h-10 border-none shadow-md shadow-primary/20 text-xs"
            >
              {createTicketMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default UserTickets;
