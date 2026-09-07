"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, Project, PromptTask, RepoTargetOption } from "@/lib/api";
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
  KeyRound
} from "lucide-react";
import LiveConsoleModal from "@/components/LiveConsoleModal";
import UserPlanModal from "@/components/UserPlanModal";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();

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

  const loadData = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      await Promise.all([loadTargets(), loadPrompts()]);
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

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetKey || !promptText.trim()) return;

    const selectedTarget = targets.find((t) => `${t.id}_${t.project_id}` === selectedTargetKey);
    if (!selectedTarget) return;

    setSubmitting(true);
    setMessage(null);

    try {
      await apiRequest<PromptTask>("/prompts", {
        method: "POST",
        body: JSON.stringify({
          repo_validator_id: selectedTarget.id > 0 ? selectedTarget.id : undefined,
          project_id: selectedTarget.project_id,
          prompt: promptText.trim(),
        }),
      });

      setMessage({
        type: "success",
        text: `¡Prompt enviado con éxito! Asignado al validador ${selectedTarget.validator_name} para su revisión.`,
      });
      setPromptText("");
      await loadPrompts();
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
            Workspace de Prompts
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Escribe tus instrucciones de modificación sobre el proyecto seleccionado. Los cambios serán revisados por los validadores y ejecutados en un contenedor aislado de Docker para abrir un Pull Request en GitHub.
          </p>
        </div>

        <Link
          href="/pull-requests"
          className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300 text-xs font-semibold flex items-center gap-2 transition-all shadow-md shrink-0"
        >
          <GitPullRequest className="w-4 h-4 text-emerald-400" />
          <span>Ver Mis Pull Requests</span>
        </Link>
      </div>

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
                1. Selecciona el Repositorio Objetivo y su Validador
              </label>
              <button
                type="button"
                onClick={() => setShowValidatorModal(true)}
                className="self-start sm:self-auto text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 font-medium transition-colors bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/20"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>+ Darme de alta como Validador de un Repositorio</span>
              </button>
            </div>
            {targets.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span>No hay repositorios con validador disponibles. Puedes darte de alta como validador de tu propio repositorio de GitHub.</span>
                <button
                  type="button"
                  onClick={() => setShowValidatorModal(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shrink-0"
                >
                  Registrar mi Repositorio
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
                  <span className="text-indigo-400 font-mono">Rama: {currentT.default_branch}</span>
                  <span className="text-amber-400">Validador asignado: {currentT.validator_name}</span>
                  <span className="text-slate-500 font-mono">{currentT.repo_url}</span>
                </div>
              );
            })()}
          </div>

          {/* Prompt Textarea */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                2. Instrucciones para la IA (Prompt de Modificación)
              </label>
              <span className="text-xs text-slate-400">
                Puedes enviar múltiples prompts secuenciales
              </span>
            </div>
            <textarea
              required
              rows={5}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Ejemplo: Añade una nueva sección de preguntas frecuentes (FAQ) en la página principal con 4 preguntas expandibles tipo acordeón. Utiliza Tailwind CSS y animación suave."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
            />
          </div>

          {/* Action */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || targets.length === 0 || !promptText.trim()}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar a Revisión</span>
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
              Historial de mis Prompts
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Estado en tiempo real de las solicitudes enviadas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFilterPlanOnly(false)}
                className={`px-3 py-1 rounded-lg font-medium transition-all ${
                  !filterPlanOnly ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Todos ({myPrompts.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterPlanOnly(true)}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  filterPlanOnly ? "bg-purple-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Con Plan ({myPrompts.filter(t => t.plan_content || t.status === "PLAN_PENDING" || t.status === "PLAN_APPROVED").length})</span>
              </button>
            </div>

            <button
              onClick={loadData}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {myPrompts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">Aún no has enviado ningún prompt.</p>
            <p className="text-xs text-slate-500 mt-1">Escribe tu primera solicitud en el formulario de arriba.</p>
          </div>
        ) : filterPlanOnly && myPrompts.filter(t => t.plan_content || t.status === "PLAN_PENDING" || t.status === "PLAN_APPROVED").length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <FileCode2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">Aún no tienes ningún prompt con plan técnico generado.</p>
            <p className="text-xs text-slate-500 mt-1">Cuando los validadores aprueben tus prompts, Gemini formulará el plan técnico y aparecerá aquí.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Proyecto</th>
                  <th className="py-3 px-4">Prompt</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Resultado / PR</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {myPrompts
                  .filter((t) => !filterPlanOnly || (t.plan_content || t.status === "PLAN_PENDING" || t.status === "PLAN_APPROVED"))
                  .map((task) => (
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
                      {task.edited_prompt && (
                        <span className="text-[10px] text-indigo-400 block mt-0.5">
                          (Ajustado por validador)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(task.status)}
                      {task.plan_content && (
                        <div className="mt-1">
                          <button
                            onClick={() => setSelectedPlanTask(task)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-semibold transition-all"
                          >
                            <FileCode2 className="w-3 h-3 text-purple-400" />
                            <span>Ver Plan Técnico</span>
                          </button>
                        </div>
                      )}
                      {task.rejection_reason && (
                        <p className="text-[11px] text-rose-400 mt-1 max-w-xs line-clamp-2">
                          Motivo: {task.rejection_reason}
                        </p>
                      )}
                      {task.status === "FAILED" && (
                        <div className="mt-1 p-1.5 bg-rose-500/10 border border-rose-500/20 rounded-md text-[11px] text-rose-300 font-mono">
                          <strong className="text-rose-400 block font-sans text-[10px] uppercase">Causa del error:</strong>
                          <span className="line-clamp-2">{task.error_message || "Error en el contenedor del runner"}</span>
                        </div>
                      )}
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
                            title="Cancelar / Detener proceso"
                          >
                            <Square className={`w-3 h-3 fill-current ${cancellingId === task.id ? "animate-pulse" : ""}`} />
                            <span>{cancellingId === task.id ? "Cancelando..." : "Cancelar"}</span>
                          </button>
                        )}

                        {/* Plan View Button */}
                        {task.plan_content && (
                          <button
                            onClick={() => setSelectedPlanTask(task)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold shadow-sm transition-all"
                            title="Ver Plan Técnico de Implementación"
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
                                <span>Consola en Vivo</span>
                              </button>
                            ) : (task.execution_logs || task.status === "FAILED" || task.status === "STOPPED" || task.status === "COMPLETED") ? (
                              <button
                                onClick={() => setSelectedTaskLogs(task)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition-colors"
                              >
                                <Terminal className="w-3.5 h-3.5" />
                                <span>Consola</span>
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
        )}
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
    </div>
  );
}
