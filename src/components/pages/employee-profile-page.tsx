import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Mail, Phone, MapPin, Calendar, Building, Clock, DollarSign, CheckCircle, XCircle } from 'lucide-react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { employees, mockAttendance, mockSalary } from '@/lib/mock-data'

interface EmployeeProfilePageProps {
  employeeId?: string
}

export function EmployeeProfilePage({ employeeId = 'EMP001' }: EmployeeProfilePageProps) {
  const employee = employees.find(e => e.id === employeeId) || employees[0]
  const employeeAttendance = mockAttendance.filter(a => a.employeeId === employee.id)
  const employeeSalary = mockSalary.filter(s => s.employeeId === employee.id)

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-32 bg-linear-to-r from-purple-500 to-purple-700"></div>
          <CardContent className="p-8 -mt-16 relative">
            <div className="flex flex-col md:flex-row gap-6 items-start md:items-end">
              <Avatar className="w-32 h-32 border-4 border-white dark:border-slate-900 shadow-lg">
                <AvatarImage src={employee.avatar} />
                <AvatarFallback>{employee.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
                  {employee.name}
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-400 mb-3">
                  {employee.role}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Badge className="bg-purple-600 text-white">{employee.status}</Badge>
                  <Badge variant="outline">{employee.department}</Badge>
                  <Badge variant="outline">{employee.branch}</Badge>
                </div>
              </div>
              <Button className="bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white">
                Edit Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Mail className="w-5 h-5 text-purple-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Email</span>
              </div>
              <p className="font-medium text-slate-900 dark:text-white">{employee.email}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Phone className="w-5 h-5 text-green-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Phone</span>
              </div>
              <p className="font-medium text-slate-900 dark:text-white">{employee.phone}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Joined</span>
              </div>
              <p className="font-medium text-slate-900 dark:text-white">
                {new Date(employee.joinDate).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <DollarSign className="w-5 h-5 text-green-600" />
                <span className="text-sm text-slate-600 dark:text-slate-400">Salary</span>
              </div>
              <p className="font-medium text-slate-900 dark:text-white">
                ৳{employee.salary.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-200 dark:bg-slate-800">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Full Name</p>
                    <p className="font-medium text-slate-900 dark:text-white">{employee.name}</p>
                  </div>
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Employee ID</p>
                    <p className="font-medium text-slate-900 dark:text-white">{employee.id}</p>
                  </div>
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Position</p>
                    <p className="font-medium text-slate-900 dark:text-white">{employee.role}</p>
                  </div>
                  <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">Status</p>
                    <Badge className={employee.status === 'active' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}>
                      {employee.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Department & Branch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-2">
                      <Building className="w-4 h-4" />
                      Department
                    </p>
                    <p className="font-medium text-slate-900 dark:text-white">{employee.department}</p>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Branch
                    </p>
                    <p className="font-medium text-slate-900 dark:text-white">{employee.branch}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Attendance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {employee.attendance?.presentDays || 0}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Present Days</p>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {employee.attendance?.absentDays || 0}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Absent Days</p>
                  </div>
                  <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center">
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {employee.attendance?.halfDays || 0}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">Half Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Recent Attendance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {employeeAttendance.slice(0, 5).map((record, index) => (
                    <div key={record.id} className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {new Date(record.date).toLocaleDateString()}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          {record.punchIn} - {record.punchOut || 'Ongoing'}
                        </p>
                      </div>
                      <Badge variant={record.status === 'present' ? 'default' : 'secondary'}>
                        {record.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Salary Tab */}
        <TabsContent value="salary" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Salary History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {employeeSalary.slice(0, 3).map((record, index) => (
                    <div key={record.id} className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-slate-900 dark:text-white">{record.month}</p>
                        <Badge variant={record.status === 'paid' ? 'default' : record.status === 'approved' ? 'secondary' : 'outline'}>
                          {record.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Base</span>
                          <p className="font-medium text-slate-900 dark:text-white">৳{record.baseSalary.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Bonus</span>
                          <p className="font-medium text-green-600 dark:text-green-400">+৳{record.bonus.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-slate-600 dark:text-slate-400">Net</span>
                          <p className="font-medium text-slate-900 dark:text-white">৳{record.netSalary.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6 mt-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-md">
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center text-white mb-2">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                      <div className="w-1 h-16 bg-slate-300 dark:bg-slate-700"></div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium text-slate-900 dark:text-white">Staff joined</p>
                      <p className="text-sm text-slate-500">
                        Joined on {new Date(employee.joinDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white mb-2">
                        <Clock className="w-6 h-6" />
                      </div>
                      <div className="w-1 h-16 bg-slate-300 dark:bg-slate-700"></div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium text-slate-900 dark:text-white">1 Year Work Anniversary</p>
                      <p className="text-sm text-slate-500">
                        Completed 1 year of service
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-white">
                        <CheckCircle className="w-6 h-6" />
                      </div>
                    </div>
                    <div className="pb-4">
                      <p className="font-medium text-slate-900 dark:text-white">Last updated</p>
                      <p className="text-sm text-slate-500">
                        {new Date().toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default EmployeeProfilePage
