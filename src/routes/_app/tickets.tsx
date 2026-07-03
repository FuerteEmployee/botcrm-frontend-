import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { GridCard } from "@/components/shared/grid-card";
import { Check, X, Clock, MessageSquare, Pencil, CalendarDays, Ticket as TicketIcon, Search, MoreVertical, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/shared/page-header";
import { ViewToggle } from "@/components/shared/view-toggle";
import { ActionButton } from "@/components/shared/action-button";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, DataTableCell, DataTableRow } from "@/components/shared/data-table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTicketService, type Ticket } from "@/services/ticket-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonLoader } from "@/components/shared/skeleton-loader";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLayoutSettings } from "@/hooks/use-layout-settings";
import { usePermission } from "@/hooks/use-permission";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/tickets")({
  component: TicketsPage,
});

function TicketsPage() {
  const { tickets, isLoading, updateTicketStatus, deleteTicket, isUpdating, isDeleting } = useTicketService();
  const [tab, setTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [remarkText, setRemarkText] = useState("");
  const { defaultLayout, updateDefaultLayout } = useLayoutSettings();
  const [view, setView] = useState<"grid" | "list">(defaultLayout);
  const { can } = usePermission();
  const canEdit = can("tickets", "edit");
  const canDelete = can("tickets", "delete");

  useEffect(() => {
    setView(defaultLayout);
  }, [defaultLayout]);

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const name = t.employeeId?.name || "";
      const matchesTab = tab === "all" || t.status === tab;
      const matchesSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [tickets, tab, search]);

  const handleStatusUpdate = async (id: string, status: string) => {
    try {
      await updateTicketStatus({ id, status, adminRemark: remarkText });
      setSelectedTicket(null);
      setRemarkText("");
    } catch (err) {
      // useTicketService's onError toast already surfaces the failure reason;
      // keep the dialog open so the admin can retry instead of silently closing it.
    }
  };

  const counts = {
    all: tickets.length,
    pending: tickets.filter((t) => t.status === "pending").length,
    approved: tickets.filter((t) => t.status === "approved").length,
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Helpdesk & Tickets" description="Manage employee queries, complaints, and requests." />
        <SkeletonLoader type="stats" count={3} />
        <SkeletonLoader type="table" count={10} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Helpdesk & Tickets"
        description="Manage employee queries, complaints, and requests."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Pending Review" value={counts.pending} icon={Clock} accent="warning" delay={0} />
        <StatCard label="Resolved" value={counts.approved} icon={Check} accent="success" delay={0.05} />
        <StatCard label="Total Tickets" value={counts.all} icon={TicketIcon} accent="primary" delay={0.1} />
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-3 py-1">
        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <ViewToggle view={view} onViewChange={updateDefaultLayout} />

          <Select value={tab} onValueChange={setTab}>
            <SelectTrigger className="w-full md:w-[130px] h-10 border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 rounded-xl text-[13px] font-medium transition-all gap-2 px-3 shadow-none">
              <div className={cn("h-2 w-2 rounded-full", tab === 'pending' ? "bg-warning" : tab === 'approved' ? "bg-success" : "bg-primary")} />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/60">
              <SelectItem value="all">All Tickets</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              placeholder="Search by employee..."
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/50 bg-background text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4"
          >
            {filtered.map((t) => (
              <GridCard
                key={t._id}
                title={t.employeeId?.name || "Unknown"}
                subtitle={t.type}
                icon={
                  <div className="bg-muted bg-linear-to-br from-primary/10 to-primary/5 text-primary text-[13px] font-black h-full w-full flex items-center justify-center uppercase">
                    {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                  </div>
                }
                statusNode={
                  <Badge
                    variant="outline"
                    className={cn(
                      "capitalize text-[10px] font-bold px-2 py-0 border-transparent rounded-full",
                      t.status === "approved" ? "bg-success/10 text-success" :
                        t.status === "pending" ? "bg-warning/15 text-warning-foreground" :
                          "bg-destructive/10 text-destructive"
                    )}
                  >{t.status}</Badge>
                }
                actions={
                  (canEdit || canDelete) ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <ActionButton variant="more" tooltip="Actions" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canEdit && (
                        <DropdownMenuItem onClick={() => { setSelectedTicket(t); setRemarkText(t.adminRemark || ""); }}>Review Ticket</DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem className="text-destructive" disabled={isDeleting} onClick={() => deleteTicket(t._id)}>Delete</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  ) : undefined
                }
              >
                <div className="space-y-3 mb-4">
                  <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tighter mb-1">Reason / Description</p>
                    <p className="text-[13px] text-foreground leading-relaxed line-clamp-3">{t.reason}</p>
                  </div>
                  <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(t.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </GridCard>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4"
          >
            <DataTable
              headers={["Employee", "Type", "Reason", "Date", "Status", "Actions"]}
              isEmpty={filtered.length === 0}
            >
              {filtered.map((t) => (
                <DataTableRow key={t._id}>
                  <DataTableCell isFirst>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/5">
                        <AvatarFallback className="bg-primary/10 text-primary text-[12px] font-bold">
                          {t.employeeId?.name?.split(" ").map(n => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-bold text-[13px] text-foreground leading-tight">{t.employeeId?.name}</span>
                        <span className="text-[11px] text-muted-foreground mt-0.5">{t.employeeId?.phone}</span>
                      </div>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">{t.type}</Badge>
                  </DataTableCell>
                  <DataTableCell className="max-w-[200px] truncate text-[13px] text-muted-foreground">{t.reason}</DataTableCell>
                  <DataTableCell className="text-[13px] text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</DataTableCell>
                  <DataTableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize text-[10px] font-bold px-2 py-0.5 border-transparent",
                        t.status === "approved" ? "bg-success/10 text-success" :
                          t.status === "pending" ? "bg-warning/15 text-warning-foreground" :
                            "bg-destructive/10 text-destructive"
                      )}
                    >{t.status}</Badge>
                  </DataTableCell>
                  <DataTableCell isLast>
                    <div className="flex justify-end items-center gap-1">
                      {canEdit && (
                        <ActionButton
                          variant="comment"
                          icon={MessageSquare}
                          tooltip="Review Ticket"
                          onClick={() => { setSelectedTicket(t); setRemarkText(t.adminRemark || ""); }}
                        />
                      )}
                      {canDelete && (
                        <ActionButton
                          variant="delete"
                          tooltip="Delete Ticket"
                          disabled={isDeleting}
                          onClick={() => deleteTicket(t._id)}
                        />
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Ticket Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(o) => { if (!o) setSelectedTicket(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Review Ticket</DialogTitle>
            <DialogDescription className="text-[12px]">Approve or reject this request with a remark.</DialogDescription>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-xl bg-muted/30 border border-border/40">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-[10px]">{selectedTicket.type}</Badge>
                  <span className="text-[11px] text-muted-foreground">{new Date(selectedTicket.createdAt).toLocaleString()}</span>
                </div>
                <p className="text-[13px] text-foreground font-medium mb-1">Employee's Reason:</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{selectedTicket.reason}</p>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-bold text-foreground">Admin Remark</label>
                <Textarea 
                  value={remarkText} 
                  onChange={(e) => setRemarkText(e.target.value)} 
                  placeholder="e.g. Approved based on documentation provided..." 
                  rows={3} 
                  className="text-[13px] rounded-xl border-border/60" 
                />
              </div>

              <div className="flex gap-2 pt-2">
                <ActionButton
                  variant="destructive"
                  showLabel
                  label="REJECT"
                  icon={X}
                  className="flex-1 h-10 rounded-xl"
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(selectedTicket._id, "rejected")}
                />
                <ActionButton
                  variant="approve"
                  showLabel
                  label="APPROVE"
                  icon={Check}
                  className="flex-1 h-10 rounded-xl bg-success text-success-foreground hover:bg-success/90"
                  disabled={isUpdating}
                  onClick={() => handleStatusUpdate(selectedTicket._id, "approved")}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
