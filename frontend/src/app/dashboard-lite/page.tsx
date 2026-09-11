"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import {
  apiRequest,
  PromptTask,
  RepoTargetOption,
  UserQuotaStatus,
  UserContext,
  getUserQuota,
  getAcceptedUserContexts,
  ActiveTemporalTask,
  getActiveTemporalTasks,
  estimateContextTokens,
  ContextEstimateResponse
} from "@/lib/api";
import {
  GitBranch,
  Pencil,
  Layers,
  Send,
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Boxes,
  Sparkles,
  Coins,
  FileCode2,
  GitPullRequest,
  Slash,
  XCircle,
  CheckCircle
} from "lucide-react";
import UserPlanModal from "@/components/UserPlanModal";

type StepNumber = 1 | 2 | 3 | 4 | 5;

interface StepDef {
  step: StepNumber;
  titleKey: string;
  icon: typeof GitBranch;
}

const STEPS: StepDef[] = [
  { step: 1, titleKey: "dashboardLite.step_repo", icon: GitBranch },
  { step: 2, titleKey: "dashboardLite.step_prompt", icon: Pencil },
  { step: 3, titleKey: "dashboardLite.step_context", icon: Layers },
  { step: 4, titleKey: "dashboardLite.step_review", icon: Send },
  { step: 5, titleKey: "dashboardLite.step_tracking", icon: Activity },
];

