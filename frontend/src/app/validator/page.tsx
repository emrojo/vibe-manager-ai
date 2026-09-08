"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
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
  FileEdit,
  Boxes,
  Bot,
  CheckCircle2
} from "lucide-react";
import LiveConsoleModal from "@/components/LiveConsoleModal";
import WorkflowGuide from "@/components/WorkflowGuide";

export interface UserContextItem {
  id: number;
  user_id: number;
  user_name?: string;
  user_email?: string;
  identifier: string;
  name: string;
  description?: string;
  context_text: string;
  character_count: number;
  estimated_tokens: number;
  status: "PENDING" | "APPROVED" | "PLAN_PENDING" | "ACCEPTED" | "REJECTED";
  version: number;
  repo_validator_id?: number;
  repo_name?: string;
  assigned_validator_id?: number;
  assigned_validator_name?: string;
  edited_text?: string;
  accepted_text?: string;
  validated_by_id?: number;
  validated_by_name?: string;
  validated_at?: string;
  plan_markdown?: string;
  plan_feedback?: string;
  plan_validated_by_id?: number;
  plan_validator_name?: string;
  plan_validated_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

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
  const { t } = useI18n();

  // Active top-level section: "prompts" | "plans" | "contexts" | "repos"
  const [activeSection, setActiveSection] = useState<"prompts" | "plans" | "contexts" | "repos">("prompts");

  // All tasks fetched from server
  const [allTasks, setAllTasks] = useState<PromptTask[]>([]);
  const [promptsFilter, setPromptsFilter] = useState<string>("PENDING");
  const [plansFilter, setPlansFilter] = useState<string>("PLAN_PENDING");
  const [loading, setLoading] = useState(false);

