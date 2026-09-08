"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { apiRequest } from "@/lib/api";
import { Sparkles, Lock, Mail, User as UserIcon, KeyRound, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { t } = useI18n();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  
  const [isInviteValid, setIsInviteValid] = useState<boolean | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const tokenParam = searchParams.get("invite");
    const codeParam = searchParams.get("code");

    if (tokenParam) {
      setInviteToken(tokenParam);
      validateInvite({ token: tokenParam });
    } else if (codeParam) {
      setInviteCode(codeParam);
      validateInvite({ code: codeParam });
    }
  }, [searchParams]);

  const validateInvite = async ({ token, code }: { token?: string; code?: string }) => {
    try {
      let query = "";
      if (token) query = `token=${token}`;
      else if (code) query = `code=${code}`;

      const res = await apiRequest<{ valid: boolean; code?: string }>(`/auth/verify-invite?${query}`);
      if (res.valid) {
        setIsInviteValid(true);
        setInviteFeedback(res.code || "Token verificado");
      }
    } catch (err: any) {
      setIsInviteValid(false);
      setInviteFeedback(err.message || "Invitación no válida");
    }
  };

  const handleManualCodeBlur = () => {
    if (inviteCode.trim() && !inviteToken) {
      validateInvite({ code: inviteCode.trim() });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const payload: Record<string, string> = {
        name,
        email,
        password,
      };

      if (inviteToken) {
        payload.invite_token = inviteToken;
      } else if (inviteCode) {
        payload.invite_code = inviteCode.trim();
      }

      const data = await apiRequest<{ access_token: string; user: any }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      login(data.access_token, data.user);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || t("auth.error_register"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[85vh] px-4 py-8">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 p-8 rounded-2xl shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t("auth.register_title")}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t("auth.register_subtitle")}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t("auth.name")}
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.name_placeholder")}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t("auth.email")}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.email_placeholder")}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t("auth.password")}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password_placeholder")}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              {t("auth.invite_code")}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required={!inviteToken}
                value={inviteToken ? "Verified invite token" : inviteCode}
                disabled={!!inviteToken}
                onChange={(e) => {
                  setInviteCode(e.target.value);
                  setIsInviteValid(null);
                }}
                onBlur={handleManualCodeBlur}
                placeholder={t("auth.invite_code_placeholder")}
                className={`w-full bg-slate-950 border rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
                  isInviteValid === true
                    ? "border-emerald-500 focus:border-emerald-500"
                    : isInviteValid === false
                    ? "border-rose-500 focus:border-rose-500"
                    : "border-slate-800 focus:border-indigo-500"
                }`}
              />
            </div>

            {inviteFeedback && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs">
                {isInviteValid ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">{inviteFeedback}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400">{inviteFeedback}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            ) : (
              <>
                <span>{t("auth.register_button")}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-400">
          {t("auth.have_account")}{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">
            {t("auth.login_here")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
