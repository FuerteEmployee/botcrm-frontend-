import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { Plus, Search, Edit, Trash2, MapPin, Users } from 'lucide-react'
import { mockBranches, Branch } from '@/lib/mock-data'
import { toast } from 'sonner'

export function BranchesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branches, setBranches] = useState(mockBranches)
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    manager: '',
    employees: 0
  })

  const filteredBranches = branches.filter(branch =>
    branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    branch.location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleOpenDialog = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch)
      setFormData({
        name: branch.name,
        location: branch.location,
        manager: branch.manager,
        employees: branch.employees
      })
    } else {
      setEditingBranch(null)
      setFormData({ name: '', location: '', manager: '', employees: 0 })
    }
    setIsOpen(true)
  }

  const handleSave = () => {
    if (!formData.name || !formData.location) {
      toast.error('Please fill in all required fields')
      return
    }

    if (editingBranch) {
      setBranches(prev => prev.map(b =>
        b.id === editingBranch.id
          ? { ...b, ...formData }
          : b
      ))
      toast.success('Branch updated successfully')
    } else {
      const newBranch: Branch = {
        id: `branch-${Date.now()}`,
        ...formData
      }
      setBranches(prev => [...prev, newBranch])
      toast.success('Branch added successfully')
    }
    setIsOpen(false)
  }

  const handleDelete = (id: string) => {
    setBranches(prev => prev.filter(b => b.id !== id))
    toast.success('Branch deleted successfully')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Branches</h1>
        <p className="text-slate-600 dark:text-slate-400">Manage company branches and locations</p>
      </motion.div>

      {/* Tools Bar */}
      <Card className="border-0 shadow-md mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Search branches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Button onClick={() => handleOpenDialog()} className="gap-2 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
              <Plus className="w-4 h-4" />
              Add Branch
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Branches Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredBranches.map((branch, index) => (
          <motion.div
            key={branch.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
              <div className="h-1 bg-linear-to-r from-blue-500 to-blue-700"></div>
              <CardHeader>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <CardTitle className="text-xl">{branch.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3" />
                      {branch.location}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(branch)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(branch.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">Branch Manager</span>
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">{branch.manager}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">Employees</span>
                  </div>
                  <Badge className="bg-blue-600 text-white">{branch.employees}</Badge>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
            <DialogDescription>Fill in the branch details</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Branch Name *</label>
              <Input
                placeholder="e.g., Dhaka HQ"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Location *</label>
              <Input
                placeholder="City/Area"
                value={formData.location}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Branch Manager</label>
              <Input
                placeholder="Manager name"
                value={formData.manager}
                onChange={(e) => setFormData(prev => ({ ...prev, manager: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Number of Employees</label>
              <Input
                type="number"
                placeholder="10"
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

export default BranchesPage
