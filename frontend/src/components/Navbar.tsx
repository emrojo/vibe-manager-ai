"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { useI18n } from "@/lib/i18n-context";
import { 
  Sparkles, 
  CheckSquare, 
  ShieldAlert, 
  MessageSquare, 
  LogOut, 
  Layers, 
  GitPullRequest,
  Activity,
  Boxes,
  User as UserIcon,
  Sun,
  Moon,
  Palette,
  Globe
} from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale, locales } = useI18n();
  const pathname = usePathname();

  if (!user) return null;

  const isValidatorOrAdmin = user.role === "admin" || (user.validated_repos_count ?? 0) > 0 || Boolean(user.is_project_validator);
  const isAdmin = user.role === "admin";

  const navLinks = [
    { href: "/dashboard", label: t("navbar.my_prompts"), icon: Layers },
    { href: "/contexts", label: t("navbar.contexts"), icon: Boxes },
    ...(isAdmin ? [{ href: "/processes", label: t("navbar.processes"), icon: Activity }] : []),
    { href: "/pull-requests", label: t("navbar.my_pull_requests"), icon: GitPullRequest },
    ...(isValidatorOrAdmin ? [{ href: "/validator", label: t("navbar.validation"), icon: CheckSquare }] : []),
    ...(isAdmin ? [{ href: "/admin", label: t("navbar.admin"), icon: ShieldAlert }] : []),
    { href: "/chat", label: t("navbar.chat"), icon: MessageSquare },
  ];

  let badgeLabel = t("navbar.role_user");
  let badgeClass = "bg-blue-500/10 text-blue-400 border border-blue-500/20";
  if (user.role === "admin") {
    badgeLabel = t("navbar.role_admin");
    badgeClass = "bg-purple-500/10 text-purple-400 border border-purple-500/20";
  } else if ((user.validated_repos_count ?? 0) > 0) {
    const count = user.validated_repos_count || 1;
    badgeLabel = `${t("navbar.role_validator")} (${count} ${count === 1 ? "repo" : "repos"})`;
    badgeClass = "bg-amber-500/10 text-amber-400 border border-amber-500/20";
  }

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
                {t("navbar.brand_subtitle")}
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
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Theme Selector */}
          <div className="flex items-center bg-slate-950/70 p-1 rounded-xl border border-slate-800" title={t("navbar.theme_dark")}>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              title={t("navbar.theme_dark")}
              className={`p-1.5 rounded-lg text-xs transition-all ${
                theme === "dark"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("light")}
              title={t("navbar.theme_light")}
              className={`p-1.5 rounded-lg text-xs transition-all ${
                theme === "light"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setTheme("midnight")}
              title={t("navbar.theme_midnight")}
              className={`p-1.5 rounded-lg text-xs transition-all ${
                theme === "midnight"
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Language Selector */}
          <div className="relative">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
              aria-label={t("navbar.select_language")}
              title={t("navbar.select_language")}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 hover:text-white focus:outline-none focus:border-indigo-500 font-sans cursor-pointer transition-all shadow-sm"
            >
              {locales.map((l) => (
                <option key={l.code} value={l.code} className="bg-slate-900 text-slate-200">
                  {l.flag} {l.code.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-slate-200">{user.name}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${badgeClass}`}
              >
                {badgeLabel}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            title={t("navbar.logout")}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/20 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
