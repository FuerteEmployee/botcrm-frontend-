import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Clock, CheckCircle, XCircle, RotateCcw, Loader2, Check, X, Info, RefreshCw } from 'lucide-react';
import {
  useAdvanceSalaryService,
  isOverAdvanceCap,
  formatAdvanceAmount,
  ADVANCE_MAX_AMOUNT,
  type AdvanceSalaryRequest,
} from '@/services/advance-salary-service';
import { requestErrorMessage } from '@/services/request-error';
import { RejectReasonDialog, DIALOG_CLOSE_40 } from './reject-reason-dialog';
import { MoneyStatTile } from './money-stat-tile';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/shared/page-header';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatINR, formatINRFull } from '@/lib/format';

/**
 * Stat totals are compact (₹2.5L, ₹10Cr). Past ₹10,000 Cr a total can only
 * come from junk saved before the ₹1 crore cap (the test database holds
 * requests up to ₹5e55), so it reads "₹10000Cr+" instead of a truncated
 * twenty-digit number. Same rule as the employee page's tiles.
 */
const STAT_MAX = 1e11;
const statAmount = (n: number) => (n > STAT_MAX ? `${formatINR(STAT_MAX)}+` : formatINR(n));

/** Rows shown before "Show more". The whole list is already loaded. */
const PAGE_SIZE = 20;

