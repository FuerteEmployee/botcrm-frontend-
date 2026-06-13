import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { Plus, Search, Edit, Trash2, Eye, AlertCircle } from 'lucide-react'
import { employees, branches, mockDepartments, Employee } from '@/lib/mock-data'
import { toast } from 'sonner'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export function EmployeesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isOpen, setIsOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [employeeList, setEmployeeList] = useState(employees)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    position: '',
    departmentId: '',
    branchId: '',
    salary: 0,
    status: 'active' as 'active' | 'inactive'
  })

  const filteredEmployees = employeeList.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         emp.phone.includes(searchQuery)
    const matchesFilter = filter === 'all' || emp.status === filter
    return matchesSearch && matchesFilter
  })

  const handleOpenDialog = (employee?: Employee) => {
    if (employee) {
      setEditingEmployee(employee)
      setFormData({
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        position: employee.role,
        departmentId: '',
        branchId: '',
        salary: employee.salary,
        status: employee.status
      })
    } else {
      setEditingEmployee(null)
      setFormData({
        name: '',
        email: '',
        phone: '',
        position: '',
        departmentId: '',
        branchId: '',
        salary: 0,
        status: 'active'
      })
    }
    setIsOpen(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.email) {
      toast.error('Please fill in all required fields')
      return
    }

    if (editingEmployee) {
      setEmployeeList(prev => prev.map(emp =>
        emp.id === editingEmployee.id
          ? { ...emp, ...formData }
          : emp
      ))
      toast.success('Employee updated successfully')
    } else {
      const newEmployee: Employee = {
        id: `EMP${(employeeList.length + 1).toString().padStart(3, '0')}`,
        ...formData
      }
      setEmployeeList(prev => [...prev, newEmployee])
      toast.success('Employee added successfully')
    }
    setIsOpen(false)
  }

  const handleDelete = (id: string) => {
    setEmployeeList(prev => prev.filter(emp => emp.id !== id))
    toast.success('Employee deleted successfully')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Employees</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage your workforce with ease</p>
      </motion.div>

      {/* Tools Bar */}
      <Card className="border-0 shadow-md mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-full md:w-40 border-2 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => handleOpenDialog()} className="gap-2 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
              <Plus className="w-4 h-4" />
              Add Employee
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800">
            <CardTitle>Employee Directory</CardTitle>
            <CardDescription>{filteredEmployees.length} employees found</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Position</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Salary</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredEmployees.map((employee, index) => (
                    <motion.tr
                      key={employee.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={employee.avatar} />
                            <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-900 dark:text-white">{employee.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{employee.role}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm">{employee.email}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">৳{employee.salary.toLocaleString()}</td>
                      <td className="px-6 py-4">
                        <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                          {employee.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(employee)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" onClick={() => handleDelete(employee.id)} />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add New Employee'}</DialogTitle>
            <DialogDescription>Fill in the employee details and click save</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Name *</label>
              <Input
                placeholder="Full Name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Email *</label>
              <Input
                type="email"
                placeholder="email@company.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Phone</label>
              <Input
                placeholder="017XXXXXXXX"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Position</label>
              <Input
                placeholder="Job Title"
                value={formData.position}
                onChange={(e) => setFormData(prev => ({ ...prev, position: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Department</label>
              <Select value={formData.departmentId} onValueChange={(v) => setFormData(prev => ({ ...prev, departmentId: v }))}>
                <SelectTrigger className="border-2 border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {mockDepartments.map(dept => (
                    <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Salary</label>
              <Input
                type="number"
                placeholder="50000"
                value={formData.salary}
                onChange={(e) => setFormData(prev => ({ ...prev, salary: parseFloat(e.target.value) }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Status</label>
              <Select value={formData.status} onValueChange={(v) => setFormData(prev => ({ ...prev, status: v as any }))}>
                <SelectTrigger className="border-2 border-slate-200 dark:border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default EmployeesPage
