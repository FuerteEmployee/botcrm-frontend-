import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export interface User {
  id: string
  name: string
  email: string
  phone: string
  role: 'admin' | 'manager' | 'employee'
  department: string
  profileImage?: string
  isActive: boolean
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (phone: string, otp: string) => Promise<void>
  logout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const login = useCallback(async (phone: string, otp: string) => {
    setIsLoading(true)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Mock validation - OTP "123456" works with any phone
    if (otp === '123456') {
      const mockUser: User = {
        id: '1',
        name: 'Md Hasib',
        email: 'hasib@beont.me',
        phone: phone,
        role: 'admin',
        department: 'Human Resources',
        profileImage: 'https://avatars.githubusercontent.com/u/1?v=4',
        isActive: true
      }
      setUser(mockUser)
      localStorage.setItem('auth_user', JSON.stringify(mockUser))
    } else {
      throw new Error('Invalid OTP')
    }
    setIsLoading(false)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('auth_user')
  }, [])

  const updateUser = useCallback((newUser: User) => {
    setUser(newUser)
    localStorage.setItem('auth_user', JSON.stringify(newUser))
  }, [])

  // Initialize user from localStorage on mount
  React.useEffect(() => {
    const savedUser = localStorage.getItem('auth_user')
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch (error) {
        console.error('Failed to parse saved user:', error)
      }
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        updateUser
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