const STATUS_LABELS: Record<AdvanceSalaryRequest['status'], string> = {
  pending: 'Waiting',
  approved: 'Approved',
  rejected: 'Rejected',
  repaid: 'Repaid',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "26 Sep 2026", in India time whatever the device is set to. */
function formatDate(value?: string) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * Payroll stores the 1st of the salary month it recovered the advance from,
 * as a server-local midnight. Read in India time that is still the 1st, or
 * the last evening of the month before on a UTC server -- so round to the
 * nearest month start rather than trusting getMonth().
 */
function salaryMonthLabel(value?: string) {
  if (!value) return '';
  const d = new Date(new Date(value).getTime() + 2 * 24 * 3600e3);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const typeLabel = (t: AdvanceSalaryRequest['type']) => (t === 'loan' ? 'Loan' : 'Advance Salary');

/**
 * Why the list could not be loaded, when the answer is a refusal rather than
 * a network problem. 'Try again' cannot fix a 403, and the server's own text
 * ('Access denied: no view permission for ...') is not written for people.
 */
function refusalText(error: unknown, what: string): string | null {
  const res = (error as { response?: { status?: number; data?: { featureDisabled?: boolean; requiredUpgrade?: boolean; subscriptionStatus?: string } } })?.response;
  if (res?.status !== 403) return null;
  if (res.data?.featureDisabled) return `${what} is switched off for your company. Contact support to turn it on.`;
  if (res.data?.requiredUpgrade) return `${what} is not included in your plan.`;
  if (res.data?.subscriptionStatus) return 'Your company’s plan is not active. Please renew it to continue.';
  return `You do not have permission to see ${what.toLowerCase()}. Ask your admin.`;
}


export function AdvanceSalaryPage() {
  const { session } = useAuth();
  // Only the admin decides (the server refuses sub-admins, see
  // advanceSalary.js); sub-admins with view permission see the same list.
  const isAdminRole = session?.role === 'admin' || session?.role === 'superadmin';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'repaid'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'advance-salary' | 'loan'>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Approve dialog — lets the admin approve the full amount or a lesser amount.
  const [approveTarget, setApproveTarget] = useState<AdvanceSalaryRequest | null>(null);
  const [approveAmountInput, setApproveAmountInput] = useState('');
  // Shown inside the approve dialog: a local check, or the server's refusal.
  const [approveError, setApproveError] = useState<string | null>(null);
  // Reject asks first, with an optional reason the employee will see.
  const [rejectTarget, setRejectTarget] = useState<AdvanceSalaryRequest | null>(null);
  // "Mark repaid" asks first: it takes the advance out of payroll for good.
  const [repaidTarget, setRepaidTarget] = useState<AdvanceSalaryRequest | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<AdvanceSalaryRequest | null>(null);

  const {
    requests,
    isLoading,
    isError,
    error: loadError,
    hasLoaded,
    isFetching,
    refetch,
    approveRequest,
    rejectRequest,
    markRepaid,
    isApproving,
    isRejecting,
    isMarkingRepaid,
  } = useAdvanceSalaryService();

  // One rule for every number on this page: it counts the rows the list would
  // show for it. The search applies to everything; the tiles follow the type
  // tab; the tab counts follow the status filter. The tiles used to add up
  // every request whatever tab was open, and the tabs ignored the status
  // filter, so neither matched the rows below them.
  const searched = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return requests;
    return requests.filter(
      (req) => req.employeeId?.name?.toLowerCase().includes(query) || req.employeeId?.phone?.includes(query)
    );
  }, [requests, searchQuery]);

  // Amounts saved before the ₹1 crore limit are counted but left out of the
  // money totals, which they would otherwise turn into "₹10000Cr+".
  const summary = useMemo(() => {
    const totals = { pending: 0, approved: 0, rejected: 0, repaid: 0 };
    const counts = { pending: 0, approved: 0, rejected: 0, repaid: 0 };
    let overCap = 0;
    for (const req of searched) {
      if (typeFilter !== 'all' && req.type !== typeFilter) continue;
      // Approved and repaid money is what was granted, which a partial
      // approval makes less than what was asked.
      const value =
        req.status === 'approved' || req.status === 'repaid'
          ? (req.approvedAmount ?? req.amount)
          : req.amount;
      if (req.status in totals) {
        counts[req.status] += 1;
        if (isOverAdvanceCap(value)) overCap += 1;
        else totals[req.status] += value;
      }
    }
    return { totals, counts, overCap };
  }, [searched, typeFilter]);

  const filteredRequests = useMemo(() => {
    let filtered = searched;
    if (typeFilter !== 'all') filtered = filtered.filter((req) => req.type === typeFilter);
    if (statusFilter !== 'all') filtered = filtered.filter((req) => req.status === statusFilter);
    return filtered;
  }, [searched, typeFilter, statusFilter]);

  const shownRequests = filteredRequests.slice(0, visibleCount);

  // Tab counts
  const inStatus = statusFilter === 'all' ? searched : searched.filter((r) => r.status === statusFilter);
  const allCount = inStatus.length;
  const advanceSalaryCount = inStatus.filter((r) => r.type === 'advance-salary').length;
  const loanCount = inStatus.filter((r) => r.type === 'loan').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'repaid':
        return <RotateCcw className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      case 'repaid':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const openApproveDialog = (request: AdvanceSalaryRequest) => {
    // The row offers no Approve for these; this is the backstop.
    if (isOverAdvanceCap(request.amount)) return;
    setApproveTarget(request);
    setApproveAmountInput(String(request.amount));
    setApproveError(null);
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    const amt = Number(approveAmountInput);
    // Same rules as the server (advanceSalary.js), in the same words.
    if (!approveAmountInput.trim() || !Number.isFinite(amt)) {
      setApproveError('Please enter the approved amount in numbers, for example 5000.');
      return;
    }
    if (amt < 1) {
      setApproveError('Approved amount must be at least ₹1.');
      return;
    }
    if (!Number.isInteger(amt)) {
      setApproveError('Please enter the approved amount in whole rupees, without paise.');
      return;
    }
    if (amt > approveTarget.amount) {
      setApproveError('Approved amount cannot be more than the requested amount.');
      return;
    }
    setApproveError(null);
    try {
      await approveRequest({ id: approveTarget._id, approvedAmount: amt });
      setApproveTarget(null);
    } catch (error) {
      // The server's own sentence (e.g. the over-cap refusal), kept in view.
      setApproveError(requestErrorMessage(error, 'Could not approve. Please try again.'));
    }
  };

  const confirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    await rejectRequest({ id: rejectTarget._id, adminRemark: reason || undefined });
  };

  const confirmRepaid = async () => {
    if (!repaidTarget) return;
    try {
      await markRepaid(repaidTarget._id);
      setRepaidTarget(null);
    } catch {
      // The service has already shown the reason; keep the dialog open.
    }
  };

  const stats = [
    { label: 'Waiting', value: summary.totals.pending, count: summary.counts.pending, icon: Clock, accent: 'warning' as const },
    { label: 'Approved', value: summary.totals.approved, count: summary.counts.approved, icon: CheckCircle, accent: 'success' as const },
    { label: 'Rejected', value: summary.totals.rejected, count: summary.counts.rejected, icon: XCircle, accent: 'destructive' as const },
    { label: 'Repaid', value: summary.totals.repaid, count: summary.counts.repaid, icon: RotateCcw, accent: 'info' as const },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Advance Salary & Loan"
        description={
          isAdminRole
            ? 'Approve or reject requests from your team. Approved money is taken back from salary when you choose it on the Salary page.'
            : 'Requests from your team. Only the company admin can approve or reject them.'
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <MoneyStatTile
            key={stat.label}
            label={stat.label}
            value={statAmount(stat.value)}
            subLabel={`${stat.count} ${stat.count === 1 ? 'request' : 'requests'}${typeFilter === 'loan' ? ' · loans' : typeFilter === 'advance-salary' ? ' · advances' : ''}`}
            icon={stat.icon}
            accent={stat.accent}
          />
        ))}
      </div>

      {summary.overCap > 0 && (
        <p className="-mt-3 text-[12px] text-muted-foreground">
          {summary.overCap} {summary.overCap === 1 ? 'request is' : 'requests are'} over ₹1 crore: counted above, but left out of the amounts.
        </p>
      )}

      {/* Tab Filters & Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Request type">
          {[
            { id: 'all', label: `All (${allCount})`, value: 'all' },
            { id: 'advance', label: `Advance Salary (${advanceSalaryCount})`, value: 'advance-salary' },
            { id: 'loan', label: `Loan (${loanCount})`, value: 'loan' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={typeFilter === tab.value}
              onClick={() => {
                setTypeFilter(tab.value as typeof typeFilter);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`min-h-10 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                typeFilter === tab.value
                  ? 'bg-primary text-white shadow-md'
                  : 'border border-border bg-card text-foreground/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone"
              aria-label="Search by name or phone"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="h-10 rounded-lg pl-10"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as typeof statusFilter);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-lg md:w-[180px]" aria-label="Filter by status">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Waiting</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="repaid">Repaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              Loading requests…
            </CardContent>
          </Card>
        ) : isError && !hasLoaded ? (
          // A failed load used to read as "No requests found".
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              {refusalText(loadError, 'Advance Salary & Loan') ? (
                <p className="text-sm font-medium text-foreground">{refusalText(loadError, 'Advance Salary & Loan')}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">Could not load the requests.</p>
                  <p className="text-sm text-muted-foreground">Check your internet and try again.</p>
                  <Button variant="outline" className="h-10 rounded-lg" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Try again
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                {requests.length === 0
                  ? 'No requests yet. When an employee asks for an advance or a loan from the app, it shows here.'
                  : 'No requests match this search or filter.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          shownRequests.map((request) => {
            const overCap = isOverAdvanceCap(request.amount);
            const granted = request.approvedAmount ?? request.amount;
            return (
              <Card key={request._id} className="border-border/60 shadow-sm">
                <CardContent className="p-4 md:p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    {/* Left: Employee Info + reason (visible on phones too) */}
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={request.employeeId?.profileImage} />
                        <AvatarFallback>{request.employeeId?.name?.charAt(0) || '?'}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-base font-bold text-foreground">
                            {request.employeeId?.name || 'Former employee'}
                          </h3>
                          <Badge variant="outline" className="shrink-0 rounded-md text-xs font-semibold">
                            {typeLabel(request.type)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {request.employeeId?.phone || '—'}
                          {request.branchId?.name ? ` · ${request.branchId.name}` : ''}
                        </p>
                        <p className="mt-1 line-clamp-2 text-sm italic text-foreground/80 [overflow-wrap:anywhere]">
                          “{request.reason}”
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Asked on {formatDate(request.createdAt)}</p>
                      </div>
                    </div>

                    {/* Right: Amount & Status & Actions */}
                    <div className="flex min-w-0 max-w-full flex-col gap-2 md:items-end md:text-right">
                      <div className="flex flex-wrap items-center justify-between gap-2 md:flex-col md:items-end">
                        <p className={`text-xl font-bold [overflow-wrap:anywhere] md:text-2xl ${overCap ? 'text-rose-700 dark:text-rose-400' : 'text-foreground'}`}>
                          {formatAdvanceAmount(request.amount)}
                        </p>
                        <Badge variant={getStatusBadgeVariant(request.status)} className="rounded-md text-xs">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(request.status)}
                            {STATUS_LABELS[request.status]}
                          </span>
                        </Badge>
                      </div>
                      {(request.status === 'approved' || request.status === 'repaid') &&
                        request.approvedAmount != null &&
                        request.approvedAmount !== request.amount && (
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                            Approved: {formatAdvanceAmount(granted)}
                          </p>
                        )}
                      {request.status === 'repaid' && (
                        <p className="text-xs text-muted-foreground">
                          {request.deductedInMonth
                            ? `Taken back from the ${salaryMonthLabel(request.deductedInMonth)} salary`
                            : `Marked repaid on ${formatDate(request.repaidAt)}`}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Button
                          variant="outline"
                          className="h-10 flex-1 rounded-lg md:flex-none"
                          onClick={() => setDetailsTarget(request)}
                        >
                          <Info className="h-4 w-4" />
                          Details
                        </Button>

                        {isAdminRole && request.status === 'pending' && !overCap && (
                          <Button
                            variant="outline"
                            className="h-10 flex-1 rounded-lg border-green-200 text-green-700 hover:bg-green-50 md:flex-none dark:border-green-800/40 dark:text-green-400 dark:hover:bg-green-950/30"
                            onClick={() => openApproveDialog(request)}
                          >
                            <Check className="h-4 w-4" />
                            Approve
                          </Button>
                        )}
                        {isAdminRole && request.status === 'pending' && (
                          <Button
                            variant={overCap ? 'destructive' : 'outline'}
                            className={
                              overCap
                                ? 'h-10 flex-1 rounded-lg text-white md:flex-none'
                                : 'h-10 flex-1 rounded-lg border-red-200 text-red-700 hover:bg-red-50 md:flex-none dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-950/30'
                            }
                            onClick={() => setRejectTarget(request)}
                          >
                            <X className="h-4 w-4" />
                            Reject
                          </Button>
                        )}
                        {isAdminRole && request.status === 'approved' && !isOverAdvanceCap(granted) && (
                          <Button
                            variant="outline"
                            className="h-10 flex-1 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 md:flex-none dark:border-blue-800/40 dark:text-blue-400 dark:hover:bg-blue-950/30"
                            onClick={() => setRepaidTarget(request)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            Mark repaid
                          </Button>
                        )}
                      </div>

                      {isAdminRole && request.status === 'pending' && overCap && (
                        // Saved before the ₹1 crore cap existed. The server
                        // refuses to approve it at any amount, so the only
                        // action offered is the one that clears it.
                        <p className="text-[13px] font-medium leading-snug text-rose-700 md:max-w-[280px] dark:text-rose-400">
                          This request is over {formatINRFull(ADVANCE_MAX_AMOUNT)} and cannot be approved. Reject it instead.
                        </p>
                      )}
                      {isAdminRole && request.status === 'approved' && isOverAdvanceCap(granted) && (
                        // Only possible for a row approved before the approve
                        // guard; the server refuses this too.
                        <p className="text-[13px] font-medium text-rose-700 md:max-w-[280px] dark:text-rose-400">
                          Over {formatINRFull(ADVANCE_MAX_AMOUNT)}: cannot be marked repaid, and payroll will not take it.
                        </p>
                      )}
                    </div>
                  </div>
                  {request.status === 'rejected' && request.adminRemark && (
                    <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-900 [overflow-wrap:anywhere] dark:bg-rose-500/10 dark:text-rose-200">
                      <span className="font-semibold">Reason:</span> {request.adminRemark}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        {filteredRequests.length > visibleCount && (
          <div className="flex flex-col items-center gap-1 pt-1">
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
              Show more
            </Button>
            <p className="text-xs text-muted-foreground">
              Showing {visibleCount} of {filteredRequests.length}
            </p>
          </div>
        )}
      </div>

      {/* Approve Dialog — approve full or a lesser amount */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(o) => {
          if (!o && !isApproving) setApproveTarget(null);
        }}
      >
        <DialogContent className={`sm:max-w-md ${DIALOG_CLOSE_40}`}>
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>Approve request</DialogTitle>
            <DialogDescription className="[overflow-wrap:anywhere]">
              {approveTarget
                ? `${approveTarget.employeeId?.name || 'This employee'} asked for ${formatAdvanceAmount(approveTarget.amount)} (${typeLabel(approveTarget.type)}). Approve the full amount or enter a lower amount.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="approve-amount" className="text-sm font-semibold">
              Approved amount (₹)
            </Label>
            <Input
              id="approve-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              max={approveTarget?.amount}
              value={approveAmountInput}
              onChange={(e) => {
                setApproveAmountInput(e.target.value);
                setApproveError(null);
              }}
              aria-invalid={!!approveError}
              aria-describedby={approveError ? 'approve-amount-error' : undefined}
              className="h-10 rounded-lg"
            />
            {approveTarget && (
              <div className="flex flex-wrap gap-2 pt-1">
                {[100, 75, 50].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      // Whole rupees, never above what was asked.
                      setApproveAmountInput(String(Math.floor((approveTarget.amount * pct) / 100)));
                      setApproveError(null);
                    }}
                    className="h-10 min-w-12 rounded-md bg-muted px-3 text-sm font-semibold text-foreground/80 hover:bg-muted/70"
                  >
                    {pct === 100 ? 'Full' : `${pct}%`}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The approved amount is taken back from salary when you pick this request while making the salary.
            </p>
            {approveError && (
              <p id="approve-amount-error" role="alert" className="text-sm font-medium text-destructive">
                {approveError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => setApproveTarget(null)} disabled={isApproving}>
              Cancel
            </Button>
            <Button
              className="h-10 rounded-lg bg-green-600 text-white hover:bg-green-700"
              onClick={confirmApprove}
              disabled={isApproving}
            >
              {isApproving && <Loader2 className="h-4 w-4 animate-spin" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject: confirm first, with an optional reason for the employee */}
      <RejectReasonDialog
        open={!!rejectTarget}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="Reject this request?"
        description={
          rejectTarget ? (
            <>
              {rejectTarget.employeeId?.name || 'This employee'} asked for{' '}
              <span className="font-semibold text-foreground">{formatAdvanceAmount(rejectTarget.amount)}</span>
              {' '}({typeLabel(rejectTarget.type)}).
              {rejectTarget.reason && (
                <span className="mt-1 block line-clamp-3 italic">“{rejectTarget.reason}”</span>
              )}
            </>
          ) : null
        }
        onConfirm={confirmReject}
        isLoading={isRejecting}
      />

      {/* Mark repaid: confirm first */}
      <AlertDialog
        open={!!repaidTarget}
        onOpenChange={(o) => {
          if (!o && !isMarkingRepaid) setRepaidTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as repaid?</AlertDialogTitle>
            <AlertDialogDescription className="[overflow-wrap:anywhere]">
              {repaidTarget
                ? `Do this only if ${repaidTarget.employeeId?.name || 'the employee'} has already paid back ${formatAdvanceAmount(repaidTarget.approvedAmount ?? repaidTarget.amount)} in cash or by bank transfer. It will then not be taken from their salary. This cannot be undone.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-lg" disabled={isMarkingRepaid}>
              Cancel
            </AlertDialogCancel>
            <Button className="h-10 rounded-lg" onClick={confirmRepaid} disabled={isMarkingRepaid}>
              {isMarkingRepaid && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark repaid
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details */}
      <Dialog open={!!detailsTarget} onOpenChange={(o) => !o && setDetailsTarget(null)}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto sm:max-w-md ${DIALOG_CLOSE_40}`}>
          <DialogHeader className="pr-8 text-left">
            <DialogTitle>{detailsTarget ? typeLabel(detailsTarget.type) : 'Request'}</DialogTitle>
            <DialogDescription>
              {detailsTarget?.employeeId?.name || 'Former employee'}
              {detailsTarget?.employeeId?.phone ? ` · ${detailsTarget.employeeId.phone}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detailsTarget && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-semibold">{STATUS_LABELS[detailsTarget.status]}</dd>
              <dt className="text-muted-foreground">Asked for</dt>
              <dd className="font-semibold [overflow-wrap:anywhere]">{formatAdvanceAmount(detailsTarget.amount)}</dd>
              {detailsTarget.approvedAmount != null && (
                <>
                  <dt className="text-muted-foreground">Approved</dt>
                  <dd className="font-semibold [overflow-wrap:anywhere]">{formatAdvanceAmount(detailsTarget.approvedAmount)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Branch</dt>
              <dd>{detailsTarget.branchId?.name || '—'}</dd>
              <dt className="text-muted-foreground">Asked on</dt>
              <dd>{formatDate(detailsTarget.createdAt)}</dd>
              <dt className="text-muted-foreground">Reason</dt>
              <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{detailsTarget.reason}</dd>
              {detailsTarget.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{detailsTarget.notes}</dd>
                </>
              )}
              {detailsTarget.reviewedAt && (
                <>
                  <dt className="text-muted-foreground">Decided</dt>
                  <dd>
                    {formatDate(detailsTarget.reviewedAt)}
                    {detailsTarget.reviewedBy?.name ? ` by ${detailsTarget.reviewedBy.name}` : ''}
                  </dd>
                </>
              )}
              {detailsTarget.adminRemark && (
                <>
                  <dt className="text-muted-foreground">Reject reason</dt>
                  <dd className="[overflow-wrap:anywhere]">{detailsTarget.adminRemark}</dd>
                </>
              )}
              {detailsTarget.status === 'repaid' && (
                <>
                  <dt className="text-muted-foreground">Repaid</dt>
                  <dd>
                    {detailsTarget.deductedInMonth
                      ? `Taken back from the ${salaryMonthLabel(detailsTarget.deductedInMonth)} salary`
                      : `Marked repaid by hand on ${formatDate(detailsTarget.repaidAt)}`}
                  </dd>
                </>
              )}
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-10 rounded-lg" onClick={() => setDetailsTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
