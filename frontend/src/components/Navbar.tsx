"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { 
  Sparkles, 
  CheckSquare, 
  ShieldAlert, 
  MessageSquare, 
  LogOut, 
  Layers, 
  GitPullRequest,
  Activity,
  User as UserIcon 
} from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const isValidatorOrAdmin = user.role === "validator" || user.role === "admin";
  const isAdmin = user.role === "admin";

  const navLinks = [
    { href: "/dashboard", label: "Mis Prompts", icon: Layers },
    ...(isAdmin ? [{ href: "/processes", label: "Procesos", icon: Activity }] : []),
    { href: "/pull-requests", label: "Mis Pull Requests", icon: GitPullRequest },
    ...(isValidatorOrAdmin ? [{ href: "/validator", label: "Validación", icon: CheckSquare }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Administración", icon: ShieldAlert }] : []),
    { href: "/chat", label: "Chat", icon: MessageSquare },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                Vibe Manager AI
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase -mt-1">
                Sandboxed Code Engine
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-inner"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Info & Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-slate-200">{user.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  user.role === "admin"
                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    : user.role === "validator"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                }`}
              >
                {user.role === "admin" ? "Admin" : user.role === "validator" ? "Validador" : "Usuario"}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Cerrar sesión"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
