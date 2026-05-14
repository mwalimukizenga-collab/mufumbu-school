import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)   // { full_name, role }
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    if (!userId) { setProfile(null); return }
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      fetchProfile(session?.user?.id)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  // Role helpers
  const isAdmin          = profile?.role === 'admin'
  const isAcademicMaster = profile?.role === 'academic_master'
  const isTeacher        = profile?.role === 'teacher'
  const isStaff          = isAdmin || isAcademicMaster || isTeacher

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      isAdmin, isAcademicMaster, isTeacher, isStaff,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
