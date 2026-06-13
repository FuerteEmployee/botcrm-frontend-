import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { motion } from 'framer-motion'
import { MapPin, Users, Radio, Clock, Search } from 'lucide-react'
import { employees } from '@/lib/mock-data'

interface TrackedEmployee {
  id: string
  name: string
  position: string
  status: 'online' | 'offline'
  lastActive: string
  lat: number
  lng: number
  location: string
  avatar: string
}

const generateTrackedEmployees = (): TrackedEmployee[] => {
  return employees.slice(0, 10).map((emp, i) => ({
    id: emp.id,
    name: emp.name,
    position: emp.role,
    status: i % 3 !== 0 ? 'online' : 'offline',
    lastActive: i % 3 === 0 ? '45 min ago' : 'Now',
    lat: 23.8 + (i * 0.05),
    lng: 90.4 + (i * 0.05),
    location: ['Gulshan', 'Dhanmondi', 'Mirpur', 'Motijheel', 'Banani', 'Baridhara', 'Ramna', 'Kawran Bazar', 'Badda', 'Faridpur'][i],
    avatar: emp.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emp.name}`
  }))
}

export function TrackingPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [trackedEmployees] = useState(generateTrackedEmployees())

  const filteredEmployees = trackedEmployees.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const onlineCount = trackedEmployees.filter(e => e.status === 'online').length
  const offlineCount = trackedEmployees.filter(e => e.status === 'offline').length

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">Employee Tracking</h1>
        <p className="text-slate-600 dark:text-slate-400">Real-time location and status monitoring</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Total Tracked</p>
              <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{trackedEmployees.length}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Online Now</p>
              <p className="text-3xl font-bold text-green-700 dark:text-green-400">{onlineCount}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card className="border-0 shadow-md bg-linear-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
            <CardContent className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Offline</p>
              <p className="text-3xl font-bold text-red-700 dark:text-red-400">{offlineCount}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-200 dark:bg-slate-800">
          <TabsTrigger value="list">Employee List</TabsTrigger>
          <TabsTrigger value="map">Map View</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-6">
          {/* Search */}
          <Card className="border-0 shadow-md mb-6">
            <CardContent className="p-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Search by name or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-2 border-slate-200 dark:border-slate-700"
                />
              </div>
            </CardContent>
          </Card>

          {/* Employee List */}
          <div className="space-y-4">
            {filteredEmployees.map((emp, index) => (
              <motion.div
                key={emp.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1">
                        <img
                          src={emp.avatar}
                          alt={emp.name}
                          className="w-12 h-12 rounded-full"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              {emp.name}
                            </h3>
                            <div className={`w-3 h-3 rounded-full ${emp.status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                            {emp.position}
                          </p>
                          <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {emp.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last active: {emp.lastActive}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={emp.status === 'online' ? 'default' : 'secondary'}
                        className={emp.status === 'online' ? 'bg-green-600 text-white' : 'bg-slate-500 text-white'}
                      >
                        {emp.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="map">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-md overflow-hidden h-[600px]">
              {/* Simplified Map Representation */}
              <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-16 h-16 text-purple-600 dark:text-purple-400 mx-auto mb-4 opacity-20" />
                    <p className="text-slate-600 dark:text-slate-400 font-medium mb-2">
                      Real-time Map View
                    </p>
                    <p className="text-sm text-slate-500">
                      {trackedEmployees.length} employees tracked
                    </p>
                  </div>
                </div>

                {/* Simulated Employee Markers */}
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                  {trackedEmployees.map((emp, idx) => {
                    const x = ((emp.lng - 90.4) / 0.5 + 0.5) * 100
                    const y = ((emp.lat - 23.8) / 0.5 + 0.5) * 100
                    return (
                      <g key={emp.id}>
                        <circle
                          cx={`${Math.max(0, Math.min(100, x))}%`}
                          cy={`${Math.max(0, Math.min(100, y))}%`}
                          r="12"
                          fill={emp.status === 'online' ? '#22c55e' : '#94a3b8'}
                          opacity="0.7"
                        />
                        <circle
                          cx={`${Math.max(0, Math.min(100, x))}%`}
                          cy={`${Math.max(0, Math.min(100, y))}%`}
                          r="12"
                          fill="none"
                          stroke={emp.status === 'online' ? '#22c55e' : '#94a3b8'}
                          strokeWidth="2"
                          opacity="0.3"
                        >
                          {emp.status === 'online' && (
                            <animate
                              attributeName="r"
                              from="12"
                              to="25"
                              dur="2s"
                              repeatCount="indefinite"
                            />
                          )}
                        </circle>
                      </g>
                    )
                  })}
                </svg>
              </div>

              {/* Legend */}
              <div className="absolute bottom-4 left-4 bg-white dark:bg-slate-900 rounded-lg shadow-lg p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Online</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-slate-400" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">Offline</span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8"
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle>Tracking Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
              <span className="text-slate-700 dark:text-slate-300">Average Response Time</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400">2.3 seconds</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <span className="text-slate-700 dark:text-slate-300">Last Update</span>
              <span className="font-semibold text-green-600 dark:text-green-400">Just now</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
              <span className="text-slate-700 dark:text-slate-300">Tracking Accuracy</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">98.5%</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

export default TrackingPage