export default function DashboardLitePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();

  // Current step state (1 to 5)
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);

  // Data states
  const [targets, setTargets] = useState<RepoTargetOption[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [promptText, setPromptText] = useState("");
  const [myPrompts, setMyPrompts] = useState<PromptTask[]>([]);
  const [quota, setQuota] = useState<UserQuotaStatus | null>(null);
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [activeTemporalTasks, setActiveTemporalTasks] = useState<ActiveTemporalTask[]>([]);

  // Context selection states
  const [contextMode, setContextMode] = useState<"none" | "existing">("none");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);
  const [chainTemporalContext, setChainTemporalContext] = useState<boolean>(false);
  const [selectedTemporalTaskId, setSelectedTemporalTaskId] = useState<number | null>(null);

  // Live estimate
  const [liveEstimate, setLiveEstimate] = useState<ContextEstimateResponse | null>(null);

  // UI action states
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedPlanTask, setSelectedPlanTask] = useState<PromptTask | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Auth protection
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load initial data
  const loadTargets = async () => {
    try {
      const data = await apiRequest<RepoTargetOption[]>("/repo-validators/targets");
      setTargets(data);
      setSelectedTargetKey((prev) => {
        if (prev && data.some((t) => `${t.id}_${t.project_id}` === prev)) {
          return prev;
        }
        return data.length > 0 ? `${data[0].id}_${data[0].project_id}` : "";
      });
    } catch (err: any) {
      console.error("Error loading targets:", err);
    }
  };

  const loadPrompts = async () => {
    if (!user) return;
    try {
      const data = await apiRequest<PromptTask[]>("/prompts/my");
      setMyPrompts(data);
    } catch (err: any) {
      console.error("Error loading prompts:", err);
    }
  };

  const loadQuota = async () => {
    try {
      const data = await getUserQuota();
      setQuota(data);
    } catch (err: any) {
      console.error("Error loading quota:", err);
    }
  };

  const loadContexts = async () => {
    try {
      const data = await getAcceptedUserContexts();
      setContexts(data);
    } catch (err: any) {
      console.error("Error loading contexts:", err);
    }
  };

  const loadTemporalTasks = async () => {
    try {
      const data = await getActiveTemporalTasks();
      setActiveTemporalTasks(data);
    } catch (err: any) {
      console.error("Error loading temporal tasks:", err);
    }
  };

  const loadAll = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await Promise.all([loadTargets(), loadPrompts(), loadQuota(), loadContexts(), loadTemporalTasks()]);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAll();
      const interval = setInterval(loadPrompts, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Quota countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setQuota((prev) => {
        if (!prev) return prev;
        if (prev.seconds_until_reset <= 1) {
          loadQuota();
          return { ...prev, seconds_until_reset: 0 };
        }
        return { ...prev, seconds_until_reset: prev.seconds_until_reset - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Debounced token estimation
  useEffect(() => {
    const handler = setTimeout(async () => {
      if (!promptText.trim() && contextMode === "none" && (!chainTemporalContext || !selectedTemporalTaskId)) {
        setLiveEstimate(null);
        return;
      }
      try {
        const res = await estimateContextTokens({
          prompt: promptText,
          context_id: contextMode === "existing" ? selectedContextId : null,
          temporal_task_id: chainTemporalContext ? selectedTemporalTaskId : null,
        });
        setLiveEstimate(res);
      } catch {
        // Fallback
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [promptText, contextMode, selectedContextId, chainTemporalContext, selectedTemporalTaskId]);

  // Calculations
  const selectedTarget = targets.find((t) => `${t.id}_${t.project_id}` === selectedTargetKey);
  const promptChars = promptText.length;
  const promptTokens = liveEstimate
    ? liveEstimate.prompt_tokens_estimated
    : promptChars > 0
    ? Math.max(1, Math.ceil(promptChars / 3.8))
    : 0;

  const activeContext = contexts.find((c) => c.id === selectedContextId);
  const contextTokens = liveEstimate
    ? liveEstimate.context_tokens_estimated
    : contextMode === "existing" && activeContext
    ? activeContext.estimated_tokens
    : 0;
  const temporalTokens = liveEstimate?.temporal_tokens_estimated ?? 0;
  const cachedDiscountTokens = liveEstimate?.cached_tokens_estimated ?? 0;
  const totalEstimatedTokens = liveEstimate
    ? liveEstimate.total_tokens_estimated
    : promptTokens + contextTokens + temporalTokens;

  const willExceedQuota = quota ? quota.tokens_remaining < totalEstimatedTokens : false;

  function formatCountdown(seconds: number): string {
    if (seconds <= 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // Handle prompt submit
  const handleSubmit = async () => {
    if (!selectedTarget || !promptText.trim() || submitting) return;

    setSubmitting(true);
    setMessage(null);

    const bodyPayload: any = {
      repo_validator_id: selectedTarget.id > 0 ? selectedTarget.id : undefined,
      project_id: selectedTarget.project_id,
      prompt: promptText.trim(),
    };

    if (contextMode === "existing" && selectedContextId) {
      bodyPayload.context_id = selectedContextId;
    }

    if (chainTemporalContext && selectedTemporalTaskId) {
      bodyPayload.temporal_task_id = selectedTemporalTaskId;
    }

    try {
      await apiRequest<PromptTask>("/prompts", {
        method: "POST",
        body: JSON.stringify(bodyPayload),
      });

      setMessage({
        type: "success",
        text: t("dashboardLite.success_sent"),
      });

      // Clear prompt and move to tracking step
      setPromptText("");
      setChainTemporalContext(false);
      setSelectedTemporalTaskId(null);
      setCurrentStep(5);

      await Promise.all([loadPrompts(), loadQuota(), loadContexts()]);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al enviar el prompt.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel task
  const handleCancelTask = async (taskId: number) => {
    if (!confirm("¿Deseas cancelar esta tarea?")) return;
    setCancellingId(taskId);
    try {
      await apiRequest(`/processes/${taskId}/stop`, { method: "POST" });
      await loadPrompts();
    } catch (err: any) {
      alert(err.message || "Error al cancelar");
    } finally {
      setCancellingId(null);
    }
  };

  // Reset to create new prompt
  const handleStartNewPrompt = () => {
    setPromptText("");
    setContextMode("none");
    setSelectedContextId(null);
    setChainTemporalContext(false);
    setSelectedTemporalTaskId(null);
    setMessage(null);
    setCurrentStep(1);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3 animate-pulse" />
            {t("dashboardLite.pending")}
          </span>
        );
      case "APPROVED":
      case "PLAN_PENDING":
      case "PLAN_APPROVED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <FileCode2 className="w-3 h-3" />
            {t("dashboardLite.plan_ready")}
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <RefreshCw className="w-3 h-3 animate-spin" />
            {t("dashboardLite.running")}
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <GitPullRequest className="w-3 h-3" />
            {t("dashboardLite.completed")}
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            {t("dashboardLite.rejected")}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)] justify-between space-y-4">
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER: Stepper & Navigation
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          {/* Brand/Mode Title */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                {t("dashboardLite.page_title")}
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Lite
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t(STEPS[currentStep - 1].titleKey)}
              </p>
            </div>
          </div>

          {/* Stepper Nodes */}
          <div className="flex items-center gap-1 sm:gap-3">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              const isActive = currentStep === s.step;
              const isPast = currentStep > s.step;
              return (
                <div key={s.step} className="flex items-center">
                  <button
                    onClick={() => setCurrentStep(s.step)}
                    title={t(s.titleKey)}
                    className={`relative flex items-center justify-center rounded-full transition-all duration-200 ${
                      isActive
                        ? "w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white ring-4 ring-indigo-500/30 scale-105 shadow-md shadow-indigo-600/30 font-bold text-xs sm:text-sm"
                        : isPast
                        ? "w-8 h-8 sm:w-9 sm:h-9 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 text-xs"
                        : "w-8 h-8 sm:w-9 sm:h-9 bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-600 text-xs"
                    }`}
                  >
                    {isPast ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </button>

                  {idx < STEPS.length - 1 && (
                    <div
                      className={`h-0.5 w-3 sm:w-6 transition-colors ${
                        currentStep > s.step ? "bg-emerald-500/40" : "bg-slate-800"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Actions: Refresh & Full Dashboard Link */}
          <div className="flex items-center gap-2">
            <button
              onClick={loadAll}
              disabled={refreshing}
              title={t("common.refresh")}
              aria-label={t("common.refresh")}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            <Link
              href="/dashboard"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2.5 py-1.5 rounded-xl hover:bg-indigo-500/10 transition-colors hidden sm:inline-flex items-center gap-1 border border-indigo-500/20"
            >
              {t("dashboardLite.full_view")}
            </Link>
          </div>
        </div>
      </div>

      {/* Message alert banner */}
      {message && (
        <div
          className={`p-3 rounded-xl flex items-center justify-between text-xs transition-all ${
            message.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : "bg-rose-500/10 text-rose-300 border border-rose-500/20"
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === "success" ? (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-slate-400 hover:text-white text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. CENTRAL CONTAINER: Active Screen
      ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-md flex flex-col justify-between">
        {/* PANTALLA 1: SELECCIONAR REPOSITORIO */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">
                  {t("dashboardLite.select_repo")}
                </h2>
                <p className="text-xs text-slate-400">
                  {targets.length} {targets.length === 1 ? "repositorio disponible" : "repositorios disponibles"}
                </p>
              </div>
            </div>

            {targets.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>{t("dashboard.no_repos_available")}</p>
                <Link
                  href="/dashboard"
                  className="mt-3 inline-block text-xs text-indigo-400 hover:underline"
                >
                  {t("dashboardLite.full_view")}
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {targets.map((target) => {
                  const key = `${target.id}_${target.project_id}`;
                  const isSelected = selectedTargetKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedTargetKey(key)}
                      className={`p-4 rounded-xl text-left transition-all border ${
                        isSelected
                          ? "bg-indigo-600/15 border-indigo-500 ring-2 ring-indigo-500/30 shadow-lg shadow-indigo-600/10"
                          : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-white truncate">
                          {target.repo_name}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {target.default_branch}
                        </span>
                        <span className="truncate">
                          👤 {target.validator_name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setCurrentStep(2)}
                disabled={!selectedTargetKey}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg shadow-indigo-600/20"
              >
                {t("dashboardLite.next")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PANTALLA 2: ESCRIBIR PROMPT */}
        {currentStep === 2 && (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {t("dashboardLite.write_prompt")}
                    </h2>
                    {selectedTarget && (
                      <p className="text-xs text-slate-400">
                        {selectedTarget.repo_name} ({selectedTarget.default_branch})
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs text-slate-500 font-mono">
                  {promptChars} {t("dashboardLite.chars")}
                </span>
              </div>

              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                rows={9}
                placeholder={t("dashboard.instructions_placeholder")}
                className="w-full p-4 rounded-xl font-mono text-sm leading-relaxed bg-slate-950/80 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all"
              />
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800/80">
              <button
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t("dashboardLite.back")}
              </button>

              <button
                onClick={() => setCurrentStep(3)}
                disabled={!promptText.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg shadow-indigo-600/20"
              >
                {t("dashboardLite.next")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PANTALLA 3: CONTEXTO (OPCIONAL) */}
        {currentStep === 3 && (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {t("dashboardLite.step_context")}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {t("dashboardLite.optional_step")}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                  {contextMode === "none" ? t("dashboardLite.no_context") : "Contexto activo"}
                </span>
              </div>

              {/* Mode toggle */}
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => {
                    setContextMode("none");
                    setSelectedContextId(null);
                  }}
                  className={`p-3 rounded-xl text-xs font-semibold text-center border transition-all flex items-center justify-center gap-2 ${
                    contextMode === "none"
                      ? "bg-indigo-600/15 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <Slash className="w-3.5 h-3.5" />
                  {t("dashboardLite.no_context")}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setContextMode("existing");
                    if (contexts.length > 0 && !selectedContextId) {
                      setSelectedContextId(contexts[0].id);
                    }
                  }}
                  className={`p-3 rounded-xl text-xs font-semibold text-center border transition-all flex items-center justify-center gap-2 ${
                    contextMode === "existing"
                      ? "bg-indigo-600/15 border-indigo-500 text-indigo-300 ring-1 ring-indigo-500/30"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  <Boxes className="w-3.5 h-3.5" />
                  {t("dashboardLite.add_context")} ({contexts.length})
                </button>
              </div>

              {/* Context selection chips */}
              {contextMode === "existing" && (
                <div className="space-y-3 pt-2">
                  {contexts.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      {t("dashboardLite.no_contexts_available")}
                      <Link
                        href="/contexts"
                        className="block mt-2 text-indigo-400 hover:underline"
                      >
                        {t("dashboard.go_to_contexts")}
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {contexts.map((ctx) => {
                        const isSelected = selectedContextId === ctx.id;
                        return (
                          <button
                            key={ctx.id}
                            type="button"
                            onClick={() => setSelectedContextId(ctx.id)}
                            className={`p-3 rounded-xl text-left transition-all border ${
                              isSelected
                                ? "bg-indigo-600/15 border-indigo-500 ring-2 ring-indigo-500/30"
                                : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-xs text-white truncate">
                                {ctx.name}
                              </span>
                              <span className="text-[10px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-500/10">
                                v{ctx.version}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                              <span>@{ctx.identifier}</span>
                              <span>•</span>
                              <span>~{ctx.estimated_tokens} tokens</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Temporal chaining toggle */}
                  {activeTemporalTasks.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="chain_temp_lite"
                        checked={chainTemporalContext}
                        onChange={(e) => setChainTemporalContext(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="chain_temp_lite" className="text-xs text-slate-300">
                        {t("dashboardLite.chain_temporal")} ({activeTemporalTasks.length})
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800/80">
              <button
                onClick={() => setCurrentStep(2)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t("dashboardLite.back")}
              </button>

              <button
                onClick={() => setCurrentStep(4)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-600/20"
              >
                {contextMode === "none" ? t("dashboardLite.skip") : t("dashboardLite.next")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* PANTALLA 4: REVISAR Y ENVIAR */}
        {currentStep === 4 && (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {t("dashboardLite.review_summary")}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Confirma tu solicitud antes del envío
                  </p>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="space-y-3">
                {/* Repo Card */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <GitBranch className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {selectedTarget?.repo_name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {t("dashboardLite.branch")}: {selectedTarget?.default_branch} • {t("dashboardLite.validator")}: {selectedTarget?.validator_name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Cambiar
                  </button>
                </div>

                {/* Prompt Preview Card */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <Pencil className="w-3 h-3 text-indigo-400" />
                      {t("dashboardLite.step_prompt")}
                    </span>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="text-[11px] text-indigo-400 hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                  <p className="text-xs font-mono text-slate-300 line-clamp-3 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60">
                    {promptText}
                  </p>
                </div>

                {/* Context Card */}
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {contextMode === "existing" && activeContext
                          ? `${activeContext.name} (v${activeContext.version})`
                          : t("dashboardLite.no_context")}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {contextMode === "existing"
                          ? `~${contextTokens} tokens`
                          : "Sin directivas adicionales"}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Cambiar
                  </button>
                </div>

                {/* Cost Estimate Breakdown */}
                <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      {t("dashboardLite.cost_estimate")}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      ~{totalEstimatedTokens} tokens
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                    <span>Prompt: ~{promptTokens}</span>
                    {contextTokens > 0 && <span>• Ctx: ~{contextTokens}</span>}
                    {temporalTokens > 0 && <span>• Temp: ~{temporalTokens}</span>}
                    {cachedDiscountTokens > 0 && (
                      <span className="text-emerald-400">• Caché: -{cachedDiscountTokens}</span>
                    )}
                  </div>

                  {willExceedQuota && (
                    <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{t("dashboard.quota_warning", { tokens: totalEstimatedTokens, remaining: quota?.tokens_remaining ?? 0 })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between border-t border-slate-800/80">
              <button
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t("dashboardLite.back")}
              </button>

              <button
                onClick={handleSubmit}
                disabled={submitting || willExceedQuota || !promptText.trim()}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:pointer-events-none transition-all shadow-xl shadow-indigo-600/30"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t("common.sending")}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t("dashboardLite.submit")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* PANTALLA 5: SEGUIMIENTO */}
        {currentStep === 5 && (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {t("dashboardLite.step_tracking")}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {myPrompts.length} {myPrompts.length === 1 ? "solicitud enviada" : "solicitudes enviadas"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleStartNewPrompt}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t("dashboardLite.new_prompt")}
                </button>
              </div>

              {/* Prompts list */}
              {myPrompts.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>{t("dashboard.no_prompts")}</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {myPrompts.slice(0, 10).map((prompt) => {
                    const hasPlan = Boolean(prompt.plan_content);
                    const hasPr = Boolean(prompt.pr_url);
                    const isPending = prompt.status === "PENDING";
                    const isRunning = prompt.status === "RUNNING";

                    return (
                      <div
                        key={prompt.id}
                        className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-white">
                              #{prompt.id}
                            </span>
                            {getStatusBadge(prompt.status)}
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(prompt.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 truncate font-mono">
                            {prompt.original_prompt}
                          </p>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                          {hasPlan && (
                            <button
                              onClick={() => setSelectedPlanTask(prompt)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 transition-colors flex items-center gap-1"
                            >
                              <FileCode2 className="w-3 h-3" />
                              {t("dashboardLite.view_plan")}
                            </button>
                          )}

                          {hasPr && (
                            <a
                              href={prompt.pr_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors flex items-center gap-1"
                            >
                              <GitPullRequest className="w-3 h-3" />
                              {t("dashboardLite.view_pr")}
                            </a>
                          )}

                          {(isPending || isRunning) && (
                            <button
                              onClick={() => handleCancelTask(prompt.id)}
                              disabled={cancellingId === prompt.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-colors"
                            >
                              {cancellingId === prompt.id
                                ? t("dashboard.cancelling")
                                : t("dashboardLite.cancel_prompt")}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-slate-800/80">
              <button
                onClick={() => setCurrentStep(1)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver a la selección de repositorio
              </button>

              <button
                onClick={handleStartNewPrompt}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" />
                {t("dashboardLite.new_prompt")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. FOOTER: Cost & Spending Summary
      ───────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Quota Bar */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
              <Coins className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  {quota ? `${quota.tokens_remaining.toLocaleString()} ${t("dashboardLite.tokens_remaining")}` : "Cargando cuota..."}
                </span>
                {quota && (
                  <span className="text-[11px] text-slate-400 font-mono">
                    {quota.percentage_used}% • ⏱ {formatCountdown(quota.seconds_until_reset)}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    (quota?.percentage_used ?? 0) >= 90
                      ? "bg-rose-500"
                      : (quota?.percentage_used ?? 0) >= 70
                      ? "bg-amber-500"
                      : "bg-gradient-to-r from-indigo-500 to-violet-500"
                  }`}
                  style={{ width: `${Math.min(100, quota?.percentage_used ?? 0)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Current Request Cost Badge */}
          <div className="flex items-center gap-2 shrink-0 sm:pl-4 sm:border-l sm:border-slate-800">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-slate-300">
              {t("dashboardLite.cost_estimate")}:
            </span>
            <span className="text-xs font-mono font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
              ~{totalEstimatedTokens} tokens
            </span>
          </div>
        </div>
      </div>

      {/* Technical Plan Modal */}
      <UserPlanModal
        task={selectedPlanTask}
        onClose={() => setSelectedPlanTask(null)}
      />
    </div>
  );
}
