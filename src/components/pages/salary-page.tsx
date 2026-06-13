import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion } from 'framer-motion'
import { Search, Eye, Download, Filter } from 'lucide-react'
import { mockSalary } from '@/lib/mock-data'
import { toast } from 'sonner'

export function SalaryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'approved' | 'pending'>('all')
  const [monthFilter, setMonthFilter] = useState('April 2024')
  const [salary, setSalary] = useState(mockSalary)

  const filteredSalary = salary.filter(record => {
    const matchesSearch = record.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         record.employeeId.includes(searchQuery)
    const matchesStatus = statusFilter === 'all' || record.status === statusFilter
    const matchesMonth = record.month === monthFilter
    return matchesSearch && matchesStatus && matchesMonth
  })

  const handleDownload = (employeeId: string) => {
    toast.success(`Salary slip downloaded for employee ${employeeId}`)
  }

  const getTotalStats = () => {
    const total = filteredSalary.reduce((acc, r) => ({
      baseSalary: acc.baseSalary + r.baseSalary,
      bonus: acc.bonus + r.bonus,
      deductions: acc.deductions + r.deductions,
      net: acc.net + r.netSalary
    }), { baseSalary: 0, bonus: 0, deductions: 0, net: 0 })
    return total
  }

  const stats = getTotalStats()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Salary Management</h1>
        <p className="text-slate-600 dark:text-slate-400">View and manage employee salaries</p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Base Salary</p>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                ৳{stats.baseSalary.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Bonus</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                ৳{stats.bonus.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Deductions</p>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                ৳{stats.deductions.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Net Salary</p>
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                ৳{stats.net.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search by employee name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="w-full md:w-40 border-2 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="April 2024">April 2024</SelectItem>
                <SelectItem value="March 2024">March 2024</SelectItem>
                <SelectItem value="February 2024">February 2024</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full md:w-40 border-2 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Salary Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800">
            <CardTitle>Salary Records for {monthFilter}</CardTitle>
            <CardDescription>{filteredSalary.length} records found</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Employee</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Base Salary</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Bonus</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Deductions</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Net Salary</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredSalary.map((record, index) => (
                    <motion.tr
                      key={record.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{record.employeeName}</p>
                          <p className="text-xs text-slate-500">{record.employeeId}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 dark:text-white">৳{record.baseSalary.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          {record.bonus > 0 ? '+' : ''}৳{record.bonus.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-red-600 dark:text-red-400 font-medium">
                          -৳{record.deductions.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-bold text-slate-900 dark:text-white">৳{record.netSalary.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant={record.status === 'paid' ? 'default' : record.status === 'approved' ? 'secondary' : 'outline'}
                          className={
                            record.status === 'paid' ? 'bg-green-600 text-white' :
                            record.status === 'approved' ? 'bg-blue-600 text-white' :
                            'border-yellow-500 text-yellow-700'
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(record.employeeId)}>
                          <Download className="w-4 h-4" />
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default SalaryPage