  // Context validation states
  const [valContexts, setValContexts] = useState<UserContextItem[]>([]);
  const [valContextsLoading, setValContextsLoading] = useState(false);
  const [contextsFilter, setContextsFilter] = useState<string>("ALL");
  const [editingContextTexts, setEditingContextTexts] = useState<Record<number, string>>({});
  const [rejectingContextId, setRejectingContextId] = useState<number | null>(null);
  const [contextRejectionReason, setContextRejectionReason] = useState<string>("");
  const [modifyingContextPlan, setModifyingContextPlan] = useState<UserContextItem | null>(null);
  const [editedContextPlanText, setEditedContextPlanText] = useState<string>("");
  const [contextPlanModificationFeedback, setContextPlanModificationFeedback] = useState<string>("");
  const [submittingContextPlanMod, setSubmittingContextPlanMod] = useState(false);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sec = params.get("section");
      if (sec === "prompts" || sec === "plans" || sec === "contexts" || sec === "repos") {
        setActiveSection(sec);
      }
    }
  }, []);

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

  const loadValContexts = async () => {
    setValContextsLoading(true);
    try {
      const data = await apiRequest<UserContextItem[]>("/validation/contexts");
      setValContexts(data);
      const initialEdits: Record<number, string> = {};
      data.forEach((c) => {
        initialEdits[c.id] = c.edited_text || c.context_text;
      });
      setEditingContextTexts(initialEdits);
    } catch (err: any) {
      console.error("Error cargando contextos para validación:", err);
    } finally {
      setValContextsLoading(false);
    }
  };

  const handleSaveContextText = async (contextId: number) => {
    const text = editingContextTexts[contextId];
    if (!text || !text.trim()) return;
    setActionLoading(contextId);
    try {
      await apiRequest(`/validation/contexts/${contextId}/edit`, {
        method: "PUT",
        body: JSON.stringify({ edited_text: text.trim() }),
      });
      setFeedback({ type: "success", text: `Texto del contexto #${contextId} actualizado correctamente.` });
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al actualizar texto del contexto" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveContextRaw = async (contextId: number) => {
    setActionLoading(contextId);
    try {
      const currentEdit = editingContextTexts[contextId];
      if (currentEdit) {
        await apiRequest(`/validation/contexts/${contextId}/edit`, {
          method: "PUT",
          body: JSON.stringify({ edited_text: currentEdit.trim() }),
        });
      }
      await apiRequest(`/validation/contexts/${contextId}/approve`, { method: "POST" });
      setFeedback({
        type: "success",
        text: `¡Directrices del contexto #${contextId} aprobadas! Se ha enviado a Gemini para generar el Plan de Contexto Técnico.`,
      });
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al aprobar contexto" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectContextSubmit = async () => {
    if (!rejectingContextId || !contextRejectionReason.trim()) return;
    setActionLoading(rejectingContextId);
    try {
      await apiRequest(`/validation/contexts/${rejectingContextId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: contextRejectionReason.trim() }),
      });
      setFeedback({ type: "success", text: `Contexto #${rejectingContextId} rechazado.` });
      setRejectingContextId(null);
      setContextRejectionReason("");
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al rechazar contexto" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveContextPlan = async (contextId: number) => {
    setActionLoading(contextId);
    try {
      await apiRequest(`/validation/contexts/${contextId}/approve-plan`, { method: "POST" });
      setFeedback({
        type: "success",
        text: `¡Plan de Contexto #${contextId} Aceptado Definitivamente! El contexto ya puede ser seleccionado en prompts.`,
      });
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al aprobar plan de contexto" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenModifyContextPlan = (ctx: UserContextItem) => {
    setModifyingContextPlan(ctx);
    setEditedContextPlanText(ctx.plan_markdown || "");
    setContextPlanModificationFeedback("");
  };

  const handleSubmitModifyContextPlan = async () => {
    if (!modifyingContextPlan) return;
    setSubmittingContextPlanMod(true);
    try {
      await apiRequest(`/validation/contexts/${modifyingContextPlan.id}/modify-plan`, {
        method: "POST",
        body: JSON.stringify({
          plan_markdown: editedContextPlanText.trim() || undefined,
          feedback: contextPlanModificationFeedback.trim() || undefined,
        }),
      });
      setFeedback({
        type: "success",
        text: contextPlanModificationFeedback.trim()
          ? `Feedback enviado a Gemini para re-elaborar el Plan de Contexto.`
          : `Plan de Contexto modificado guardado.`,
      });
      setModifyingContextPlan(null);
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al modificar plan de contexto" });
    } finally {
      setSubmittingContextPlanMod(false);
    }
  };

  const handleRejectContextPlanSubmit = async (contextId: number, reason: string) => {
    if (!reason.trim()) return;
    setActionLoading(contextId);
    try {
      await apiRequest(`/validation/contexts/${contextId}/reject-plan`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setFeedback({ type: "success", text: `Plan del Contexto #${contextId} rechazado.` });
      await loadValContexts();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al rechazar plan de contexto" });
    } finally {
      setActionLoading(null);
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
      loadValContexts();
    }
  }, [user]);

  // Counts for badges
  const pendingPromptsCount = useMemo(() => {
    return allTasks.filter((t) => t.status === "PENDING").length;
  }, [allTasks]);

  const pendingPlansCount = useMemo(() => {
    return allTasks.filter((t) => t.status === "PLAN_PENDING").length;
  }, [allTasks]);

  const pendingContextsCount = useMemo(() => {
    return valContexts.filter((c) => c.status === "PENDING" || c.status === "PLAN_PENDING").length;
  }, [valContexts]);

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

  // Filter contexts for Contexts tab
  const filteredValContexts = useMemo(() => {
    if (contextsFilter === "ALL") return valContexts;
    return valContexts.filter((c) => c.status === contextsFilter);
  }, [valContexts, contextsFilter]);

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

      {/* Interactive Workflow Guide Stepper for Validators */}
      <WorkflowGuide
        flowType="prompts"
        isValidator={true}
        activeFilterStep={
          activeSection === "prompts"
            ? "validate_prompt"
            : activeSection === "plans"
            ? "validate_plan"
            : undefined
        }
        onFilterStep={(stepKey) => {
          if (stepKey === "create") router.push("/dashboard");
          else if (stepKey === "validate_prompt") setActiveSection("prompts");
          else if (stepKey === "validate_plan") setActiveSection("plans");
          else if (stepKey === "prs") router.push("/pull-requests");
        }}
        counts={{
          pendingPrompts: pendingPromptsCount,
          pendingPlans: pendingPlansCount,
          completedPRs: allTasks.filter((t) => t.status === "COMPLETED").length,
        }}
      />

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
            onClick={() => setActiveSection("contexts")}
            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
              activeSection === "contexts"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>3. Contextos de Usuario</span>
            {pendingContextsCount > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                activeSection === "contexts" ? "bg-white text-purple-700" : "bg-purple-500/20 text-purple-300 animate-pulse"
              }`}>
                {pendingContextsCount} pendiente{pendingContextsCount > 1 ? "s" : ""}
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
            <span>4. Mis Repositorios Validados</span>
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
              loadValContexts();
            }}
            disabled={loading || reposLoading || valContextsLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading || reposLoading || valContextsLoading ? "animate-spin" : ""}`} />
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
              { id: "PENDING", label: t("validator.filter_pending_approval", "Pendientes de Aprobación") },
              { id: "APPROVED", label: t("validator.filter_plan_generating", "En Generación de Plan") },
              { id: "RUNNING", label: t("validator.filter_in_docker", "En Docker") },
              { id: "COMPLETED", label: t("validator.filter_completed_pr", "Completados / PR") },
              { id: "REJECTED", label: t("validator.filter_rejected", "Rechazados") },
              { id: "ALL", label: t("validator.filter_all_prompts", "Todos los Prompts") },
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
                {t("validator.no_prompts_in_section", "No hay prompts en esta sección")} ({promptsFilter})
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {t("validator.prompts_help_desc", "Los prompts enviados por los usuarios aparecerán aquí para tu revisión inicial.")}
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
                          {task.project_name || `${t("dashboard.project", "Proyecto")} #${task.project_id}`}
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
                            <span>{t("contexts.validator_label", "Validador:")} {task.assigned_validator_name}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {t("common.by", "por")} <strong className="text-slate-300">{task.user_name || task.user_email}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {new Date(task.created_at).toLocaleString()}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            task.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : task.status === "APPROVED"
                              ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
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
                          {t("validator.prompt_original_user", "Prompt Original del Usuario:")}
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
                            {t("validator.prompt_review_label", "Prompt a Consultar (Editable):")}
                          </span>
                          {isPending && (
                            <button
                              onClick={() => handleSaveEdit(task.id)}
                              disabled={isLoadingThis}
                              className="text-[11px] text-slate-400 hover:text-amber-300 flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              <span>{t("validator.save_draft", "Guardar borrador")}</span>
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
                            placeholder={t("validator.edit_prompt_placeholder", "Edita o añade directrices técnicas adicionales antes de aprobar...")}
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
                        <strong className="block text-rose-400 mb-0.5">{t("validator.rejection_reason_label", "Motivo del Rechazo:")}</strong>
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
                          <span>{t("validator.reject_prompt", "Rechazar Prompt")}</span>
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
                          <span>{t("validator.approve_generate_plan", "Aprobar Prompt y Generar Plan en Docker")}</span>
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
                            <span>{t("validator.retry_generation", "Reintentar Generación")}</span>
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
                          <span>{task.status === "RUNNING" ? t("dashboard.live_console", "Ver Consola en Vivo") : t("dashboard.console", "Ver Consola")}</span>
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
              { id: "PLAN_PENDING", label: t("validator.plans_filter_pending", "Planes Pendientes de Aprobación") },
              { id: "PLAN_APPROVED", label: t("validator.plans_filter_approved", "Planes Aprobados") },
              { id: "ALL", label: t("validator.plans_filter_all", "Todos los Planes") },
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
                {t("validator.no_plans_title", `No hay planes de implementación en esta sección (${plansFilter})`, { filter: plansFilter })}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {t("validator.no_plans_desc", "Cuando apruebes un prompt en la pestaña 1, el sandbox de Docker consultará a Gemini para elaborar el plan técnico. En cuanto esté listo aparecerá aquí para que lo valides antes de realizar modificaciones.")}
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
                          {t("validator.plan_num", `Plan #${task.id}`, { id: task.id })}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {task.project_name || t("validator.project_fallback", `Proyecto #${task.project_id}`, { id: task.project_id })}
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
                            <span>{t("validator.validator_label", `Validador: ${task.assigned_validator_name}`, { name: task.assigned_validator_name })}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {t("validator.requested_by", "solicitado por")}{" "}
                          <strong className="text-slate-300">{task.user_name || task.user_email}</strong>
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
                          {task.status === "PLAN_PENDING" ? t("validator.status_plan_pending", "Plan Pendiente de Validación") : task.status}
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
                          <span>{t("validator.prompt_origin_plan", "Prompt Validado que origina este Plan")}</span>
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
                          {t("validator.plan_gemini_title", "Plan Técnico Generado por Gemini (en Docker Sandbox):")}
                        </span>
                        {task.plan_validated_at && (
                          <span className="text-[11px] text-teal-400 flex items-center gap-1 font-mono">
                            <CheckCircle className="w-3.5 h-3.5" />
                            {t("validator.plan_approved_at", `Aprobado el ${new Date(task.plan_validated_at).toLocaleString()}`, { date: new Date(task.plan_validated_at).toLocaleString() })}
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
                          {t("validator.pr_generated", `Pull Request generado: ${task.pr_url}`, { url: task.pr_url })}
                        </span>
                        <a
                          href={task.pr_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-1 transition-all"
                        >
                          <span>{t("pullRequests.view_github", "Abrir en GitHub")}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}

                    {/* Plan Rejection info */}
                    {task.plan_rejection_reason && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                        <strong className="block text-rose-400 mb-0.5">{t("validator.plan_rejection_reason_title", "Motivo del Rechazo del Plan:")}</strong>
                        {task.plan_rejection_reason}
                      </div>
                    )}

                    {/* Previous Modification Feedback Info */}
                    {task.plan_feedback && (
                      <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-200 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block text-indigo-300 font-semibold mb-0.5">
                            {t("validator.plan_last_feedback_title", "Instrucciones de la última modificación solicitada:")}
                          </strong>
                          <span className="whitespace-pre-wrap text-slate-300 leading-relaxed">{task.plan_feedback}</span>
                        </div>
                      </div>
                    )}

                    {/* Context Evolution Notice */}
                    {task.context_id ? (
                      <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs text-indigo-200 flex items-start gap-2.5">
                        <Boxes className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold text-indigo-300">{t("validator.context_evolution_title", "Evolución de Contexto:")} </span>
                          <span>
                            {t("validator.task_linked_context", `Esta tarea está vinculada al contexto #${task.context_id} ${task.context_name ? `(${task.context_name})` : ""}.`, { id: task.context_id, name: task.context_name ? `(${task.context_name})` : "" })}
                            {task.temporal_context_status === "MERGED" ? (
                              <span className="text-emerald-400 ml-1">
                                {t("validator.context_evolution_merged", "✓ El contexto temporal y este plan ya han sido fusionados en el contexto fijo.")}
                              </span>
                            ) : task.temporal_context_status === "DISCARDED" ? (
                              <span className="text-rose-400 ml-1">
                                {t("validator.context_evolution_discarded", "✕ El contexto temporal fue desechado al ser rechazado el plan.")}
                              </span>
                            ) : (
                              <span className="text-indigo-200/90 ml-1">
                                {t("validator.context_evolution_notice", "Al Aprobar el Plan, el contexto temporal y los cambios de este plan se fusionarán automáticamente configurando el nuevo contenido del contexto fijo (incrementando su versión). Si se Rechaza el Plan, el contexto temporal será desechado.")}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {/* Actions for Plan */}
                    {isPlanPending ? (
                      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                        <button
                          onClick={() => setRejectingPlanTaskId(task.id)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/30 flex items-center gap-1.5 transition-all"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t("validator.reject_plan", "Rechazar Plan")}</span>
                        </button>

                        <button
                          onClick={() => handleOpenModifyPlan(task)}
                          disabled={isLoadingThis}
                          className="px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 hover:text-white text-xs font-semibold border border-indigo-500/30 hover:border-indigo-500/50 flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/40"
                        >
                          <FileEdit className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{t("validator.modify_plan", "Modificar Plan")}</span>
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
                          <span>{t("validator.approve_plan_execute", "Aprobar Plan y Ejecutar en Sandbox")}</span>
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
                            <span>{t("validator.retry_execution", "Reintentar Ejecución")}</span>
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
                          <span>{task.status === "RUNNING" ? t("validator.view_live_console", "Ver Consola en Vivo") : t("validator.view_console", "Ver Consola")}</span>
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

      {/* SECTION 3: USER CONTEXTS VALIDATION */}
      {activeSection === "contexts" && (
        <div className="space-y-6">
          {/* Subfilter */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "ALL", label: t("validator.ctx_filter_all", "Todos los Contextos") },
                { id: "PENDING", label: t("validator.ctx_filter_pending", "Directrices Pendientes (Fase 1)") },
                { id: "PLAN_PENDING", label: t("validator.ctx_filter_plan_pending", "Planes de Contexto (Fase 2)") },
                { id: "ACCEPTED", label: t("validator.ctx_filter_accepted", "Aceptados Definitivos") },
                { id: "REJECTED", label: t("validator.ctx_filter_rejected", "Rechazados") },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setContextsFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    contextsFilter === tab.id
                      ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                      : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800/80"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400">
              {t("validator.total_contexts_count", `Total: ${filteredValContexts.length} contextos`, { count: filteredValContexts.length })}
            </div>
          </div>

          {/* Workflow Alert */}
          <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-start gap-3">
            <Bot className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-purple-300">{t("validator.ctx_workflow_title", "Validación de Contextos en 2 Fases:")}</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-400">
                <li><strong>{t("validator.ctx_phase1_title", "Fase 1 (Directrices):")}</strong> {t("validator.ctx_phase1_desc", "Revisa y edita el texto antes de aprobar. Al aprobar, Gemini generará el Plan de Contexto.")}</li>
                <li><strong>{t("validator.ctx_phase2_title", "Fase 2 (Plan de Contexto):")}</strong> {t("validator.ctx_phase2_desc", "Valida el Plan Técnico estructurado por Gemini. Puedes aceptarlo definitivamente (pasa a ACCEPTED para prompts), modificarlo o rechazarlo.")}</li>
              </ul>
            </div>
          </div>

          {filteredValContexts.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
              <Boxes className="w-10 h-10 text-purple-400/60 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">
                {t("validator.no_contexts_in_filter", `No hay contextos en esta categoría (${contextsFilter})`, { filter: contextsFilter })}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {t("validator.no_contexts_in_filter_desc", "Cuando los desarrolladores creen o iteren sus directrices de contexto, aparecerán aquí para tu supervisión.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {filteredValContexts.map((ctx) => {
                const isPendingRaw = ctx.status === "PENDING";
                const isPlanPending = ctx.status === "PLAN_PENDING";
                const isLoadingThis = actionLoading === ctx.id;

                return (
                  <div
                    key={ctx.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 transition-all"
                  >
                    {/* Header meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-purple-950 text-purple-300 font-bold border border-purple-500/30">
                          {t("validator.context_num", `Contexto #${ctx.id}`, { id: ctx.id })}
                        </span>
                        <span className="text-sm font-semibold text-white">{ctx.name}</span>
                        <code className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                          @{ctx.identifier}
                        </code>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                          v{ctx.version}
                        </span>
                        {ctx.repo_name && (
                          <span className="text-[11px] text-sky-400 font-mono bg-sky-950/40 border border-sky-800/40 px-2 py-0.5 rounded flex items-center gap-1">
                            <FolderGit2 className="w-3 h-3 shrink-0" />
                            <span>{ctx.repo_name}</span>
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {t("validator.created_by", "creado por")}{" "}
                          <strong className="text-slate-300">{ctx.user_name || ctx.user_email}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-mono">
                          ~{ctx.estimated_tokens.toLocaleString()} tokens
                        </span>
                        <span
                          className={`text-xs font-semibold px-3 py-1 rounded-full ${
                            ctx.status === "PENDING"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold animate-pulse"
                              : ctx.status === "APPROVED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                              : ctx.status === "PLAN_PENDING"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/30 font-bold animate-pulse"
                              : ctx.status === "ACCEPTED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {ctx.status}
                        </span>
                      </div>
                    </div>

                    {/* Body content based on stage */}
                    {isPendingRaw ? (
                      /* Phase 1: Directrices editable */
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                            {t("validator.ctx_directives_label", "Directrices Proporcionadas por el Usuario (Editable por el Validador):")}
                          </label>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {(editingContextTexts[ctx.id] ?? ctx.context_text).length} {t("contexts.chars_label", "caracteres")}
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          value={editingContextTexts[ctx.id] ?? ctx.context_text}
                          onChange={(e) =>
                            setEditingContextTexts((prev) => ({
                              ...prev,
                              [ctx.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-amber-500 leading-relaxed"
                          placeholder={t("validator.ctx_placeholder", "Texto de directrices...")}
                        />

                        {/* Phase 1 Actions */}
                        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                          <button
                            onClick={() => {
                              setRejectingContextId(ctx.id);
                              setContextRejectionReason("");
                            }}
                            disabled={isLoadingThis}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t("validator.reject_context", "Rechazar Contexto")}
                          </button>

                          <button
                            onClick={() => handleSaveContextText(ctx.id)}
                            disabled={isLoadingThis}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {t("common.save_changes", "Guardar Cambios")}
                          </button>

                          <button
                            onClick={() => handleApproveContextRaw(ctx.id)}
                            disabled={isLoadingThis}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-lg shadow-amber-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isLoadingThis ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Bot className="w-3.5 h-3.5" />
                            )}
                            {t("validator.approve_generate_ctx_plan", "Aprobar y Generar Plan (Gemini)")}
                          </button>
                        </div>
                      </div>
                    ) : isPlanPending ? (
                      /* Phase 2: Context Plan Review */
                      <div className="space-y-4">
                        {/* Base guidelines preview */}
                        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-300">
                          <span className="font-semibold text-indigo-300 block mb-1">
                            {t("validator.base_directives_approved", "Directrices Base Aprobadas:")}
                          </span>
                          <p className="font-mono text-[11px] text-slate-400 whitespace-pre-wrap line-clamp-3">
                            {ctx.edited_text || ctx.context_text}
                          </p>
                        </div>

                        {/* Plan de Contexto generated by Gemini */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                              <Bot className="w-4 h-4" /> {t("validator.ctx_tech_plan_title", "Plan de Contexto Técnico (Gemini)")}
                            </span>
                          </div>

                          <div className="bg-slate-950/90 rounded-xl p-4 border border-purple-500/20 shadow-inner max-h-96 overflow-y-auto">
                            <PlanMarkdownView content={ctx.plan_markdown || ""} />
                          </div>
                        </div>

                        {/* Phase 2 Actions */}
                        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                          <button
                            onClick={() => {
                              const reason = prompt(t("validator.prompt_reject_ctx_plan_reason", "Indica el motivo de rechazo del Plan de Contexto:"));
                              if (reason) handleRejectContextPlanSubmit(ctx.id, reason);
                            }}
                            disabled={isLoadingThis}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t("validator.reject_plan", "Rechazar Plan")}
                          </button>

                          <button
                            onClick={() => handleOpenModifyContextPlan(ctx)}
                            disabled={isLoadingThis}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <FileEdit className="w-3.5 h-3.5" />
                            {t("validator.modify_ctx_plan", "Modificar Plan / Feedback")}
                          </button>

                          <button
                            onClick={() => handleApproveContextPlan(ctx.id)}
                            disabled={isLoadingThis}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isLoadingThis ? (
                              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            {t("validator.accept_definitive_ctx", "✓ Aceptar Contexto Definitivo (ACCEPTED)")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Accepted or Rejected historical card */
                      <div className="space-y-3">
                        {ctx.plan_markdown && (
                          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 max-h-48 overflow-y-auto text-xs font-mono text-slate-300">
                            <PlanMarkdownView content={ctx.plan_markdown} />
                          </div>
                        )}
                        {ctx.rejection_reason && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                            <strong>{t("validator.rejection_reason_label", "Motivo de rechazo:")}</strong> {ctx.rejection_reason}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 pt-1">
                          {ctx.status === "ACCEPTED" ? t("validator.ctx_active_info", "✓ Contexto activo y disponible para prompts de este usuario.") : t("validator.ctx_inactive_info", "Contexto inactivo.")}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: MY VALIDATED REPOSITORIES */}
      {activeSection === "repos" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-emerald-400" />
                {t("validator.repos_title", "Repositorios de GitHub Asignados")}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                {t("validator.repos_desc", "Al acreditarte como validador de un repositorio con tu GitHub Personal Access Token (PAT), los usuarios podrán dirigir prompts hacia él. Serás tú quien valide los cambios y el worker usará tu token para clonar, hacer commit y abrir los Pull Requests correspondientes.")}
              </p>
            </div>
            <button
              onClick={() => setShowAddRepoModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{t("validator.btn_accredit_repo", "Acreditar Nuevo Repositorio")}</span>
            </button>
          </div>

          {reposLoading ? (
            <div className="text-center py-16 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-400">{t("validator.loading_repos", "Cargando repositorios validados...")}</p>
            </div>
          ) : myRepos.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl p-6">
              <FolderGit2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">
                {t("validator.no_repos_title", "No tienes repositorios acreditados aún")}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto mb-4">
                {t("validator.no_repos_desc", "Regístrate como validador de un repositorio de GitHub para empezar a recibir solicitudes de cambio y supervisar los Pull Requests.")}
              </p>
              <button
                onClick={() => setShowAddRepoModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>{t("validator.btn_accredit_repo_now", "Acreditar Repositorio Ahora")}</span>
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
                          <span>{t("validator.repo_active", "Activo")}</span>
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
                          <span>{t("validator.token_registered", "Token PAT Registrado")}</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                      <span>{t("validator.registered_at", `Registrado el ${new Date(repo.created_at).toLocaleDateString()}`, { date: new Date(repo.created_at).toLocaleDateString() })}</span>
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
                        <span>{t("validator.deregister_repo", "Dar de baja")}</span>
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
                {t("validator.modal_accredit_title", "Acreditarse como Validador de Repositorio")}
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
                  {t("validator.modal_repo_url_label", "URL del Repositorio de GitHub *")}
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
                  {t("validator.modal_pat_label", "GitHub Personal Access Token (PAT) *")}
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
                  {t("validator.modal_pat_hint", "El token debe poseer permisos de lectura y escritura en el repositorio (scopes repo o contents:write + pull_requests:write) para abrir los PRs en tu nombre.")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {t("validator.modal_branch_label", "Rama por Defecto")}
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
                    {t("validator.modal_project_name_label", "Nombre del Proyecto (Opcional)")}
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
                  {t("common.cancel", "Cancelar")}
                </button>
                <button
                  type="submit"
                  disabled={submittingRepo || !newRepoForm.repo_url || !newRepoForm.github_token}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submittingRepo ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>{t("validator.modal_submitting", "Acreditando...")}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t("validator.modal_submit", "Acreditarme como Validador")}</span>
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
              {t("validator.reject_prompt_modal_title", `Rechazar Prompt #${rejectingPromptTaskId}`, { id: rejectingPromptTaskId })}
            </h3>
            <p className="text-xs text-slate-400">
              {t("validator.reject_prompt_modal_desc", "Indica la razón por la cual este prompt no puede ser procesado para que el usuario pueda corregirlo.")}
            </p>

            <textarea
              rows={3}
              required
              value={promptRejectionReason}
              onChange={(e) => setPromptRejectionReason(e.target.value)}
              placeholder={t("validator.reject_prompt_placeholder", "Ej: El cambio solicitado es ambiguo o no cumple con las directrices del proyecto.")}
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
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                onClick={handleRejectPromptSubmit}
                disabled={!promptRejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {t("validator.reject_confirm", "Confirmar Rechazo")}
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
              {t("validator.reject_plan_modal_title", `Rechazar Plan Técnico #${rejectingPlanTaskId}`, { id: rejectingPlanTaskId })}
            </h3>
            <p className="text-xs text-slate-400">
              {t("validator.reject_plan_modal_desc", "Indica por qué este plan de implementación no es adecuado (ej: altera archivos que no corresponden, enfoque riesgoso, etc.).")}
            </p>

            <textarea
              rows={3}
              required
              value={planRejectionReason}
              onChange={(e) => setPlanRejectionReason(e.target.value)}
              placeholder={t("validator.reject_plan_placeholder", "Ej: El plan propone modificar la configuración central de autenticación en lugar del componente local.")}
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
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                onClick={handleRejectPlanSubmit}
                disabled={!planRejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {t("validator.reject_plan_confirm", "Confirmar Rechazo del Plan")}
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
                    <span>{t("validator.modify_plan_modal_title_id", `Modificar Plan de Implementación #${modifyingPlanTask.id}`, { id: modifyingPlanTask.id })}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modifyingPlanTask.project_name || t("validator.project_fallback", `Proyecto #${modifyingPlanTask.project_id}`, { id: modifyingPlanTask.project_id })}
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
                  {t("validator.prompt_origin_plan_label", "Prompt Validado que originó este plan:")}
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
                    <span>{t("validator.plan_tech_text_label", "Texto del Plan Técnico (Editable directamente)")}</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {editedPlanText.length} {t("contexts.chars_label", "caracteres")}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {t("validator.plan_tech_text_desc", "Puedes retocar o corregir directamente cualquier sección del plan antes de solicitar la re-generación a Gemini.")}
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
                  <span>{t("validator.modify_plan_prompt_label", "Instrucciones / Prompt de Modificación para Gemini")}</span>
                  <span className="text-rose-400">*</span>
                </label>
                <p className="text-xs text-slate-400">
                  {t("validator.modify_plan_prompt_desc", "Describe detalladamente los cambios requeridos. Gemini recibirá el plan editado junto con estas instrucciones para sintetizar una nueva versión del plan.")}
                </p>
                <textarea
                  rows={3}
                  required
                  value={planModificationPrompt}
                  onChange={(e) => setPlanModificationPrompt(e.target.value)}
                  placeholder={t("validator.modify_plan_prompt_placeholder", "Ej: No modifiques el esquema de la base de datos; utiliza almacenamiento local. Añade tests unitarios para los nuevos endpoints y asegura compatibilidad hacia atrás.")}
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
                {t("common.cancel", "Cancelar")}
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
                    <span>{t("validator.sending_to_gemini", "Enviando a Gemini...")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t("validator.send_gemini_regenerate", "Enviar a Gemini y Regenerar Plan")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Context Directives Modal */}
      {rejectingContextId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-400" />
              {t("validator.reject_context_modal_title", `Rechazar Contexto #${rejectingContextId}`, { id: rejectingContextId })}
            </h3>
            <p className="text-xs text-slate-400">
              {t("validator.reject_context_modal_desc", "Indica al usuario el motivo por el cual se rechazan las directrices de este contexto para que pueda corregirlas.")}
            </p>
            <textarea
              rows={3}
              value={contextRejectionReason}
              onChange={(e) => setContextRejectionReason(e.target.value)}
              placeholder={t("validator.reject_context_placeholder", "Ej: Las directrices contienen credenciales no permitidas o son ambiguas...")}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingContextId(null);
                  setContextRejectionReason("");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                onClick={handleRejectContextSubmit}
                disabled={!contextRejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                {t("validator.reject_confirm", "Confirmar Rechazo")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify Context Plan Modal */}
      {modifyingContextPlan && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  <FileEdit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{t("validator.modify_ctx_plan_title", `Modificar Plan de Contexto #${modifyingContextPlan.id} (${modifyingContextPlan.identifier})`, { id: modifyingContextPlan.id, identifier: modifyingContextPlan.identifier })}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modifyingContextPlan.name} • {t("contexts.version_label", "Versión")} v{modifyingContextPlan.version}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setModifyingContextPlan(null)}
                disabled={submittingContextPlanMod}
                className="text-slate-400 hover:text-slate-200 p-2 rounded-xl hover:bg-slate-800 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
              {/* Directives Preview */}
              <div className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 text-xs">
                <span className="font-semibold text-indigo-400 block mb-1">
                  {t("validator.base_directives_approved", "Directrices Base Aprobadas:")}
                </span>
                <p className="text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {modifyingContextPlan.edited_text || modifyingContextPlan.context_text}
                </p>
              </div>

              {/* 1. Context Plan Text Editor */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-purple-400" />
                    <span>{t("validator.ctx_plan_text_label", "Texto del Plan de Contexto (Editable directamente)")}</span>
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {editedContextPlanText.length} {t("contexts.chars_label", "caracteres")}
                  </span>
                </div>
                <textarea
                  rows={10}
                  value={editedContextPlanText}
                  onChange={(e) => setEditedContextPlanText(e.target.value)}
                  placeholder="# Plan de Contexto Técnico..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-purple-500 transition-all focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* 2. Feedback for Gemini (Optional / Regeneration) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>{t("validator.ctx_plan_feedback_label", "Feedback / Instrucciones para re-generación con Gemini (Opcional)")}</span>
                </label>
                <p className="text-xs text-slate-400">
                  {t("validator.ctx_plan_feedback_desc", "Si deseas que Gemini re-sintetice el plan de contexto, especifica qué cambios o directrices adicionales incorporar. Si se deja vacío, se guardarán los cambios directos editados arriba.")}
                </p>
                <textarea
                  rows={3}
                  value={contextPlanModificationFeedback}
                  onChange={(e) => setContextPlanModificationFeedback(e.target.value)}
                  placeholder={t("validator.ctx_plan_feedback_placeholder", "Ej: Enfatiza la estructura hexagonal en las convenciones de arquitectura y añade reglas estrictas para el tipado de TypeScript...")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModifyingContextPlan(null)}
                disabled={submittingContextPlanMod}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                type="button"
                onClick={handleSubmitModifyContextPlan}
                disabled={submittingContextPlanMod}
                className="px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-600/25 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {submittingContextPlanMod ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("validator.saving_and_processing", "Guardando y procesando...")}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{t("validator.save_apply_changes", "Guardar y Aplicar Cambios")}</span>
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
