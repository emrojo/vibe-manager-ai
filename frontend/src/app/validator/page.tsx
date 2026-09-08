"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, modifyTaskPlan, PromptTask, RepoValidator, RepoValidatorCreate } from "@/lib/api";
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
  ChevronUp,
  FolderGit2,
  Plus,
  Trash2,
  Key,
  GitBranch,
  ShieldCheck,
  Sparkles,
  FileEdit
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

  // Active top-level section: "prompts" | "plans" | "repos"
  const [activeSection, setActiveSection] = useState<"prompts" | "plans" | "repos">("prompts");

  // All tasks fetched from server
  const [allTasks, setAllTasks] = useState<PromptTask[]>([]);
  const [promptsFilter, setPromptsFilter] = useState<string>("PENDING");
  const [plansFilter, setPlansFilter] = useState<string>("PLAN_PENDING");
  const [loading, setLoading] = useState(false);

  // Repositories validated by this user
  const [myRepos, setMyRepos] = useState<RepoValidator[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<number | null>(null);
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [submittingRepo, setSubmittingRepo] = useState(false);
  const [newRepoForm, setNewRepoForm] = useState<RepoValidatorCreate>({
    repo_url: "",
    github_token: "",
    default_branch: "main",
    name: "",
  });

  // Editing state: map task id to edited prompt string
  const [editingPrompts, setEditingPrompts] = useState<Record<number, string>>({});
  const [expandedPromptIds, setExpandedPromptIds] = useState<Record<number, boolean>>({});

  // Rejection modals
  const [rejectingPromptTaskId, setRejectingPromptTaskId] = useState<number | null>(null);
  const [promptRejectionReason, setPromptRejectionReason] = useState<string>("");

  const [rejectingPlanTaskId, setRejectingPlanTaskId] = useState<number | null>(null);
  const [planRejectionReason, setPlanRejectionReason] = useState<string>("");

  // Modifying plan modal / view state
  const [modifyingPlanTask, setModifyingPlanTask] = useState<PromptTask | null>(null);
  const [editedPlanText, setEditedPlanText] = useState<string>("");
  const [planModificationPrompt, setPlanModificationPrompt] = useState<string>("");
  const [submittingPlanModification, setSubmittingPlanModification] = useState(false);

  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedConsoleTask, setSelectedConsoleTask] = useState<PromptTask | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (
        user.role !== "admin" &&
        user.role !== "validator" &&
        !user.is_project_validator &&
        (user.validated_repos_count ?? 0) === 0
      ) {
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

  const loadMyRepos = async () => {
    setReposLoading(true);
    try {
      const data = await apiRequest<RepoValidator[]>("/repo-validators/my");
      setMyRepos(data);
    } catch (err: any) {
      console.error("Error cargando repositorios validados:", err);
    } finally {
      setReposLoading(false);
    }
  };

  const handleDeleteRepo = async (id: number) => {
    if (!confirm("¿Seguro que deseas darte de baja como validador de este repositorio? Ya no recibirás prompts dirigidos a él.")) return;
    setDeletingRepoId(id);
    try {
      await apiRequest(`/repo-validators/${id}`, { method: "DELETE" });
      setFeedback({ type: "success", text: "Acreditación de validador eliminada correctamente." });
      await loadMyRepos();
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al eliminar repositorio" });
    } finally {
      setDeletingRepoId(null);
    }
  };

  const handleCreateRepoValidator = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingRepo(true);
    try {
      await apiRequest("/repo-validators", {
        method: "POST",
        body: JSON.stringify(newRepoForm),
      });
      setFeedback({ type: "success", text: "¡Repositorio acreditado con éxito! Ahora eres validador de este proyecto." });
      setShowAddRepoModal(false);
      setNewRepoForm({ repo_url: "", github_token: "", default_branch: "main", name: "" });
      await loadMyRepos();
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al darte de alta como validador" });
    } finally {
      setSubmittingRepo(false);
    }
  };

  useEffect(() => {
    if (
      user &&
      (user.role === "admin" ||
        user.role === "validator" ||
        user.is_project_validator ||
        (user.validated_repos_count ?? 0) > 0)
    ) {
      loadTasks();
      loadMyRepos();
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

  const handleOpenModifyPlan = (task: PromptTask) => {
    setModifyingPlanTask(task);
    setEditedPlanText(task.plan_content || "");
    setPlanModificationPrompt("");
  };

  const handleCloseModifyPlan = () => {
    setModifyingPlanTask(null);
    setEditedPlanText("");
    setPlanModificationPrompt("");
  };

  const handleSubmitModifyPlan = async () => {
    if (!modifyingPlanTask) return;
    if (!planModificationPrompt.trim()) {
      setFeedback({
        type: "error",
        text: "Por favor incluye un prompt con las instrucciones de modificación para Gemini.",
      });
      return;
    }

    setSubmittingPlanModification(true);
    try {
      await modifyTaskPlan(modifyingPlanTask.id, {
        edited_plan: editedPlanText.trim(),
        modification_prompt: planModificationPrompt.trim(),
      });
      setFeedback({
        type: "success",
        text: `Plan #${modifyingPlanTask.id} enviado para re-elaboración con Gemini.`,
      });
      handleCloseModifyPlan();
      await loadTasks();
    } catch (err: any) {
      setFeedback({
        type: "error",
        text: err.message || "Error al solicitar modificación del plan",
      });
    } finally {
      setSubmittingPlanModification(false);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

          <button
            onClick={() => setActiveSection("repos")}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === "repos"
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>3. Mis Repositorios Validados</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
              activeSection === "repos" ? "bg-white text-emerald-700" : "bg-emerald-500/20 text-emerald-300"
            }`}>
              {myRepos.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSection === "repos" && (
            <button
              onClick={() => setShowAddRepoModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Acreditar Repositorio</span>
            </button>
          )}
          <button
            onClick={() => {
              loadTasks();
              loadMyRepos();
            }}
            disabled={loading || reposLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || reposLoading ? "animate-spin" : ""}`} />
            <span>Refrescar</span>
          </button>
        </div>
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
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-slate-950 text-indigo-400 font-bold border border-indigo-500/20">
                          #{task.id}
                        </span>
                        <span className="text-sm font-semibold text-slate-200">
                          {task.project_name || `Proyecto #${task.project_id}`}
                        </span>
                        {task.repo_url && (
                          <a
                            href={task.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-mono bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded transition-colors"
                          >
                            <FolderGit2 className="w-3 h-3 shrink-0" />
                            <span>{task.repo_url.replace("https://github.com/", "")}</span>
                          </a>
                        )}
                        {task.assigned_validator_name && (
                          <span className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Validador: {task.assigned_validator_name}</span>
                          </span>
                        )}
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
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 font-bold border border-indigo-500/30">
                          Plan #{task.id}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {task.project_name || `Proyecto #${task.project_id}`}
                        </span>
                        {task.repo_url && (
                          <a
                            href={task.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-mono bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded transition-colors"
                          >
                            <FolderGit2 className="w-3 h-3 shrink-0" />
                            <span>{task.repo_url.replace("https://github.com/", "")}</span>
                          </a>
                        )}
                        {task.assigned_validator_name && (
                          <span className="text-[11px] text-indigo-300 bg-indigo-950/40 border border-indigo-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-indigo-400 shrink-0" />
                            <span>Validador: {task.assigned_validator_name}</span>
                          </span>
                        )}
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

                    {/* Previous Modification Feedback Info */}
                    {task.plan_feedback && (
                      <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-200 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-indigo-300 font-semibold mb-0.5">
                            Instrucciones de la última modificación solicitada:
                          </strong>
                          <span className="whitespace-pre-wrap text-slate-300 leading-relaxed">{task.plan_feedback}</span>
                        </div>
                      </div>
                    )}

                    {/* Actions for Plan */}
                    {isPlanPending ? (
                      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => setRejectingPlanTaskId(task.id)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/30 flex items-center gap-1.5 transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rechazar Plan</span>
                        </button>

                        <button
                          onClick={() => handleOpenModifyPlan(task)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 hover:border-indigo-500/50 flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40"
                        >
                          <FileEdit className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Modificar Plan</span>
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

      {/* SECTION 3: MY VALIDATED REPOSITORIES */}
      {activeSection === "repos" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-emerald-400" />
                Repositorios de GitHub Asignados
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Al acreditarte como validador de un repositorio con tu GitHub Personal Access Token (PAT), los usuarios podrán dirigir prompts hacia él. Serás tú quien valide los cambios y el worker usará tu token para clonar, hacer commit y abrir los Pull Requests correspondientes.
              </p>
            </div>
            <button
              onClick={() => setShowAddRepoModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Acreditar Nuevo Repositorio</span>
            </button>
          </div>

          {reposLoading ? (
            <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">Cargando repositorios validados...</p>
            </div>
          ) : myRepos.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-6">
              <FolderGit2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">
                No tienes repositorios acreditados aún
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto mb-4">
                Regístrate como validador de un repositorio de GitHub para empezar a recibir solicitudes de cambio y supervisar los Pull Requests.
              </p>
              <button
                onClick={() => setShowAddRepoModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Acreditar Repositorio Ahora</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myRepos.map((repo) => {
                const isDeleting = deletingRepoId === repo.id;
                return (
                  <div
                    key={repo.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 font-bold border border-emerald-500/20">
                            ID #{repo.id}
                          </span>
                          <h3 className="text-base font-bold text-white mt-1.5 flex items-center gap-1.5 break-all">
                            {repo.repo_name}
                          </h3>
                        </div>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          <span>Activo</span>
                        </span>
                      </div>

                      <a
                        href={repo.repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-mono break-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>{repo.repo_url}</span>
                      </a>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono">
                          <GitBranch className="w-3 h-3 text-slate-500" />
                          <span>{repo.default_branch || "main"}</span>
                        </span>

                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] text-emerald-300">
                          <Key className="w-3 h-3 text-emerald-400" />
                          <span>Token PAT Registrado</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                      <span>Registrado el {new Date(repo.created_at).toLocaleDateString()}</span>
                      <button
                        onClick={() => handleDeleteRepo(repo.id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1 rounded-lg border border-transparent hover:border-rose-500/20 transition-all disabled:opacity-50"
                      >
                        {isDeleting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Dar de baja</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Acreditarse como Validador de Repositorio */}
      {showAddRepoModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-emerald-400" />
                Acreditarse como Validador de Repositorio
              </h3>
              <button
                onClick={() => setShowAddRepoModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRepoValidator} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  URL del Repositorio de GitHub *
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://github.com/usuario/mi-repositorio"
                  value={newRepoForm.repo_url}
                  onChange={(e) => setNewRepoForm({ ...newRepoForm, repo_url: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  GitHub Personal Access Token (PAT) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="ghp_..."
                  value={newRepoForm.github_token}
                  onChange={(e) => setNewRepoForm({ ...newRepoForm, github_token: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  El token debe poseer permisos de lectura y escritura en el repositorio (scopes <code>repo</code> o <code>contents:write</code> + <code>pull_requests:write</code>) para abrir los PRs en tu nombre.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Rama por Defecto
                  </label>
                  <input
                    type="text"
                    value={newRepoForm.default_branch}
                    onChange={(e) => setNewRepoForm({ ...newRepoForm, default_branch: e.target.value })}
                    placeholder="main"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Nombre del Proyecto (Opcional)
                  </label>
                  <input
                    type="text"
                    value={newRepoForm.name || ""}
                    onChange={(e) => setNewRepoForm({ ...newRepoForm, name: e.target.value })}
                    placeholder="Ej: Web Principal"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddRepoModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingRepo || !newRepoForm.repo_url || !newRepoForm.github_token}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingRepo ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Acreditando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Acreditarme como Validador</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
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

      {/* Modify Plan Modal */}
      {modifyingPlanTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <FileEdit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Modificar Plan de Implementación #{modifyingPlanTask.id}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modifyingPlanTask.project_name || `Proyecto #${modifyingPlanTask.project_id}`}
                    {modifyingPlanTask.repo_url && ` • ${modifyingPlanTask.repo_url.replace("https://github.com/", "")}`}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseModifyPlan}
                disabled={submittingPlanModification}
                className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Context Prompt Box */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs">
                <span className="font-semibold text-amber-400 block mb-1 flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  Prompt Validado que originó este plan:
                </span>
                <p className="text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {modifyingPlanTask.edited_prompt || modifyingPlanTask.original_prompt}
                </p>
              </div>

              {/* 1. Plan Text Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-indigo-400" />
                    <span>Texto del Plan Técnico (Editable directamente)</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {editedPlanText.length} caracteres
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Puedes retocar o corregir directamente cualquier sección del plan antes de solicitar la re-generación a Gemini.
                </p>
                <textarea
                  rows={10}
                  value={editedPlanText}
                  onChange={(e) => setEditedPlanText(e.target.value)}
                  placeholder="# Plan de Implementación..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 transition-all focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* 2. Modification Prompt for Gemini */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Instrucciones / Prompt de Modificación para Gemini</span>
                  <span className="text-rose-400">*</span>
                </label>
                <p className="text-xs text-slate-400">
                  Describe detalladamente los cambios requeridos. Gemini recibirá el plan editado junto con estas instrucciones para sintetizar una nueva versión del plan.
                </p>
                <textarea
                  rows={3}
                  required
                  value={planModificationPrompt}
                  onChange={(e) => setPlanModificationPrompt(e.target.value)}
                  placeholder="Ej: No modifiques el esquema de la base de datos; utiliza almacenamiento local. Añade tests unitarios para los nuevos endpoints y asegura compatibilidad hacia atrás."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseModifyPlan}
                disabled={submittingPlanModification}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmitModifyPlan}
                disabled={submittingPlanModification || !planModificationPrompt.trim()}
                className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {submittingPlanModification ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando a Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Enviar a Gemini y Regenerar Plan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
