import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { Search, Clock, CheckCircle, XCircle, RotateCcw, Loader2, Plus } from 'lucide-react';
import { useAdvanceSalaryService } from '@/services/advance-salary-service';
import { NewRequestModal } from './NewRequestModal';

const RUPEE_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

interface MyAdvanceSalaryProps {
  onOpenNewRequest?: () => void;
}

export function MyAdvanceSalary({ onOpenNewRequest }: MyAdvanceSalaryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'repaid'>('all');
  const [newRequestOpen, setNewRequestOpen] = useState(false);

  const {
    requests,
    summary,
    isLoading,
    createRequest,
    isCreating,
  } = useAdvanceSalaryService();

  // Filter to only user's requests and apply filters
  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((req) => req.status === statusFilter);
    }

    // Search by type or reason
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (req) =>
          req.type.toLowerCase().includes(query) ||
          req.reason.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [requests, statusFilter, searchQuery]);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-700 dark:text-yellow-400';
      case 'approved':
        return 'text-green-700 dark:text-green-400';
      case 'rejected':
        return 'text-red-700 dark:text-red-400';
      case 'repaid':
        return 'text-blue-700 dark:text-blue-400';
      default:
        return 'text-slate-700 dark:text-slate-400';
    }
  };

  return (
    <div className="w-full">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
              My Requests
            </h1>
            <p className="text-slate-600 dark:text-slate-400">View your advance salary and loan requests</p>
          </div>
          <Button
            onClick={() => setNewRequestOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-bold rounded-lg"
          >
            + New Request
          </Button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Pending', value: summary.pending || 0, color: 'from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20', textColor: 'text-yellow-700 dark:text-yellow-400' },
          { label: 'Approved', value: summary.approved || 0, color: 'from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20', textColor: 'text-green-700 dark:text-green-400' },
          { label: 'Rejected', value: summary.rejected || 0, color: 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20', textColor: 'text-red-700 dark:text-red-400' },
          { label: 'Repaid', value: summary.repaid || 0, color: 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20', textColor: 'text-blue-700 dark:text-blue-400' },
        ].map((stat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className={`bg-linear-to-br ${stat.color} border-0 shadow-md`}>
              <CardContent className="p-6">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                  {stat.label}
                </p>
                <p className={`text-3xl font-bold ${stat.textColor}`}>
                  {RUPEE_FORMATTER.format(stat.value)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="mb-8 flex gap-3 flex-col md:flex-row">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
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
              <Button
                onClick={() => setNewRequestOpen(true)}
                variant="outline"
                className="rounded-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create your first request
              </Button>
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
                    {/* Left: Request Type & Date */}
                    <div className="flex gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs font-semibold rounded-md">
                            {request.type === 'advance-salary' ? 'Advance Salary' : 'Loan'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(request.createdAt).toLocaleDateString('en-IN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Middle: Reason */}
                    <div className="flex-1">
                      <p className="text-sm italic text-slate-600 dark:text-slate-400">
                        "{request.reason}"
                      </p>
                      {request.notes && (
                        <p className="text-xs text-muted-foreground mt-1">📝 {request.notes}</p>
                      )}
                    </div>

                    {/* Right: Amount & Status */}
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

                      {/* Additional Info */}
                      {request.reviewedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Reviewed by: <span className="font-semibold">{request.reviewedBy?.name}</span>
                        </p>
                      )}
                      {request.repaidAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Repaid on: {new Date(request.repaidAt).toLocaleDateString('en-IN')}
                        </p>
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
    </div>
  );
}
