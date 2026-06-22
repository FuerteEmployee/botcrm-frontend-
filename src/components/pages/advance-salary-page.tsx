import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { motion } from 'framer-motion';
import { Search, Clock, CheckCircle, XCircle, RotateCcw, Loader2, Trash2, Check, X } from 'lucide-react';
import { useAdvanceSalaryService, type AdvanceSalaryRequest } from '@/services/advance-salary-service';
import { NewRequestModal } from './NewRequestModal';
import { useAuth } from '@/hooks/use-auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function AdvanceSalaryPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'repaid'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'advance-salary' | 'loan'>('all');
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  const {
    requests,
    summary,
    isLoading,
    createRequest,
    approveRequest,
    rejectRequest,
    markRepaid,
    isCreating,
    isApproving,
    isRejecting,
    isMarkingRepaid,
    refetch,
  } = useAdvanceSalaryService();

  // Debounced search filter
  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter((req) => req.type === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    // Search by employee name
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (req) =>
          req.employeeId.name.toLowerCase().includes(query) ||
          req.employeeId.phone.includes(query)
      );
    }

    return filtered;
  }, [requests, typeFilter, statusFilter, searchQuery]);

  // Tab counts
  const allCount = requests.length;
  const advanceSalaryCount = requests.filter((r) => r.type === 'advance-salary').length;
  const loanCount = requests.filter((r) => r.type === 'loan').length;

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

  const handleApprove = async (id: string) => {
    try {
      await approveRequest(id);
    } catch (error) {
      console.error('Error approving request:', error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectRequest(id);
    } catch (error) {
      console.error('Error rejecting request:', error);
    }
  };

  const handleMarkRepaid = async (id: string) => {
    try {
      await markRepaid(id);
    } catch (error) {
      console.error('Error marking as repaid:', error);
    }
  };

  const isAdminRole = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
              Advance Salary & Loan
            </h1>
            <p className="text-slate-600 dark:text-slate-400">Manage advance salary and loan requests</p>
          </div>
          {user?.role === 'employee' && (
            <Button
              onClick={() => setNewRequestOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-bold rounded-lg"
            >
              + New Request
            </Button>
          )}
        </div>
      </motion.div>

      {/* Stat Cards */}
      {isAdminRole && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'PENDING',
              value: summary.pending || 0,
              icon: Clock,
              color: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20',
              textColor: 'text-yellow-700 dark:text-yellow-400',
            },
            {
              label: 'APPROVED',
              value: summary.approved || 0,
              icon: CheckCircle,
              color: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20',
              textColor: 'text-green-700 dark:text-green-400',
            },
            {
              label: 'REJECTED',
              value: summary.rejected || 0,
              icon: XCircle,
              color: 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20',
              textColor: 'text-red-700 dark:text-red-400',
            },
            {
              label: 'REPAID',
              value: summary.repaid || 0,
              icon: RotateCcw,
              color: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
              textColor: 'text-blue-700 dark:text-blue-400',
            },
          ].map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card className={`bg-linear-to-br ${stat.color} border-0 shadow-md`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                        {stat.label}
                      </p>
                      <p className={`text-3xl font-bold ${stat.textColor}`}>
                        {RUPEE_FORMATTER.format(stat.value)}
                      </p>
                    </div>
                    <stat.icon className={`w-10 h-10 ${stat.textColor} opacity-20`} />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tab Filters & Controls */}
      <div className="mb-8 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: `All (${allCount})`, value: 'all' },
            { id: 'advance', label: `Advance Salary (${advanceSalaryCount})`, value: 'advance-salary' },
            { id: 'loan', label: `Loan (${loanCount})`, value: 'loan' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.value as any)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                typeFilter === tab.value
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Filters Row */}
        <div className="flex gap-3 flex-col md:flex-row">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-lg border-slate-200 dark:border-slate-700"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger className="w-full md:w-[180px] h-10 rounded-lg">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="repaid">Repaid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-8 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No requests found</p>
              {user?.role === 'employee' && (
                <Button
                  onClick={() => setNewRequestOpen(true)}
                  variant="outline"
                  className="rounded-lg"
                >
                  Create your first request
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredRequests.map((request, idx) => (
            <motion.div
              key={request._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="hover:shadow-lg transition-shadow border-0 shadow-md">
                <CardContent className="p-4 md:p-6">
                  <div className="flex gap-4 flex-col md:flex-row md:items-center md:justify-between">
                    {/* Left: Employee Info */}
                    <div className="flex gap-4 items-start">
                      <Avatar className="w-12 h-12">
                        <AvatarImage src={request.employeeId.profileImage} />
                        <AvatarFallback>{request.employeeId.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-base text-slate-900 dark:text-white">{request.employeeId.name}</h3>
                          <Badge variant="outline" className="text-xs font-semibold rounded-md">
                            {request.type === 'advance-salary' ? 'Advance Salary' : 'Loan'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{request.employeeId.phone}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Middle: Reason & Amount */}
                    <div className="hidden md:flex flex-1 flex-col">
                      <p className="text-sm italic text-slate-600 dark:text-slate-400 mb-2">
                        "{request.reason}"
                      </p>
                    </div>

                    {/* Right: Amount & Status & Actions */}
                    <div className="flex gap-4 items-center justify-between md:justify-end md:flex-col md:items-end">
                      <div className="text-right">
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {RUPEE_FORMATTER.format(request.amount)}
                        </p>
                        <Badge variant={getStatusBadgeVariant(request.status)} className="mt-2 rounded-md">
                          <span className="flex items-center gap-1">
                            {getStatusIcon(request.status)}
                            <span className="capitalize">{request.status}</span>
                          </span>
                        </Badge>
                      </div>

                      {/* Action Buttons (Admin Only) */}
                      {isAdminRole && (
                        <div className="flex gap-2 mt-4 md:mt-0">
                          {request.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800/40 dark:text-green-400 dark:hover:bg-green-950/30"
                                onClick={() => handleApprove(request._id)}
                                disabled={isApproving}
                              >
                                {isApproving ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-950/30"
                                onClick={() => handleReject(request._id)}
                                disabled={isRejecting}
                              >
                                {isRejecting ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </Button>
                            </>
                          )}
                          {request.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800/40 dark:text-blue-400 dark:hover:bg-blue-950/30"
                              onClick={() => handleMarkRepaid(request._id)}
                              disabled={isMarkingRepaid}
                            >
                              {isMarkingRepaid ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                              Mark Repaid
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* New Request Modal */}
      <NewRequestModal
        open={newRequestOpen}
        onOpenChange={setNewRequestOpen}
        onSubmit={createRequest}
        isLoading={isCreating}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Request</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
