"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, PromptTask } from "@/lib/api";
import { 
  CheckSquare, 
  CheckCircle, 
  XCircle, 
  Edit3, 
  Clock, 
  RefreshCw, 
  GitPullRequest, 
  ExternalLink, 
  Play, 
  Save, 
  AlertCircle, 
  Layers,
  Terminal,
  FileCode2,
  ListOrdered,
  FileCheck2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import LiveConsoleModal from "@/components/LiveConsoleModal";

/**
 * Lightweight structured Markdown viewer for implementation plans.
 */
function PlanMarkdownView({ content }: { content: string }) {
  if (!content) {
    return <p className="text-xs text-slate-500 italic">No hay contenido de plan disponible.</p>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const renderInline = (text: string) => {
    // Process bold **text** and `code`
    const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1.5 py-0.5 bg-slate-800 text-amber-300 rounded font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 text-xs font-mono text-emerald-300 overflow-x-auto my-2 shadow-inner">
            <code>{codeBlockLines.join("\n")}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={`sp-${i}`} className="h-1.5" />);
      continue;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-xs font-bold uppercase tracking-wider text-slate-300 mt-3 mb-1 flex items-center gap-1.5">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-sm font-bold text-amber-400 mt-4 mb-1.5 pb-1 border-b border-slate-800/80 flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-amber-400 shrink-0" />
          {renderInline(trimmed.slice(3))}
        </h2>
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${i}`} className="text-base font-extrabold text-white mt-4 mb-2 pb-1 border-b border-indigo-500/30">
          {renderInline(trimmed.slice(2))}
        </h1>
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <div key={`li-${i}`} className="flex items-start gap-2 ml-2 my-1 text-xs text-slate-300">
          <span className="text-amber-400 mt-1 text-[8px]">•</span>
          <span className="leading-relaxed">{renderInline(trimmed.slice(2))}</span>
        </div>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^(\d+)\.\s(.*)$/);
      elements.push(
        <div key={`num-${i}`} className="flex items-start gap-2 ml-2 my-1 text-xs text-slate-300">
          <span className="font-mono text-indigo-400 font-bold shrink-0">{match ? match[1] : ""}.</span>
          <span className="leading-relaxed">{renderInline(match ? match[2] : trimmed)}</span>
        </div>
      );
    } else {
      elements.push(
        <p key={`p-${i}`} className="text-xs text-slate-300 leading-relaxed my-1">
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  return <div className="space-y-1 font-sans">{elements}</div>;
}

export default function ValidatorPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Active top-level section: "prompts" or "plans"
  const [activeSection, setActiveSection] = useState<"prompts" | "plans">("prompts");

  // All tasks fetched from server
  const [allTasks, setAllTasks] = useState<PromptTask[]>([]);
  const [promptsFilter, setPromptsFilter] = useState<string>("PENDING");
  const [plansFilter, setPlansFilter] = useState<string>("PLAN_PENDING");
  const [loading, setLoading] = useState(false);

  // Editing state: map task id to edited prompt string
  const [editingPrompts, setEditingPrompts] = useState<Record<number, string>>({});
  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<number, boolean>>({});

  // Rejection modals
  const [rejectingPromptTaskId, setRejectingPromptTaskId] = useState<number | null>(null);
  const [promptRejectionReason, setPromptRejectionReason] = useState<string>("");

  const [rejectingPlanTaskId, setRejectingPlanTaskId] = useState<number | null>(null);
  const [planRejectionReason, setPlanRejectionReason] = useState<string>("");

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedConsoleTask, setSelectedConsoleTask] = useState<PromptTask | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role !== "validator" && user.role !== "admin") {
        router.push("/dashboard");
      }
    }
  }, [user, authLoading, router]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<PromptTask[]>("/validation/tasks");
      setAllTasks(data);

      // Preload editing state
      const initialEdits: Record<number, string> = {};
      data.forEach((t) => {
        initialEdits[t.id] = t.edited_prompt || t.original_prompt;
      });
      setEditingPrompts(initialEdits);
    } catch (err: any) {
      console.error("Error cargando tareas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === "validator" || user.role === "admin")) {
      loadTasks();
    }
  }, [user]);

  // Counts for badges
  const pendingPromptsCount = useMemo(() => {
    return allTasks.filter((t) => t.status === "PENDING").length;
  }, [allTasks]);

  const pendingPlansCount = useMemo(() => {
    return allTasks.filter((t) => t.status === "PLAN_PENDING").length;
  }, [allTasks]);

  // Filter tasks for Prompts tab
  const promptTasks = useMemo(() => {
    if (promptsFilter === "ALL") return allTasks;
    return allTasks.filter((t) => t.status === promptsFilter);
  }, [allTasks, promptsFilter]);

  // Filter tasks for Plans tab
  const planTasks = useMemo(() => {
    if (plansFilter === "ALL") {
      return allTasks.filter((t) => t.plan_content || t.status === "PLAN_PENDING" || t.status === "PLAN_APPROVED");
    }
    return allTasks.filter((t) => t.status === plansFilter);
  }, [allTasks, plansFilter]);

  const toggleExpandPrompt = (taskId: number) => {
    setExpandedPromptIds((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleSaveEdit = async (taskId: number) => {
    const text = editingPrompts[taskId];
    if (!text || !text.trim()) return;

    setActionLoading(taskId);
    try {
      await apiRequest(`/validation/tasks/${taskId}/edit`, {
        method: "PUT",
        body: JSON.stringify({ edited_prompt: text.trim() }),
      });
      setFeedback({ type: "success", text: `Prompt #${taskId} actualizado con éxito.` });
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al guardar el prompt" });
    } finally {
      setActionLoading(null);
    }
  };

  // Phase 1 Approval: Triggers Docker sandbox in mode="PLAN"
  const handleApprovePrompt = async (taskId: number) => {
    setActionLoading(taskId);
    setFeedback(null);
    try {
      // If the prompt was modified in the textarea, save it first
      const currentText = editingPrompts[taskId];
      if (currentText) {
        await apiRequest(`/validation/tasks/${taskId}/edit`, {
          method: "PUT",
          body: JSON.stringify({ edited_prompt: currentText.trim() }),
        });
      }

      await apiRequest(`/validation/tasks/${taskId}/approve`, {
        method: "POST",
      });

      setFeedback({
        type: "success",
        text: `¡Prompt #${taskId} aprobado! Se está generando el plan de implementación en el contenedor aislado de Docker. En unos momentos estará listo en la pestaña "Planes de Implementación".`,
      });
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al aprobar la tarea" });
    } finally {
      setActionLoading(null);
    }
  };

  // Phase 2 Approval: Approves generated plan and triggers Docker in mode="EXECUTE"
  const handleApprovePlan = async (taskId: number) => {
    setActionLoading(taskId);
    setFeedback(null);
    try {
      await apiRequest(`/validation/tasks/${taskId}/approve-plan`, {
        method: "POST",
      });

      setFeedback({
        type: "success",
        text: `¡Plan de la Tarea #${taskId} aprobado! Se ha iniciado la ejecución dentro de Docker para aplicar los cambios de código y abrir el Pull Request en GitHub.`,
      });
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al aprobar el plan" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetry = async (taskId: number) => {
    setActionLoading(taskId);
    setFeedback(null);
    try {
      await apiRequest(`/validation/tasks/${taskId}/retry`, {
        method: "POST",
      });
      setFeedback({
        type: "success",
        text: `¡Tarea #${taskId} reencolada! Se ha iniciado de nuevo la ejecución en el sandbox.`,
      });
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al reintentar la tarea" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPromptSubmit = async () => {
    if (!rejectingPromptTaskId || !promptRejectionReason.trim()) return;
    setActionLoading(rejectingPromptTaskId);
    try {
      await apiRequest(`/validation/tasks/${rejectingPromptTaskId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: promptRejectionReason.trim() }),
      });
      setFeedback({ type: "success", text: `Prompt #${rejectingPromptTaskId} rechazado.` });
      setRejectingPromptTaskId(null);
      setPromptRejectionReason("");
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al rechazar prompt" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPlanSubmit = async () => {
    if (!rejectingPlanTaskId || !planRejectionReason.trim()) return;
    setActionLoading(rejectingPlanTaskId);
    try {
      await apiRequest(`/validation/tasks/${rejectingPlanTaskId}/reject-plan`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: planRejectionReason.trim() }),
      });
      setFeedback({ type: "success", text: `Plan de la Tarea #${rejectingPlanTaskId} rechazado.` });
      setRejectingPlanTaskId(null);
      setPlanRejectionReason("");
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al rechazar plan" });
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <CheckSquare className="w-7 h-7 text-amber-400" />
          Mesa de Validación de Solicitudes
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Flujo de trabajo en 2 fases: primero valida el prompt para generar el plan técnico, y luego revisa el plan propuesto antes de ejecutar el código dentro de Docker y abrir el Pull Request.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/20 text-rose-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="leading-relaxed">{feedback.text}</span>
        </div>
      )}

      {/* Primary Section Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSection("prompts")}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === "prompts"
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>1. Validación de Prompts</span>
            {pendingPromptsCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                activeSection === "prompts" ? "bg-slate-950 text-amber-300" : "bg-amber-500/20 text-amber-400"
              }`}>
                {pendingPromptsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSection("plans")}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === "plans"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>2. Planes de Implementación</span>
            {pendingPlansCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                activeSection === "plans" ? "bg-white text-indigo-700" : "bg-indigo-500/20 text-indigo-300 animate-pulse"
              }`}>
                {pendingPlansCount} pendiente{pendingPlansCount > 1 ? "s" : ""}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={loadTasks}
          disabled={loading}
          className="self-start sm:self-center flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* SECTION 1: PROMPTS VALIDATION */}
      {activeSection === "prompts" && (
        <div className="space-y-6">
          {/* Subfilter for Prompts */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "PENDING", label: "Pendientes de Aprobación" },
              { id: "APPROVED", label: "En Generación de Plan" },
              { id: "RUNNING", label: "En Docker" },
              { id: "COMPLETED", label: "Completados / PR" },
              { id: "REJECTED", label: "Rechazados" },
              { id: "ALL", label: "Todos los Prompts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPromptsFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  promptsFilter === tab.id
                    ? "bg-slate-700 text-white border border-slate-600"
                    : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {promptTasks.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
              <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">
                No hay prompts en esta sección ({promptsFilter})
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Los prompts enviados por los usuarios aparecerán aquí para tu revisión inicial.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {promptTasks.map((task) => {
                const isPending = task.status === "PENDING";
                const isLoadingThis = actionLoading === task.id;

                return (
                  <div
                    key={task.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 transition-all"
                  >
                    {/* Top Meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-950 text-indigo-400 font-bold border border-indigo-500/20">
                          #{task.id}
                        </span>
                        <span className="text-sm font-semibold text-slate-200">
                          {task.project_name || `Proyecto #${task.project_id}`}
                        </span>
                        <span className="text-xs text-slate-400">
                          por <strong className="text-slate-300">{task.user_name || task.user_email}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {new Date(task.created_at).toLocaleString()}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                            task.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : task.status === "APPROVED"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                              : task.status === "PLAN_PENDING"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : task.status === "RUNNING"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              : task.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    </div>

                    {/* Content Comparison / Editing */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Original Prompt */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          Prompt Original del Usuario:
                        </span>
                        <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                          {task.original_prompt}
                        </p>
                      </div>

                      {/* Validator Modified Prompt */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5" />
                            Prompt a Consultar (Editable):
                          </span>
                          {isPending && (
                            <button
                              onClick={() => handleSaveEdit(task.id)}
                              disabled={isLoadingThis}
                              className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              <span>Guardar borrador</span>
                            </button>
                          )}
                        </div>
                        {isPending ? (
                          <textarea
                            rows={4}
                            value={editingPrompts[task.id] || ""}
                            onChange={(e) =>
                              setEditingPrompts({ ...editingPrompts, [task.id]: e.target.value })
                            }
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500 transition-all"
                            placeholder="Edita o añade directrices técnicas adicionales antes de aprobar..."
                          />
                        ) : (
                          <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                            {task.edited_prompt || task.original_prompt}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Rejection info */}
                    {task.rejection_reason && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                        <strong className="block text-rose-400 mb-0.5">Motivo del Rechazo:</strong>
                        {task.rejection_reason}
                      </div>
                    )}

                    {/* Actions */}
                    {isPending ? (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => setRejectingPromptTaskId(task.id)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/30 flex items-center gap-1.5 transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rechazar Prompt</span>
                        </button>

                        <button
                          onClick={() => handleApprovePrompt(task.id)}
                          disabled={isLoadingThis}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>Aprobar Prompt y Generar Plan</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        {task.status === "FAILED" && (
                          <button
                            onClick={() => handleRetry(task.id)}
                            disabled={isLoadingThis}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all disabled:opacity-50"
                          >
                            {isLoadingThis ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            <span>Reintentar Generación</span>
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedConsoleTask(task)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            task.status === "RUNNING"
                              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                          }`}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>{task.status === "RUNNING" ? "Ver Consola en Vivo" : "Ver Consola"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: PLANS IMPLEMENTATION VALIDATION */}
      {activeSection === "plans" && (
        <div className="space-y-6">
          {/* Subfilter for Plans */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "PLAN_PENDING", label: "Planes Pendientes de Aprobación" },
              { id: "PLAN_APPROVED", label: "Planes Aprobados" },
              { id: "ALL", label: "Todos los Planes" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setPlansFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  plansFilter === tab.id
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                    : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/80"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {planTasks.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
              <FileCheck2 className="w-10 h-10 text-indigo-400/60 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">
                No hay planes de implementación en esta sección ({plansFilter})
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Cuando apruebes un prompt en la pestaña 1, el sandbox de Docker consultará a Gemini para elaborar el plan técnico. En cuanto esté listo aparecerá aquí para que lo valides antes de realizar modificaciones.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {planTasks.map((task) => {
                const isPlanPending = task.status === "PLAN_PENDING";
                const isExpanded = expandedPromptIds[task.id] ?? false;
                const isLoadingThis = actionLoading === task.id;

                return (
                  <div
                    key={task.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 transition-all"
                  >
                    {/* Plan Top Meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 font-bold border border-indigo-500/30">
                          Plan #{task.id}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {task.project_name || `Proyecto #${task.project_id}`}
                        </span>
                        <span className="text-xs text-slate-400">
                          solicitado por <strong className="text-slate-300">{task.user_name || task.user_email}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {new Date(task.updated_at).toLocaleString()}
                        </span>
                        <span
                          className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            task.status === "PLAN_PENDING"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold animate-pulse"
                              : task.status === "PLAN_APPROVED"
                              ? "bg-teal-500/10 text-teal-400 border border-teal-500/30"
                              : task.status === "RUNNING"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/30"
                              : task.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {task.status === "PLAN_PENDING" ? "Plan Pendiente de Validación" : task.status}
                        </span>
                      </div>
                    </div>

                    {/* Associated Prompt Summary (Collapsible) */}
                    <div className="bg-slate-950/80 rounded-xl border border-slate-800/80 p-3 text-xs">
                      <button
                        onClick={() => toggleExpandPrompt(task.id)}
                        className="w-full flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        <span className="font-semibold flex items-center gap-2">
                          <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                          <span>Prompt Validado que origina este Plan</span>
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800 font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                          {task.edited_prompt || task.original_prompt}
                        </div>
                      )}
                    </div>

                    {/* Plan Content Card */}
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                          <ListOrdered className="w-4 h-4" />
                          Plan Técnico Generado por Gemini (en Docker Sandbox):
                        </span>
                        {task.plan_validated_at && (
                          <span className="text-[11px] text-teal-400 flex items-center gap-1 font-mono">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Aprobado el {new Date(task.plan_validated_at).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div className="pt-1">
                        <PlanMarkdownView content={task.plan_content || ""} />
                      </div>
                    </div>

                    {/* PR link if completed */}
                    {task.pr_url && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
                        <span className="text-emerald-300 font-medium flex items-center gap-2">
                          <GitPullRequest className="w-4 h-4 text-emerald-400" />
                          Pull Request generado: {task.pr_url}
                        </span>
                        <a
                          href={task.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-1 transition-all"
                        >
                          <span>Abrir en GitHub</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Plan Rejection info */}
                    {task.plan_rejection_reason && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                        <strong className="block text-rose-400 mb-0.5">Motivo del Rechazo del Plan:</strong>
                        {task.plan_rejection_reason}
                      </div>
                    )}

                    {/* Actions for Plan */}
                    {isPlanPending ? (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => setRejectingPlanTaskId(task.id)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/30 flex items-center gap-1.5 transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rechazar Plan</span>
                        </button>

                        <button
                          onClick={() => handleApprovePlan(task.id)}
                          disabled={isLoadingThis}
                          className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isLoadingThis ? (
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current" />
                          )}
                          <span>Aprobar Plan y Ejecutar en Sandbox</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3 pt-2">
                        {task.status === "FAILED" && (
                          <button
                            onClick={() => handleRetry(task.id)}
                            disabled={isLoadingThis}
                            className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all disabled:opacity-50"
                          >
                            {isLoadingThis ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            <span>Reintentar Ejecución</span>
                          </button>
                        )}

                        <button
                          onClick={() => setSelectedConsoleTask(task)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                            task.status === "RUNNING"
                              ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                          }`}
                        >
                          <Terminal className="w-3.5 h-3.5" />
                          <span>{task.status === "RUNNING" ? "Ver Consola en Vivo" : "Ver Consola"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Live Console Modal */}
      {selectedConsoleTask && (
        <LiveConsoleModal
          task={selectedConsoleTask}
          onClose={() => setSelectedConsoleTask(null)}
        />
      )}

      {/* Reject Prompt Modal */}
      {rejectingPromptTaskId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Rechazar Prompt #{rejectingPromptTaskId}
            </h3>
            <p className="text-xs text-slate-400">
              Indica la razón por la cual este prompt no puede ser procesado para que el usuario pueda corregirlo.
            </p>

            <textarea
              rows={3}
              required
              value={promptRejectionReason}
              onChange={(e) => setPromptRejectionReason(e.target.value)}
              placeholder="Ej: El cambio solicitado es ambiguo o no cumple con las directrices del proyecto."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingPromptTaskId(null);
                  setPromptRejectionReason("");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectPromptSubmit}
                disabled={!promptRejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Plan Modal */}
      {rejectingPlanTaskId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Rechazar Plan Técnico #{rejectingPlanTaskId}
            </h3>
            <p className="text-xs text-slate-400">
              Indica por qué este plan de implementación no es adecuado (ej: altera archivos que no corresponden, enfoque riesgoso, etc.).
            </p>

            <textarea
              rows={3}
              required
              value={planRejectionReason}
              onChange={(e) => setPlanRejectionReason(e.target.value)}
              placeholder="Ej: El plan propone modificar la configuración central de autenticación en lugar del componente local."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingPlanTaskId(null);
                  setPlanRejectionReason("");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectPlanSubmit}
                disabled={!planRejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                Confirmar Rechazo del Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
