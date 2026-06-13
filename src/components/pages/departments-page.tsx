import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import { Plus, Search, Edit, Trash2, Users, DollarSign } from 'lucide-react'
import { mockDepartments, Department } from '@/lib/mock-data'
import { toast } from 'sonner'

export function DepartmentsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [departments, setDepartments] = useState(mockDepartments)
  const [formData, setFormData] = useState({
    name: '',
    head: '',
    budget: 0,
    employees: 0
  })

  const filteredDepartments = departments.filter(dept =>
    dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    dept.head.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleOpenDialog = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept)
      setFormData({
        name: dept.name,
        head: dept.head,
        budget: dept.budget,
        employees: dept.employees
      })
    } else {
      setEditingDept(null)
      setFormData({ name: '', head: '', budget: 0, employees: 0 })
    }
    setIsOpen(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.head) {
      toast.error('Please fill in all required fields')
      return
    }

    if (editingDept) {
      setDepartments(prev => prev.map(d =>
        d.id === editingDept.id
          ? { ...d, ...formData }
          : d
      ))
      toast.success('Department updated successfully')
    } else {
      const newDept: Department = {
        id: `dept-${Date.now()}`,
        ...formData,
        createdAt: new Date()
      }
      setDepartments(prev => [...prev, newDept])
      toast.success('Department added successfully')
    }
    setIsOpen(false)
  }

  const handleDelete = (id: string) => {
    setDepartments(prev => prev.filter(d => d.id !== id))
    toast.success('Department deleted successfully')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Departments</h1>
        <p className="text-slate-600 dark:text-slate-400">Organize your company structure</p>
      </motion.div>

      {/* Tools Bar */}
      <Card className="border-0 shadow-md mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search departments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
              <Plus className="w-4 h-4" />
              Add Department
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Departments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredDepartments.map((dept, index) => (
          <motion.div
            key={dept.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
              <div className="h-1 bg-linear-to-r from-purple-500 to-purple-700"></div>
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <CardTitle className="text-xl">{dept.name}</CardTitle>
                    <CardDescription>Led by {dept.head}</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(dept)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(dept.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">Employees</span>
                  </div>
                  <span className="text-xl font-bold text-purple-600 dark:text-purple-400">{dept.employees}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-sm font-medium">Budget</span>
                  </div>
                  <span className="text-lg font-bold text-green-600 dark:text-green-400">
                    ৳{(dept.budget / 100000).toFixed(1)}L
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Created {new Date(dept.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingDept ? 'Edit Department' : 'Add New Department'}</DialogTitle>
            <DialogDescription>Fill in the department details</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Department Name *</label>
              <Input
                placeholder="e.g., Human Resources"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Department Head *</label>
              <Input
                placeholder="Head name"
                value={formData.head}
                onChange={(e) => setFormData(prev => ({ ...prev, head: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Budget</label>
              <Input
                type="number"
                placeholder="500000"
                value={formData.budget}
                onChange={(e) => setFormData(prev => ({ ...prev, budget: parseFloat(e.target.value) }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Number of Employees</label>
              <Input
                type="number"
                placeholder="5"
                value={formData.employees}
                onChange={(e) => setFormData(prev => ({ ...prev, employees: parseInt(e.target.value) }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
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

export default DepartmentsPage
