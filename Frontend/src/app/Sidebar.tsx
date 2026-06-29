import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { ShieldCheck, FolderGit2, ScanLine, GitPullRequest, Settings, LogOut } from 'lucide-react'
import { fetchMe, signOut, type User } from './api'

const NAV = [
  { icon: FolderGit2, label: 'Repositories', to: '/app', end: true },
  { icon: ScanLine, label: 'Scans', to: '/app/scans', end: false },
  { icon: GitPullRequest, label: 'Fixes', to: '/app/fixes', end: false },
  { icon: Settings, label: 'Settings', to: '/app/settings', end: false },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let active = true
    fetchMe()
      .then((u) => active && setUser(u))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const exit = async () => {
    await signOut()
    navigate('/')
  }

  const displayName = user?.name ?? user?.login ?? 'Acme Corp'
  const handle = user ? `github.com/${user.login}` : 'github.com/acme'
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/8 bg-[#06090e] h-screen sticky top-0">
      <button onClick={exit} className="flex items-center gap-2 px-5 h-16 border-b border-white/8">
        <ShieldCheck className="w-6 h-6 text-accent" />
        <span className="font-playfair italic text-white text-xl">SecureAI</span>
      </button>

      <nav className="flex flex-col gap-1 p-3 flex-1">
        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink
              key={n.label}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/8 text-white' : 'text-white/55 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
              {n.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/8">
        <div className="flex items-center gap-3 px-2 py-2">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-azure flex items-center justify-center text-[#0a0f0c] text-xs font-bold">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{displayName}</p>
            <p className="text-white/40 text-xs truncate">{handle}</p>
          </div>
          <button onClick={exit} aria-label="Sign out" className="text-white/40 hover:text-white">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
