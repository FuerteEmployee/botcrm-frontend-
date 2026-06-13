import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion } from 'framer-motion'
import { Plus, Edit, Trash2, Users, Clock } from 'lucide-react'
import { mockShifts, mockShiftAssignments, Shift, employees } from '@/lib/mock-data'
import { toast } from 'sonner'

export function ShiftManagementPage() {
  const [shifts, setShifts] = useState(mockShifts)
  const [assignments, setAssignments] = useState(mockShiftAssignments)
  const [isOpen, setIsOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    startTime: '',
    endTime: '',
    breakTime: 0
  })
  const [selectedEmployee, setSelectedEmployee] = useState('')
  const [selectedShift, setSelectedShift] = useState('')

  const handleOpenDialog = (shift?: Shift) => {
    if (shift) {
      setEditingShift(shift)
      setFormData({
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        breakTime: shift.breakTime
      })
    } else {
      setEditingShift(null)
      setFormData({ name: '', startTime: '', endTime: '', breakTime: 0 })
    }
    setIsOpen(true)
  }

  const handleSaveShift = () => {
    if (!formData.name || !formData.startTime || !formData.endTime) {
      toast.error('Please fill in all required fields')
      return
    }

    if (editingShift) {
      setShifts(prev => prev.map(s =>
        s.id === editingShift.id
          ? { ...s, ...formData }
          : s
      ))
      toast.success('Shift updated successfully')
    } else {
      const newShift: Shift = {
        id: `shift-${Date.now()}`,
        ...formData
      }
      setShifts(prev => [...prev, newShift])
      toast.success('Shift created successfully')
    }
    setIsOpen(false)
  }

  const handleDeleteShift = (id: string) => {
    setShifts(prev => prev.filter(s => s.id !== id))
    setAssignments(prev => prev.filter(a => a.shiftId !== id))
    toast.success('Shift deleted successfully')
  }

  const handleAssignShift = () => {
    if (!selectedEmployee || !selectedShift) {
      toast.error('Please select both employee and shift')
      return
    }

    const newAssignment = {
      id: `assign-${Date.now()}`,
      employeeId: selectedEmployee,
      shiftId: selectedShift,
      startDate: new Date(),
      endDate: undefined
    }
    setAssignments(prev => [...prev, newAssignment])
    toast.success('Shift assigned successfully')
    setSelectedEmployee('')
    setSelectedShift('')
  }

  const getEmployeeName = (id: string) => {
    return employees.find(e => e.id === id)?.name || 'Unknown'
  }

  const getShiftName = (id: string) => {
    return shifts.find(s => s.id === id)?.name || 'Unknown'
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Shift Management</h1>
        <p className="text-slate-600 dark:text-slate-400">Create and assign work shifts</p>
      </motion.div>

      {/* Create/View Shifts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Shifts</CardTitle>
                <CardDescription>Manage work shift timings</CardDescription>
              </div>
              <Button onClick={() => handleOpenDialog()} className="gap-2 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
                <Plus className="w-4 h-4" />
                New Shift
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {shifts.map((shift, index) => (
                <motion.div
                  key={shift.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{shift.name}</h3>
                      <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {shift.startTime} - {shift.endTime}
                        </span>
                        <span>Break: {shift.breakTime} min</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(shift)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteShift(shift.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Assign Shift */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Assign Shift
              </CardTitle>
              <CardDescription>Assign shift to employee</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Select Employee
                </label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger className="border-2 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Choose employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                  Select Shift
                </label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger className="border-2 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Choose shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map(shift => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.name} ({shift.startTime}-{shift.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAssignShift}
                className="w-full bg-linear-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white"
              >
                Assign Now
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Assignments */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Current Assignments</CardTitle>
            <CardDescription>{assignments.length} active assignments</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 dark:bg-slate-800/50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Shift</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Timing</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Start Date</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {assignments.map((assignment, index) => {
                    const shift = shifts.find(s => s.id === assignment.shiftId)
                    return (
                      <motion.tr
                        key={assignment.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                          {getEmployeeName(assignment.employeeId)}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          {shift?.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {shift?.startTime} - {shift?.endTime}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {new Date(assignment.startDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <Badge className="bg-green-600 text-white">Active</Badge>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Shift Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? 'Edit Shift' : 'Create New Shift'}</DialogTitle>
            <DialogDescription>Set shift timing and break duration</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Shift Name *</label>
              <Input
                placeholder="e.g., Morning Shift"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Start Time *</label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  className="border-2 border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">End Time *</label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  className="border-2 border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">Break Time (minutes)</label>
              <Input
                type="number"
                placeholder="60"
                value={formData.breakTime}
                onChange={(e) => setFormData(prev => ({ ...prev, breakTime: parseInt(e.target.value) }))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveShift} className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800">
              Save Shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ShiftManagementPage
