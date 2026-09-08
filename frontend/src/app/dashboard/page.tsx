"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { 
  apiRequest, 
  Project, 
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
  Send, 
  FolderGit2, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  XCircle, 
  GitPullRequest, 
  Terminal, 
  ExternalLink,
  Info,
  Sparkles,
  AlertCircle,
  Square,
  FileCode2,
  FileText,
  ShieldCheck,
  Plus,
  X,
  KeyRound,
  Coins,
  Database,
  Layers,
  Boxes,
  Cpu,
  History,
  Trash2,
  HelpCircle,
  Check
} from "lucide-react";
import LiveConsoleModal from "@/components/LiveConsoleModal";
import UserPlanModal from "@/components/UserPlanModal";
import WorkflowGuide from "@/components/WorkflowGuide";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const { t } = useI18n();

  const isValidator = user?.role === "admin" || user?.role === "validator" || (user?.validated_repos_count ?? 0) > 0 || Boolean(user?.is_project_validator);
  const [pipelineFilter, setPipelineFilter] = useState<string>("ALL");

  const [targets, setTargets] = useState<RepoTargetOption[]>([]);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string>("");
  const [promptText, setPromptText] = useState("");
  const [myPrompts, setMyPrompts] = useState<PromptTask[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskLogs, setSelectedTaskLogs] = useState<PromptTask | null>(null);
  const [selectedPlanTask, setSelectedPlanTask] = useState<PromptTask | null>(null);
  const [filterPlanOnly, setFilterPlanOnly] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 5-Hour Token Quota and Contexts
  const [quota, setQuota] = useState<UserQuotaStatus | null>(null);
  const [contexts, setContexts] = useState<UserContext[]>([]);
  const [showQuotaLogsModal, setShowQuotaLogsModal] = useState(false);
  const [contextMode, setContextMode] = useState<"none" | "existing">("none");
  const [selectedContextId, setSelectedContextId] = useState<number | null>(null);

  // Temporal Contexts & Live Estimation Breakdown
  const [activeTemporalTasks, setActiveTemporalTasks] = useState<ActiveTemporalTask[]>([]);
  const [selectedTemporalTaskId, setSelectedTemporalTaskId] = useState<number | null>(null);
  const [chainTemporalContext, setChainTemporalContext] = useState<boolean>(false);
  const [liveEstimate, setLiveEstimate] = useState<ContextEstimateResponse | null>(null);

  // Modal for registering as validator for a repo
  const [showValidatorModal, setShowValidatorModal] = useState(false);
  const [valRepoUrl, setValRepoUrl] = useState("");
  const [valGithubToken, setValGithubToken] = useState("");
  const [valBranch, setValBranch] = useState("main");
  const [valRepoName, setValRepoName] = useState("");
  const [valSaving, setValSaving] = useState(false);
  const [valError, setValError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

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
      console.error("Error cargando objetivos de repositorio:", err);
    }
  };

  const loadPrompts = async () => {
    if (!user) return;
    try {
      const prompts = await apiRequest<PromptTask[]>("/prompts/my");
      setMyPrompts(prompts);
    } catch (err: any) {
      console.error("Error cargando prompts:", err);
    }
  };

  const loadQuota = async () => {
    try {
      const data = await getUserQuota();
      setQuota(data);
    } catch (err: any) {
      console.error("Error cargando cuota de tokens:", err);
    }
  };

  const loadContexts = async () => {
    try {
      const data = await getAcceptedUserContexts();
      setContexts(data);
    } catch (err: any) {
      console.error("Error cargando contextos aceptados:", err);
    }
  };

  const loadTemporalTasks = async () => {
    try {
      const data = await getActiveTemporalTasks();
      setActiveTemporalTasks(data);
    } catch (err: any) {
      console.error("Error cargando tareas temporales activas:", err);
    }
  };

  const loadData = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await Promise.all([loadTargets(), loadPrompts(), loadQuota(), loadContexts(), loadTemporalTasks()]);
    } catch (err: any) {
      console.error("Error cargando datos:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
      const interval = setInterval(loadPrompts, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Real-time countdown ticker for quota window reset
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

  // Debounced token estimation calculation with Gemini Context Caching
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
        // keep fallback
      }
    }, 250);

    return () => clearTimeout(handler);
  }, [promptText, contextMode, selectedContextId, chainTemporalContext, selectedTemporalTaskId]);

  function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "Reiniciando...";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  // Token calculations
  const promptChars = promptText.length;
  const promptTokens = liveEstimate ? liveEstimate.prompt_tokens_estimated : (promptChars > 0 ? Math.max(1, Math.ceil(promptChars / 3.8)) : 0);

  const activeContext = contexts.find((c) => c.id === selectedContextId);
  const contextTokens = liveEstimate ? liveEstimate.context_tokens_estimated : (contextMode === "existing" && activeContext ? activeContext.estimated_tokens : 0);
  const temporalTokens = liveEstimate?.temporal_tokens_estimated ?? 0;
  const cachedDiscountTokens = liveEstimate?.cached_tokens_estimated ?? 0;

  const totalEstimatedTokens = liveEstimate ? liveEstimate.total_tokens_estimated : (promptTokens + contextTokens + temporalTokens);
  const willExceedQuota = quota ? (quota.tokens_remaining < totalEstimatedTokens) : false;

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetKey || !promptText.trim()) return;

    const selectedTarget = targets.find((t) => `${t.id}_${t.project_id}` === selectedTargetKey);
    if (!selectedTarget) return;

    if (contextMode === "existing" && !selectedContextId) {
      setMessage({
        type: "error",
        text: "Has seleccionado 'Usar contexto aceptado', pero no has seleccionado ninguno de la lista.",
      });
      return;
    }

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
        text: t("dashboard.prompt_sent_success", { validator: selectedTarget.validator_name }),
      });
      setPromptText("");
      setChainTemporalContext(false);
      setSelectedTemporalTaskId(null);
      await Promise.all([loadPrompts(), loadQuota(), loadContexts(), loadTemporalTasks()]);
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al enviar el prompt.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterValidator = async (e: React.FormEvent) => {
    e.preventDefault();
    setValSaving(true);
    setValError(null);
    try {
      await apiRequest("/repo-validators", {
        method: "POST",
        body: JSON.stringify({
          repo_url: valRepoUrl.trim(),
          github_token: valGithubToken.trim(),
          default_branch: valBranch.trim() || "main",
          name: valRepoName.trim() || undefined
        })
      });
      await refreshUser();
      await loadTargets();
      setShowValidatorModal(false);
      setValRepoUrl("");
      setValGithubToken("");
      setValRepoName("");
      setMessage({
        type: "success",
        text: "¡Te has registrado como validador para el repositorio! Ya puedes validar prompts y planes asignados a dicho repositorio."
      });
    } catch (err: any) {
      setValError(err.message || "Error al registrarse como validador.");
    } finally {
      setValSaving(false);
    }
  };

  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const handleCancelTask = async (taskId: number) => {
    if (!confirm("¿Deseas cancelar y detener esta tarea?")) return;
    setCancellingId(taskId);
    try {
      await apiRequest(`/processes/${taskId}/stop`, { method: "POST" });
      await loadPrompts();
    } catch (err: any) {
      alert(err.message || "Error al cancelar la tarea");
    } finally {
      setCancellingId(null);
    }
  };

  const getPipelineStageBadge = (task: PromptTask) => {
    if (task.status === "PENDING") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Clock className="w-2.5 h-2.5" />
          {t("workflow.badge_stage_prompt", "Paso 1: Prompt")}
        </span>
      );
    }
    if (task.status === "APPROVED" || task.status === "PLAN_PENDING" || task.status === "PLAN_APPROVED" || Boolean(task.plan_content)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
          <FileCode2 className="w-2.5 h-2.5" />
          {t("workflow.badge_stage_plan", "Paso 2: Plan")}
        </span>
      );
    }
    if (task.status === "RUNNING") {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          {t("workflow.badge_stage_running", "Paso 3: Docker")}
        </span>
      );
    }
    if (task.status === "COMPLETED" || Boolean(task.pr_url)) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <GitPullRequest className="w-2.5 h-2.5" />
          {t("workflow.badge_stage_pr", "Paso Final: PR Creado")}
        </span>
      );
    }
    return null;
  };

  const getStatusBadge = (status: PromptTask["status"]) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-3.5 h-3.5" /> En Revisión
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <CheckCircle className="w-3.5 h-3.5" /> Generando Plan...
          </span>
        );
      case "PLAN_PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Clock className="w-3.5 h-3.5" /> Plan en Validación
          </span>
        );
      case "PLAN_APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <CheckCircle className="w-3.5 h-3.5" /> Plan Aprobado
          </span>
        );
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> En Docker...
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <GitPullRequest className="w-3.5 h-3.5" /> PR Creado
          </span>
        );
      case "STOPPED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Square className="w-3.5 h-3.5 fill-current" /> Detenido
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3.5 h-3.5" /> Rechazado
          </span>
        );
      case "FAILED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <AlertCircle className="w-3.5 h-3.5" /> Error Runner
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Sparkles className="w-7 h-7 text-indigo-400" />
            {t("dashboard.title")}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <Link
          href="/pull-requests"
          className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2 transition-all shadow-md shrink-0"
        >
          <GitPullRequest className="w-4 h-4 text-emerald-400" />
          <span>{t("dashboard.view_prs")}</span>
        </Link>
      </div>

      {/* Condensed 5-Hour Token Quota Widget */}
      {quota && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          {/* Left: Token numbers & Status */}
          <div className="flex items-center gap-3 shrink-0">
            <div className={`p-1.5 rounded-lg border shrink-0 ${quota.is_exceeded ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-indigo-500/15 border-indigo-500/30 text-indigo-400"}`}>
              <Coins className="w-4 h-4" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-white">
                {t("dashboard.quota_title", { hours: quota.quota_window_hours })}:
              </span>
              <span className="font-mono font-bold text-white text-sm">
                {quota.tokens_remaining.toLocaleString()}
              </span>
              <span className="text-slate-400 font-mono text-[11px]">
                / {quota.token_quota_limit.toLocaleString()}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  quota.is_exceeded
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                }`}
              >
                {quota.percentage_used}% {t("dashboard.consumed")}
              </span>
            </div>
          </div>

          {/* Center: Inline Progress Bar */}
          <div className="flex-1 max-w-xs mx-0 md:mx-4">
            <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  quota.percentage_used >= 100
                    ? "bg-rose-500"
                    : quota.percentage_used >= 80
                    ? "bg-amber-500"
                    : "bg-gradient-to-r from-indigo-500 to-violet-500"
                }`}
                style={{ width: `${Math.min(100, quota.percentage_used)}%` }}
              />
            </div>
          </div>

          {/* Right: Reset Countdown & History Button */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-300">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("dashboard.reset_in")}</span>
              <span className="font-mono font-semibold text-indigo-300">{formatTimeRemaining(quota.seconds_until_reset)}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowQuotaLogsModal(true)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1.5 transition-all"
              title={t("dashboard.cost_history")}
            >
              <History className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">{t("dashboard.cost_history")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Interactive Workflow Guide Stepper */}
      <WorkflowGuide
        flowType="prompts"
        isValidator={isValidator}
        activeFilterStep={pipelineFilter}
        onFilterStep={(stepKey) => setPipelineFilter(stepKey)}
        counts={{
          pendingPrompts: myPrompts.filter((p) => p.status === "PENDING").length,
          pendingPlans: myPrompts.filter(
            (p) => p.status === "PLAN_PENDING" || p.status === "PLAN_APPROVED" || Boolean(p.plan_content)
          ).length,
          running: myPrompts.filter((p) => p.status === "RUNNING").length,
          completedPRs: myPrompts.filter((p) => p.status === "COMPLETED" || Boolean(p.pr_url)).length,
        }}
      />

      {/* Submission Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <form onSubmit={handleSubmitPrompt} className="space-y-6">
          {message && (
            <div
              className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
                message.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-300"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Target Selector */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {t("dashboard.select_repo_validator")}
              </label>
              <button
                type="button"
                onClick={() => setShowValidatorModal(true)}
                className="self-start sm:self-auto text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("dashboard.become_validator")}</span>
              </button>
            </div>
            {targets.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>{t("dashboard.no_repos_available")}</span>
                <button
                  type="button"
                  onClick={() => setShowValidatorModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shrink-0"
                >
                  {t("dashboard.register_repo")}
                </button>
              </div>
            ) : (
              <div className="relative">
                <FolderGit2 className="w-5 h-5 text-indigo-400 absolute left-3.5 top-3.5 pointer-events-none" />
                <select
                  value={selectedTargetKey}
                  onChange={(e) => setSelectedTargetKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-10 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer font-sans"
                >
                  {targets.map((t) => (
                    <option key={`${t.id}_${t.project_id}`} value={`${t.id}_${t.project_id}`} className="bg-slate-900 text-white">
                      {t.display_label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            )}

            {(() => {
              const currentT = targets.find((t) => `${t.id}_${t.project_id}` === selectedTargetKey);
              if (!currentT) return null;
              return (
                <div className="mt-2 text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-indigo-400 font-mono">{t("dashboard.branch_label")} {currentT.default_branch}</span>
                  <span className="text-amber-400">{t("dashboard.assigned_validator")} {currentT.validator_name}</span>
                  <span className="text-slate-500 font-mono">{currentT.repo_url}</span>
                </div>
              );
            })()}
          </div>

          {/* Context Selector (Only Accepted Contexts) */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-400" />
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  {t("dashboard.dev_context")}
                </label>
              </div>
              <Link
                href="/contexts"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>{t("dashboard.manage_contexts")}</span>
              </Link>
            </div>

            {/* Context Mode Tabs */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setContextMode("none")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  contextMode === "none"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {t("dashboard.no_context")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setContextMode("existing");
                  if (!selectedContextId && contexts.length > 0) {
                    setSelectedContextId(contexts[0].id);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  contextMode === "existing"
                    ? "bg-indigo-600 text-white shadow"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t("dashboard.use_accepted_context", { count: contexts.length })}</span>
              </button>
            </div>

            {/* Mode: Existing Context */}
            {contextMode === "existing" && (
              <div className="space-y-3 pt-2">
                {contexts.length === 0 ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-amber-300">{t("dashboard.no_accepted_contexts")}</p>
                      <p className="text-[11px] text-amber-200/70 mt-0.5">
                        {t("dashboard.no_accepted_contexts_desc")}
                      </p>
                    </div>
                    <Link
                      href="/contexts"
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-semibold whitespace-nowrap transition-colors"
                    >
                      {t("dashboard.go_to_contexts")}
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <select
                      value={selectedContextId || ""}
                      onChange={(e) => setSelectedContextId(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      {contexts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.identifier}) — v{c.version || 1} • ~{c.estimated_tokens} tokens
                        </option>
                      ))}
                    </select>

                    {activeContext && (
                      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">{activeContext.name}</span>
                            <span className="text-[11px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                              {activeContext.identifier}
                            </span>
                            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                              {t("dashboard.accepted_badge", { version: activeContext.version || 1 })}
                            </span>
                            {activeContext.gemini_cache_name ? (
                              <span className="text-[10px] text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">
                                {t("dashboard.cache_active")}
                              </span>
                            ) : null}
                          </div>
                          {activeContext.description && (
                            <p className="text-slate-400 text-[11px]">{activeContext.description}</p>
                          )}
                          <div className="text-[11px] text-slate-500 font-mono">
                            {t("dashboard.size_chars", { chars: activeContext.character_count.toLocaleString(), tokens: activeContext.estimated_tokens.toLocaleString() })}
                          </div>
                        </div>

                        <Link
                          href="/contexts"
                          className="px-2.5 py-1 text-xs rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors whitespace-nowrap"
                        >
                          {t("dashboard.view_iterate")}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 2.1 Contexto Temporal de Tarea Activa (Opcional) */}
            <div className="pt-3 border-t border-slate-800/80">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={chainTemporalContext}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setChainTemporalContext(checked);
                    if (checked && !selectedTemporalTaskId && activeTemporalTasks.length > 0) {
                      setSelectedTemporalTaskId(activeTemporalTasks[0].id);
                    }
                  }}
                  className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-950 w-4 h-4 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("dashboard.chain_temporal_checkbox", { count: activeTemporalTasks.length })}</span>
                </span>
              </label>

              {chainTemporalContext && (
                <div className="mt-2.5 pl-6 space-y-2">
                  {activeTemporalTasks.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {t("dashboard.no_active_temporal")}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <select
                        value={selectedTemporalTaskId || ""}
                        onChange={(e) => setSelectedTemporalTaskId(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                      >
                        {activeTemporalTasks.map((tItem) => (
                          <option key={tItem.id} value={tItem.id}>
                            Tarea #{tItem.id} — {tItem.original_prompt.slice(0, 45)}... ({tItem.status}) • ~{tItem.character_count} car. (~{tItem.tokens_estimated} tokens)
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-amber-300/80 leading-relaxed">
                        {t("dashboard.temporal_helper_tip")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Prompt Textarea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {t("dashboard.instructions_title")}
              </label>
              <span className="text-xs text-slate-400">
                {t("dashboard.multiple_prompts_tip")}
              </span>
            </div>
            <textarea
              required
              rows={5}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={t("dashboard.instructions_placeholder")}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
            />
          </div>

          {/* Condensed Live Token Estimation Strip */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 shrink-0">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider">
                {t("dashboard.cost_breakdown_title")}:
              </span>
            </div>

            {/* Compact Breakdown Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300" title={t("dashboard.prompt_tokens")}>
                Prompt: <strong className="text-white">~{promptTokens}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300" title={t("dashboard.fixed_ctx_tokens")}>
                Fijo: <strong className="text-white">~{contextTokens}</strong>
              </span>
              {temporalTokens > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300" title={t("dashboard.temporal_ctx_tokens")}>
                  Temp: <strong>~{temporalTokens}</strong>
                </span>
              )}
              {cachedDiscountTokens > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-400" title={t("dashboard.cache_discount")}>
                  Caché: <strong>-{cachedDiscountTokens}</strong>
                </span>
              )}
              <span className="text-slate-600 font-sans">→</span>
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 font-bold shadow-sm">
                Total: ~{totalEstimatedTokens} {t("dashboard.tokens_unit")}
              </span>
            </div>

            {willExceedQuota && (
              <div className="w-full mt-1 p-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-300 text-[11px] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span>
                  {t("dashboard.quota_warning", { tokens: (liveEstimate ? liveEstimate.total_tokens_estimated : totalEstimatedTokens).toLocaleString(), remaining: quota?.tokens_remaining.toLocaleString() || 0 })}
                </span>
              </div>
            )}
          </div>

          {/* Action */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || targets.length === 0 || !promptText.trim() || (quota?.is_exceeded ?? false)}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t("common.sending")}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{t("dashboard.send_review")}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              {t("dashboard.history_title")}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("dashboard.history_subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setPipelineFilter("ALL");
                  setFilterPlanOnly(false);
                }}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  pipelineFilter === "ALL" && !filterPlanOnly
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {t("workflow.filter_all", "Todas las etapas")} ({myPrompts.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setPipelineFilter("PENDING");
                  setFilterPlanOnly(false);
                }}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  pipelineFilter === "PENDING"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{t("workflow.filter_pending_prompts", "1. En Revisión de Prompt")} ({myPrompts.filter((p) => p.status === "PENDING").length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPipelineFilter("plan");
                  setFilterPlanOnly(true);
                }}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  pipelineFilter === "plan" || filterPlanOnly
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>{t("workflow.filter_plans", "2. Planes de Trabajo")} ({myPrompts.filter((p) => p.plan_content || p.status === "PLAN_PENDING" || p.status === "PLAN_APPROVED").length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPipelineFilter("running");
                  setFilterPlanOnly(false);
                }}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  pipelineFilter === "running"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t("workflow.filter_running", "3. En Ejecución (Docker)")} ({myPrompts.filter((p) => p.status === "RUNNING").length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPipelineFilter("prs");
                  setFilterPlanOnly(false);
                }}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  pipelineFilter === "prs"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <GitPullRequest className="w-3.5 h-3.5" />
                <span>{t("workflow.filter_completed_prs", "Pull Requests Listos")} ({myPrompts.filter((p) => p.status === "COMPLETED" || Boolean(p.pr_url)).length})</span>
              </button>
            </div>

            <button
              onClick={loadData}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>{t("common.update")}</span>
            </button>
          </div>
        </div>

        {myPrompts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">{t("dashboard.no_prompts")}</p>
            <p className="text-xs text-slate-500 mt-1">{t("dashboard.no_prompts_desc")}</p>
          </div>
        ) : (() => {
          const filteredPrompts = myPrompts.filter((task) => {
            if (pipelineFilter === "PENDING" || pipelineFilter === "validate_prompt") return task.status === "PENDING";
            if (pipelineFilter === "plan" || pipelineFilter === "validate_plan") {
              return (
                task.status === "PLAN_PENDING" ||
                task.status === "PLAN_APPROVED" ||
                task.status === "APPROVED" ||
                Boolean(task.plan_content)
              );
            }
            if (pipelineFilter === "running") return task.status === "RUNNING";
            if (pipelineFilter === "prs") return task.status === "COMPLETED" || Boolean(task.pr_url);
            if (filterPlanOnly) {
              return task.plan_content || task.status === "PLAN_PENDING" || task.status === "PLAN_APPROVED";
            }
            return true;
          });

          if (filteredPrompts.length === 0) {
            return (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <FileCode2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No hay tareas en esta etapa del flujo.</p>
                <p className="text-xs text-slate-500 mt-1">Selecciona &quot;Todas las etapas&quot; para ver la totalidad de tus prompts.</p>
              </div>
            );
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">ID</th>
                    <th className="py-3 px-4">{t("common.project")}</th>
                    <th className="py-3 px-4">Prompt</th>
                    <th className="py-3 px-4">{t("common.status")}</th>
                    <th className="py-3 px-4">PR</th>
                    <th className="py-3 px-4 text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredPrompts.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      #{task.id}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-200">
                      {task.project_name || `Proyecto #${task.project_id}`}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <p className="line-clamp-2 text-xs text-slate-300 font-mono">
                        {task.edited_prompt ? task.edited_prompt : task.original_prompt}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {task.edited_prompt && (
                          <span className="text-[10px] text-indigo-400">
                            {t("dashboard.adjusted_by_validator")}
                          </span>
                        )}
                        {task.context_name && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20" title={`Contexto personal: ${task.context_name}`}>
                            <Database className="w-2.5 h-2.5 text-purple-400" />
                            {task.context_name}
                          </span>
                        )}
                        {task.temporal_context_status && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              task.temporal_context_status === "ACTIVE"
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : task.temporal_context_status === "MERGED"
                                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                            title={`Contexto Temporal: ${task.temporal_context_status}`}
                          >
                            <Clock className="w-2.5 h-2.5" />
                            {task.temporal_context_status === "ACTIVE"
                              ? t("dashboard.temporal_active")
                              : task.temporal_context_status === "MERGED"
                              ? t("dashboard.temporal_merged")
                              : t("dashboard.temporal_discarded")}
                          </span>
                        )}
                        {task.tokens_used ? (
                          <span 
                            className="inline-flex items-center gap-1 text-[10px] font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20" 
                            title={`Tokens: ${task.tokens_used.toLocaleString()} (Fijo: ${task.tokens_fixed_context || 0}, Temporal: ${task.tokens_temporal_context || 0})`}
                          >
                            <Coins className="w-2.5 h-2.5 text-indigo-400" />
                            {task.tokens_used.toLocaleString()} tokens
                            {task.tokens_temporal_context ? (
                              <span className="text-[9px] text-amber-300 ml-0.5 font-bold">
                                (+{task.tokens_temporal_context} temp)
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getPipelineStageBadge(task)}
                          {getStatusBadge(task.status)}
                        </div>
                        {task.plan_content && (
                          <button
                            onClick={() => setSelectedPlanTask(task)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40 text-xs font-semibold shadow-sm transition-all mt-0.5"
                          >
                            <FileCode2 className="w-3.5 h-3.5 text-purple-300" />
                            <span>{t("dashboard.view_plan")}</span>
                          </button>
                        )}
                        {task.rejection_reason && (
                          <p className="text-[11px] text-rose-400 mt-0.5 max-w-xs line-clamp-2">
                            {t("dashboard.rejection_reason_label")} {task.rejection_reason}
                          </p>
                        )}
                        {task.status === "FAILED" && (
                          <div className="mt-1 p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-md text-[11px] text-rose-300 font-mono">
                            <strong className="text-rose-400 block font-sans text-[10px] uppercase">{t("dashboard.error_cause_label")}</strong>
                            <span className="line-clamp-2">{task.error_message || "Error en el contenedor del runner"}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {task.pr_url ? (
                        <a
                          href={task.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 font-medium underline underline-offset-4"
                        >
                          <GitPullRequest className="w-3.5 h-3.5" />
                          <span>PR #{task.pr_number || "Ver"}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(task.status === "RUNNING" || task.status === "APPROVED" || task.status === "PENDING") && (
                          <button
                            onClick={() => handleCancelTask(task.id)}
                            disabled={cancellingId === task.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                            title={t("dashboard.cancel_prompt")}
                          >
                            <Square className={`w-3 h-3 fill-current ${cancellingId === task.id ? "animate-pulse" : ""}`} />
                            <span>{cancellingId === task.id ? t("dashboard.cancelling") : t("dashboard.cancel_prompt")}</span>
                          </button>
                        )}

                        {/* Plan View Button */}
                        {task.plan_content && (
                          <button
                            onClick={() => setSelectedPlanTask(task)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold shadow-sm transition-all"
                            title={t("dashboard.view_plan")}
                          >
                            <FileCode2 className="w-3.5 h-3.5 text-purple-400" />
                            <span>Plan</span>
                          </button>
                        )}

                        {/* Console button ONLY visible for Admin */}
                        {user?.role === "admin" && (
                          <>
                            {task.status === "RUNNING" ? (
                              <button
                                onClick={() => setSelectedTaskLogs(task)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold shadow-sm transition-all"
                              >
                                <Terminal className="w-3.5 h-3.5 animate-pulse" />
                                <span>{t("dashboard.live_console")}</span>
                              </button>
                            ) : (task.execution_logs || task.status === "FAILED" || task.status === "STOPPED" || task.status === "COMPLETED") ? (
                              <button
                                onClick={() => setSelectedTaskLogs(task)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                              >
                                <Terminal className="w-3.5 h-3.5" />
                                <span>{t("dashboard.console")}</span>
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        })()}
      </div>

      {/* User Plan Modal */}
      {selectedPlanTask && (
        <UserPlanModal
          task={selectedPlanTask}
          onClose={() => setSelectedPlanTask(null)}
        />
      )}

      {/* Live Console Modal (Only for Admin) */}
      {selectedTaskLogs && user?.role === "admin" && (
        <LiveConsoleModal
          task={selectedTaskLogs}
          onClose={() => setSelectedTaskLogs(null)}
        />
      )}

      {/* Modal: Register as repo validator */}
      {showValidatorModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
                <span>Alta como Validador de Repositorio GitHub</span>
              </div>
              <button
                onClick={() => setShowValidatorModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {valError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{valError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterValidator} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                  URL del Repositorio GitHub *
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://github.com/mi-usuario/mi-repositorio"
                  value={valRepoUrl}
                  onChange={(e) => setValRepoUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Cualquier usuario podrá elegir este repositorio y asignarte a ti la validación de sus prompts.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                  Token de GitHub (Personal Access Token) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={valGithubToken}
                  onChange={(e) => setValGithubToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Se requiere permiso de escritura en el repositorio (contents y pull-requests) para crear ramas y abrir PRs cuando apruebes el plan.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                    Rama Base (Default)
                  </label>
                  <input
                    type="text"
                    value={valBranch}
                    onChange={(e) => setValBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                    Nombre Descriptivo
                  </label>
                  <input
                    type="text"
                    value={valRepoName}
                    onChange={(e) => setValRepoName(e.target.value)}
                    placeholder="Opcional (ej. Mi Portal Web)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowValidatorModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={valSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {valSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Confirmar Alta como Validador</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Quota Logs History */}
      {showQuotaLogsModal && quota && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Coins className="w-5 h-5 text-indigo-400" />
                <span>Historial de Costos de Tokens (Últimas Peticiones)</span>
              </div>
              <button
                onClick={() => setShowQuotaLogsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <span>Consumido en ventana actual ({quota.quota_window_hours}h): </span>
                <strong className="text-white font-mono">{quota.tokens_used_in_window.toLocaleString()}</strong> / {quota.token_quota_limit.toLocaleString()} tokens
              </div>
              <div>
                <span>Próximo reinicio: </span>
                <strong className="text-indigo-400 font-mono">{formatTimeRemaining(quota.seconds_until_reset)}</strong>
              </div>
            </div>

            {quota.recent_logs.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs">
                No hay peticiones registradas en esta ventana de cuota todavía.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Tarea</th>
                      <th className="py-2.5 px-3">Tokens Prompt</th>
                      <th className="py-2.5 px-3">Tokens Resp.</th>
                      <th className="py-2.5 px-3">Caché</th>
                      <th className="py-2.5 px-3 font-bold text-white">Total</th>
                      <th className="py-2.5 px-3 text-right">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {quota.recent_logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2 px-3 text-indigo-400">
                          {log.task_id ? `#${log.task_id}` : "Directa"}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {log.tokens_prompt.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-300">
                          {log.tokens_completion.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-emerald-400">
                          {log.tokens_cached > 0 ? log.tokens_cached.toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-3 font-bold text-white">
                          {log.tokens_total.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-slate-500 text-right text-[11px] font-sans">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowQuotaLogsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
