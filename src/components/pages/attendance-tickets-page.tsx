import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion } from 'framer-motion'
import { Search, CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react'
import { mockTickets, Ticket } from '@/lib/mock-data'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function AttendanceTicketsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [tickets, setTickets] = useState(mockTickets)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [remarks, setRemarks] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null)

  const filteredTickets = tickets.filter(ticket =>
    ticket.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ticket.details.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const pendingTickets = filteredTickets.filter(t => t.status === 'pending')
  const processedTickets = filteredTickets.filter(t => t.status !== 'pending')

  const handleAction = (ticket: Ticket, action: 'approve' | 'reject') => {
    setSelectedTicket(ticket)
    setActionType(action)
    setRemarks('')
    setIsDialogOpen(true)
  }

  const submitAction = () => {
    if (!selectedTicket || !actionType) return

    setTickets(prev => prev.map(t =>
      t.id === selectedTicket.id
        ? {
          ...t,
          status: actionType === 'approve' ? 'approved' : 'rejected',
          adminRemarks: remarks || undefined
        }
        : t
    ))

    toast.success(`Ticket ${actionType}d successfully`)
    setIsDialogOpen(false)
    setSelectedTicket(null)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'forgot-punch-in':
        return '⏰'
      case 'forgot-punch-out':
        return '🛑'
      case 'modify-time':
        return '⚙️'
      default:
        return '📋'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800'
      case 'approved':
        return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
      case 'rejected':
        return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
      default:
        return 'bg-slate-50 dark:bg-slate-900/30'
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Attendance & Tickets</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage employee requests and attendance issues</p>
      </motion.div>

      {/* Search Bar */}
      <Card className="border-0 shadow-md mb-6">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search by employee name or request details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-200 dark:bg-slate-800">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="w-4 h-4" />
            Pending ({pendingTickets.length})
          </TabsTrigger>
          <TabsTrigger value="processed" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            Processed ({processedTickets.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-6">
          {pendingTickets.length === 0 ? (
            <Card className="border-0 shadow-md text-center py-12">
              <CardContent>
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">No pending tickets</p>
                <p className="text-sm text-slate-500">All requests have been processed</p>
              </CardContent>
            </Card>
          ) : (
            pendingTickets.map((ticket, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border-2 shadow-md ${getStatusColor(ticket.status)}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="text-3xl">{getTypeIcon(ticket.type)}</div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                            {ticket.employeeName}
                          </h3>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {ticket.type.replace('_', ' ').toUpperCase()} Request
                          </p>
                          <p className="text-slate-700 dark:text-slate-300 mb-2">
                            {ticket.details}
                          </p>
                          <p className="text-xs text-slate-500">
                            Requested on: {new Date(ticket.requestDate).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400">
                        PENDING
                      </Badge>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAction(ticket, 'approve')}
                        className="gap-2 bg-green-600 hover:bg-green-700 text-white flex-1"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleAction(ticket, 'reject')}
                        className="gap-2 bg-red-600 hover:bg-red-700 text-white flex-1"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="processed" className="space-y-4 mt-6">
          {processedTickets.length === 0 ? (
            <Card className="border-0 shadow-md text-center py-12">
              <CardContent>
                <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600 dark:text-slate-400 font-medium">No processed tickets</p>
              </CardContent>
            </Card>
          ) : (
            processedTickets.map((ticket, index) => (
              <motion.div
                key={ticket.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border-2 shadow-md ${getStatusColor(ticket.status)}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="text-3xl">{getTypeIcon(ticket.type)}</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                              {ticket.employeeName}
                            </h3>
                            <Badge variant={ticket.status === 'approved' ? 'default' : 'secondary'}>
                              {ticket.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                            {ticket.type.replace('_', ' ').toUpperCase()} Request
                          </p>
                          <p className="text-slate-700 dark:text-slate-300 mb-2">
                            {ticket.details}
                          </p>
                          {ticket.adminRemarks && (
                            <div className="mt-3 p-3 bg-slate-100 dark:bg-slate-800 rounded text-sm">
                              <p className="font-medium text-slate-900 dark:text-white mb-1">Admin Remarks:</p>
                              <p className="text-slate-700 dark:text-slate-300">{ticket.adminRemarks}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve' : 'Reject'} Request
            </DialogTitle>
            <DialogDescription>
              {selectedTicket?.employeeName} - {selectedTicket?.type.replace('_', ' ').toUpperCase()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 font-medium">Request Details:</p>
              <p className="text-slate-900 dark:text-white">{selectedTicket?.details}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                Admin Remarks
              </label>
              <Textarea
                placeholder="Add any remarks or reason for your decision..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="border-2 border-slate-200 dark:border-slate-700"
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitAction}
              className={actionType === 'approve'
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
              }
            >
              {actionType === 'approve' ? 'Approve' : 'Reject'} Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AttendanceTicketsPage
