"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center space-x-8">
            <Link href="/" className="font-bold text-xl text-indigo-600 dark:text-indigo-400">
              VibeManager AI
            </Link>
            {user && (
              <div className="hidden md:flex space-x-4 text-sm font-medium">
                <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition">
                  Dashboard
                </Link>
                <Link href="/chat" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition">
                  Chat
                </Link>
                <Link href="/processes" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition">
                  Procesos
                </Link>
                <Link href="/validator" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition">
                  Validador
                </Link>
                <Link href="/pull-requests" className="text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition">
                  PRs
                </Link>
                {user.role === "admin" && (
                  <Link href="/admin" className="text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition">
                    Admin
                  </Link>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              aria-label="Cambiar tema"
              title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              {theme === "dark" ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            {user ? (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-slate-600 dark:text-slate-300">{user.email}</span>
                <button
                  onClick={logout}
                  className="text-sm px-3 py-1.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Salir
                </button>
              </div>
            ) : (
              <div className="space-x-2">
                <Link
                  href="/login"
                  className="text-sm px-3 py-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition"
                >
                  Registro
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
