"use client";

import { useState, useEffect } from "react";
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
  Layers 
} from "lucide-react";

export default function ValidatorPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tasks, setTasks] = useState<PromptTask[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(false);

  // Editing state: map task id to edited prompt string
  const [editingPrompts, setEditingPrompts] = useState<Record<number, string>>({});
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
      const url = filterStatus === "ALL" 
        ? "/validation/tasks" 
        : `/validation/tasks?status_filter=${filterStatus}`;
      const data = await apiRequest<PromptTask[]>(url);
      setTasks(data);

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
  }, [user, filterStatus]);

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

  const handleApprove = async (taskId: number) => {
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
        text: `¡Tarea #${taskId} aprobada! Ha entrado en la cola de ejecución en contenedor Docker.`,
      });
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al aprobar la tarea" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectingTaskId || !rejectionReason.trim()) return;
    setActionLoading(rejectingTaskId);
    try {
      await apiRequest(`/validation/tasks/${rejectingTaskId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: rejectionReason.trim() }),
      });
      setFeedback({ type: "success", text: `Tarea #${rejectingTaskId} rechazada.` });
      setRejectingTaskId(null);
      setRejectionReason("");
      await loadTasks();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al rechazar" });
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
          Mesa de Validación de Prompts
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Revisa las solicitudes de los usuarios, realiza ajustes y mejoras al prompt antes de enviarlo a la cola de ejecución automatizada en Docker.
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
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          {[
            { id: "PENDING", label: "Pendientes" },
            { id: "APPROVED", label: "Aprobados" },
            { id: "RUNNING", label: "En Docker" },
            { id: "COMPLETED", label: "Completados / PR" },
            { id: "REJECTED", label: "Rechazados" },
            { id: "ALL", label: "Todos" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterStatus(tab.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filterStatus === tab.id
                  ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                  : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          onClick={loadTasks}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Tasks List */}
      {tasks.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
          <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">
            No hay prompts en esta sección ({filterStatus})
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Los prompts nuevos enviados por los usuarios aparecerán aquí para tu revisión.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {tasks.map((task) => {
            const isPending = task.status === "PENDING";
            const isLoadingThis = actionLoading === task.id;

            return (
              <div
                key={task.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 transition-all"
              >
                {/* Task Top Meta */}
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
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Prompt Original del Usuario:
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {task.original_prompt}
                    </p>
                  </div>

                  {/* Validator Modified Prompt */}
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Edit3 className="w-3.5 h-3.5" />
                        Prompt a Ejecutar por la IA (Editable):
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

                {/* PR or Rejection info */}
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

                {task.rejection_reason && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300">
                    <strong className="block text-rose-400 mb-0.5">Motivo del Rechazo:</strong>
                    {task.rejection_reason}
                  </div>
                )}

                {/* Actions */}
                {isPending && (
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={() => setRejectingTaskId(task.id)}
                      disabled={isLoadingThis}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 text-slate-300 text-xs font-semibold border border-slate-700 hover:border-rose-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rechazar</span>
                    </button>

                    <button
                      onClick={() => handleApprove(task.id)}
                      disabled={isLoadingThis}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isLoadingThis ? (
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>Aceptar y Encolar a Docker</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectingTaskId && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-400" />
              Rechazar Solicitud #{rejectingTaskId}
            </h3>
            <p className="text-xs text-slate-400">
              Indica la razón por la cual este prompt no puede ser procesado para que el usuario pueda corregirlo.
            </p>

            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ej: El cambio solicitado no cumple con los lineamientos de diseño o falta detalle."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRejectingTaskId(null);
                  setRejectionReason("");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectionReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium disabled:opacity-50"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
