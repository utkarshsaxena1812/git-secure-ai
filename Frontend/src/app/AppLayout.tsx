import { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck, LogOut } from 'lucide-react'
import Sidebar from './Sidebar'
import { signOut } from './api'

export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  // Reset scroll when moving between app screens.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const exit = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-ink text-white flex">
      <Sidebar />

      <div className="flex-1 min-w-0">
        {/* mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-5 h-14 border-b border-white/8 bg-[#06090e]">
          <button onClick={exit} className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <span className="font-playfair italic text-lg">SecureAI</span>
          </button>
          <button onClick={exit} aria-label="Sign out" className="text-white/50">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <Outlet />
      </div>
    </div>
  )
}
