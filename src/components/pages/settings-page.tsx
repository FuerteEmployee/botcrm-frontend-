import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { motion } from 'framer-motion'
import { Settings, Bell, Lock, Users, Database, Shield, Moon, Sun, LogOut, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'

export function SettingsPage() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState({
    theme: 'light' as 'light' | 'dark',
    notifications: {
      email: true,
      sms: true,
      push: true,
      dailyReport: true
    },
    security: {
      twoFactor: false,
      sessionTimeout: 30
    },
    system: {
      maintenanceMode: false,
      offlineMode: true,
      backupFrequency: 'daily'
    }
  })

  const handleNotificationToggle = (key: keyof typeof settings.notifications) => {
    setSettings(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: !prev.notifications[key]
      }
    }))
    toast.success(`${key} notifications ${!settings.notifications[key] ? 'enabled' : 'disabled'}`)
  }

  const handleSecurityChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      security: {
        ...prev.security,
        [key]: value
      }
    }))
    toast.success('Security settings updated')
  }

  const handleSystemChange = (key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      system: {
        ...prev.system,
        [key]: value
      }
    }))
    toast.success('System settings updated')
  }

  const handleLogout = () => {
    localStorage.removeItem('auth_user')
    toast.success('Logged out successfully')
    navigate({ to: '/login' })
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-3">
          <Settings className="w-8 h-8" />
          Settings
        </h1>
        <p className="text-slate-600 dark:text-slate-400">Manage your account and system preferences</p>
      </motion.div>

      {/* Theme Settings */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {settings.theme === 'light' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              Appearance
            </CardTitle>
            <CardDescription>Customize how the dashboard looks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Dark Mode</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Enable dark theme for easy on the eyes</p>
              </div>
              <Switch
                checked={settings.theme === 'dark'}
                onCheckedChange={(checked) => {
                  setSettings(prev => ({ ...prev, theme: checked ? 'dark' : 'light' }))
                  toast.success(`Switched to ${checked ? 'dark' : 'light'} mode`)
                }}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Notification Settings */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
            <CardDescription>Choose how you want to be notified</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Email Notifications</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Get updates via email</p>
              </div>
              <Switch
                checked={settings.notifications.email}
                onCheckedChange={() => handleNotificationToggle('email')}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">SMS Notifications</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Get urgent updates via SMS</p>
              </div>
              <Switch
                checked={settings.notifications.sms}
                onCheckedChange={() => handleNotificationToggle('sms')}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Push Notifications</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Get real-time push alerts</p>
              </div>
              <Switch
                checked={settings.notifications.push}
                onCheckedChange={() => handleNotificationToggle('push')}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Daily Reports</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Get daily summary reports</p>
              </div>
              <Switch
                checked={settings.notifications.dailyReport}
                onCheckedChange={() => handleNotificationToggle('dailyReport')}
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Security Settings */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Security
            </CardTitle>
            <CardDescription>Keep your account safe and secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Two-Factor Authentication</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Add extra layer of security</p>
              </div>
              <Switch
                checked={settings.security.twoFactor}
                onCheckedChange={(checked) => handleSecurityChange('twoFactor', checked)}
              />
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <p className="font-medium text-slate-900 dark:text-white mb-2">Session Timeout</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Auto logout after inactivity (minutes)</p>
              <Input
                type="number"
                value={settings.security.sessionTimeout}
                onChange={(e) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                className="border-2 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Shield className="w-4 h-4" />
              Change Password
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* System Settings */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              System
            </CardTitle>
            <CardDescription>System configuration and maintenance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings.system.maintenanceMode && (
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                  Maintenance mode is active. Only admins can access the system.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Maintenance Mode</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Temporarily disable access</p>
              </div>
              <Switch
                checked={settings.system.maintenanceMode}
                onCheckedChange={(checked) => handleSystemChange('maintenanceMode', checked)}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Offline Mode</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">Allow offline access</p>
              </div>
              <Switch
                checked={settings.system.offlineMode}
                onCheckedChange={(checked) => handleSystemChange('offlineMode', checked)}
              />
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
              <p className="font-medium text-slate-900 dark:text-white mb-2">Backup Frequency</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {['hourly', 'daily', 'weekly'].map(freq => (
                  <button
                    key={freq}
                    onClick={() => handleSystemChange('backupFrequency', freq)}
                    className={`p-2 rounded text-sm font-medium transition-colors ${
                      settings.system.backupFrequency === freq
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                    }`}
                  >
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
              Run Database Backup
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Account Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="border-0 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Account
            </CardTitle>
            <CardDescription>Manage your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full border-2 border-slate-200 dark:border-slate-700">
              Download My Data
            </Button>
            <Separator />
            <Alert className="border-red-500 bg-red-50 dark:bg-red-950/30">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800 dark:text-red-200 mt-2">
                <p className="font-medium mb-2">Danger Zone</p>
                <p className="text-sm">Once you delete your account, there is no going back. Please be certain.</p>
              </AlertDescription>
            </Alert>
            <Button variant="destructive" className="w-full bg-red-600 hover:bg-red-700 text-white">
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logout Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-8 flex gap-4"
      >
        <Button
          onClick={handleLogout}
          className="flex-1 gap-2 bg-linear-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </motion.div>
    </div>
  )
}

export default SettingsPage
