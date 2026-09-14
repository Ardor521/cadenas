import { NavLink, Outlet, Link } from 'react-router-dom';
import { Lock, Unlock, Vault, ShieldCheck } from 'lucide-react';
import { Padlock } from './Padlock';

const links = [
  { to: '/', label: 'Verrouiller', icon: Lock },
  { to: '/ouvrir', label: 'Ouvrir', icon: Unlock },
  { to: '/coffre', label: 'Coffre', icon: Vault },
  { to: '/securite', label: 'Sécurité', icon: ShieldCheck },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col relative">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[720px]" />
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-ink/70 border-b border-line/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <Padlock locked size={26} className="group-hover:-rotate-6 transition-transform" />
            <span className="font-display font-extrabold text-lg tracking-tight">Cadenas</span>
            <span className="hidden sm:inline chip ml-1">local · AES-256</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    isActive ? 'bg-brass/15 text-brass' : 'text-muted hover:text-fg hover:bg-panel-2'
                  }`
                }
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 relative">
        <Outlet />
      </main>

      <footer className="border-t border-line/70 mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between text-sm text-muted">
          <div className="flex items-center gap-2">
            <Padlock locked size={18} />
            <span>
              <span className="text-fg font-display font-bold">Cadenas</span> — vos fichiers ne quittent jamais votre appareil.
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
            <span>AES-256-GCM</span>
            <span>PBKDF2 · 600 000 it.</span>
            <span>WebCrypto</span>
            <span>0 serveur</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
