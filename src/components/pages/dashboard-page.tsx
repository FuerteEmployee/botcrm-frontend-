import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { motion } from 'framer-motion'
import { Users, UserCheck, UserX, Clock, DollarSign, TrendingUp, Calendar, AlertCircle } from 'lucide-react'
import { employees, departments, attendanceTrend, salaryDistribution } from '@/lib/mock-data'

const COLORS = ['#8B0A7A', '#a620a6', '#b830d0', '#c851ff', '#d867ff']

export function DashboardPage() {
  const today = new Date()
  const todayStr = today.toLocaleDateString()
  
  // Calculate today's stats
  const presentToday = Math.floor(Math.random() * 5) + 25
  const absentToday = Math.floor(Math.random() * 3) + 2
  const halfDayToday = Math.floor(Math.random() * 2) + 1
  const totalSalary = employees.reduce((sum, emp) => sum + emp.salary, 0)

  const stats = [
    {
      title: 'Total Employees',
      value: employees.length.toString(),
      description: `${departments.length} departments`,
      icon: Users,
      color: 'from-purple-500 to-purple-700',
      bgColor: 'bg-purple-100 dark:bg-purple-900/30'
    },
    {
      title: 'Present Today',
      value: presentToday.toString(),
      description: `${Math.round((presentToday / employees.length) * 100)}% attendance`,
      icon: UserCheck,
      color: 'from-green-500 to-green-700',
      bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
      title: 'Absent Today',
      value: absentToday.toString(),
      description: `${(100 - Math.round((presentToday / employees.length) * 100))}% absent`,
      icon: UserX,
      color: 'from-red-500 to-red-700',
      bgColor: 'bg-red-100 dark:bg-red-900/30'
    },
    {
      title: 'Half Day',
      value: halfDayToday.toString(),
      description: 'Ongoing today',
      icon: Clock,
      color: 'from-orange-500 to-orange-700',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30'
    }
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Dashboard</h1>
        <p className="text-slate-600 dark:text-slate-400">Welcome back! Here's your daily overview for {todayStr}</p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, index) => {
          const IconComponent = stat.icon
          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-linear-to-br opacity-0 hover:opacity-5 transition-opacity" />
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {stat.title}
                      </p>
                      <h3 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                        {stat.value}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-500">
                        {stat.description}
                      </p>
                    </div>
                    <div className={`${stat.bgColor} p-3 rounded-lg`}>
                      <IconComponent className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Attendance Trend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="lg:col-span-2"
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-600" />
                Attendance Trend
              </CardTitle>
              <CardDescription>Weekly attendance overview</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} minHeight={0}>
                <BarChart data={attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="present" fill="#8B0A7A" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="absent" fill="#ef4444" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Department Distribution */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" />
                Department Headcount
              </CardTitle>
              <CardDescription>Employees per department</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} minHeight={0}>
                <PieChart>
                  <Pie
                    data={departments}
                    dataKey="employees"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label
                  >
                    {departments.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Second Row of Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Salary Distribution */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-600" />
                Salary Distribution
              </CardTitle>
              <CardDescription>Cost per department (Monthly)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300} minHeight={0}>
                <BarChart data={salaryDistribution} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={100} />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Bar dataKey="value" fill="#8B0A7A" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions & Alerts */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-200 font-medium mb-2">
                  ⏰ Pending Requests
                </p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mb-3">5</p>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  Review Requests
                </Button>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-900 dark:text-amber-200 font-medium mb-2">
                  📊 Inactive Employees
                </p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mb-3">3</p>
                <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                  View Details
                </Button>
              </div>

              <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <p className="text-sm text-purple-900 dark:text-purple-200 font-medium mb-2">
                  👥 New Attendees
                </p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400 mb-3">2</p>
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                  Onboard Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}

export default DashboardPage
