"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, Project, PromptTask } from "@/lib/api";
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
  Square
} from "lucide-react";
import LiveConsoleModal from "@/components/LiveConsoleModal";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | "">("");
  const [promptText, setPromptText] = useState("");
  const [myPrompts, setMyPrompts] = useState<PromptTask[]>([]);
  
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskLogs, setSelectedTaskLogs] = useState<PromptTask | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadProjects = async () => {
    try {
      const projs = await apiRequest<Project[]>("/projects");
      setProjects(projs);
      setSelectedProjectId((prev) => {
        if (prev !== "" && projs.some((p) => p.id === prev)) {
          return prev;
        }
        return projs.length > 0 ? projs[0].id : "";
      });
    } catch (err: any) {
      console.error("Error cargando proyectos:", err);
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
      await Promise.all([loadProjects(), loadPrompts()]);
    } catch (err: any) {
      console.error("Error cargando datos:", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
      const interval = setInterval(loadPrompts, 10000); // Polling only prompts every 10s
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !promptText.trim()) return;

    setSubmitting(true);
    setMessage(null);

    try {
      await apiRequest<PromptTask>("/prompts", {
        method: "POST",
        body: JSON.stringify({
          project_id: Number(selectedProjectId),
          prompt: promptText.trim(),
        }),
      });

      setMessage({
        type: "success",
        text: "¡Prompt enviado con éxito! Ha quedado en la cola de revisión para los validadores.",
      });
      setPromptText("");
      await loadData();
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err.message || "Error al enviar el prompt.",
      });
    } finally {
      setSubmitting(false);
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

  const selectedProject = projects.find((p) => p.id === Number(selectedProjectId));

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

          {/* Project Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              1. Selecciona el Proyecto Web Objetivo
            </label>
            {projects.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-sm">
                No hay proyectos configurados en este momento. Solicita al Administrador que agregue un repositorio.
              </div>
            ) : (
              <div className="relative">
                <FolderGit2 className="w-5 h-5 text-indigo-400 absolute left-3.5 top-3.5 pointer-events-none" />
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-11 pr-10 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                      {p.name} ({p.repo_url})
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

            {selectedProject && (
              <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
                <span className="text-indigo-400 font-mono">Rama: {selectedProject.default_branch}</span>
                {selectedProject.description && <span>• {selectedProject.description}</span>}
              </div>
            )}
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
              disabled={submitting || projects.length === 0 || !promptText.trim()}
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              Historial de mis Prompts
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Estado en tiempo real de las solicitudes enviadas
            </p>
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

        {myPrompts.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">Aún no has enviado ningún prompt.</p>
            <p className="text-xs text-slate-500 mt-1">Escribe tu primera solicitud en el formulario de arriba.</p>
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
                {myPrompts.map((task) => (
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Live Console Modal */}
      {selectedTaskLogs && (
        <LiveConsoleModal
          task={selectedTaskLogs}
          onClose={() => setSelectedTaskLogs(null)}
        />
      )}
    </div>
  );
}
