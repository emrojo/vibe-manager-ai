"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, PromptTask } from "@/lib/api";
import { 
  GitPullRequest, 
  ExternalLink, 
  FolderGit2, 
  Terminal, 
  Clock, 
  Search, 
  RefreshCw, 
  Sparkles, 
  GitBranch, 
  CheckCircle2, 
  UserCheck, 
  ArrowRight,
  Copy,
  Check
} from "lucide-react";

export default function PullRequestsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [pullRequests, setPullRequests] = useState<PromptTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("ALL");
  const [selectedLogsTask, setSelectedLogsTask] = useState<PromptTask | null>(null);
  const [copiedBranchId, setCopiedBranchId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadPullRequests = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const data = await apiRequest<PromptTask[]>("/prompts/prs");
      setPullRequests(data);
    } catch (err) {
      console.error("Error al cargar pull requests:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadPullRequests();
      const interval = setInterval(loadPullRequests, 10000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleCopyBranch = (branchName: string, id: number) => {
    navigator.clipboard.writeText(branchName);
    setCopiedBranchId(id);
    setTimeout(() => setCopiedBranchId(null), 2000);
  };

  if (authLoading || !user) return null;

  // Extract unique projects
  const uniqueProjects = Array.from(
    new Set(pullRequests.map((pr) => pr.project_name || `Proyecto #${pr.project_id}`))
  );

  const filteredPRs = pullRequests.filter((pr) => {
    const matchesProject =
      selectedProject === "ALL" ||
      (pr.project_name || `Proyecto #${pr.project_id}`) === selectedProject;

    const query = searchTerm.toLowerCase();
    const matchesSearch =
      (pr.commit_message || "").toLowerCase().includes(query) ||
      (pr.original_prompt || "").toLowerCase().includes(query) ||
      (pr.edited_prompt || "").toLowerCase().includes(query) ||
      (pr.branch_name || "").toLowerCase().includes(query) ||
      (pr.project_name || "").toLowerCase().includes(query) ||
      (pr.pr_url || "").toLowerCase().includes(query);

    return matchesProject && matchesSearch;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <GitPullRequest className="w-7 h-7 text-emerald-400" />
            Mis Pull Requests en GitHub
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Revisa todos los Pull Requests generados automáticamente a partir de tus prompts validados y ejecutados en Docker.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Crear Nuevo Prompt</span>
          </Link>

          <button
            onClick={loadPullRequests}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-lg">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por commit, rama o contenido del prompt..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Project Selector */}
        {uniqueProjects.length > 0 && (
          <div className="w-full sm:w-64">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Todos los Proyectos ({pullRequests.length})</option>
              {uniqueProjects.map((pName) => (
                <option key={pName} value={pName}>
                  {pName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* PRs Grid / List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500" />
        </div>
      ) : filteredPRs.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl space-y-3">
          <GitPullRequest className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">
            {pullRequests.length === 0
              ? "Aún no tienes Pull Requests creados."
              : "No se encontraron Pull Requests con los filtros aplicados."}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {pullRequests.length === 0
              ? "Cuando un Validador apruebe uno de tus prompts, el agente de IA en Docker generará automáticamente una rama y un Pull Request en GitHub que aparecerá aquí."
              : "Prueba a cambiar el término de búsqueda o selecciona 'Todos los Proyectos'."}
          </p>
          {pullRequests.length === 0 && (
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 mt-2"
            >
              <span>Ir al Workspace de Prompts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredPRs.map((task) => (
            <div
              key={task.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 hover:border-slate-700 transition-all relative overflow-hidden"
            >
              {/* Header with Project & PR Button */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-slate-200 text-sm">
                      {task.project_name || `Proyecto #${task.project_id}`}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      • Tarea #{task.id}
                    </span>
                  </div>

                  {task.commit_message && (
                    <p className="text-xs font-mono font-semibold text-emerald-400">
                      {task.commit_message}
                    </p>
                  )}
                </div>

                {/* Direct GitHub PR Link */}
                {task.pr_url && (
                  <a
                    href={task.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md group"
                  >
                    <GitPullRequest className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span>Abrir PR en GitHub #{task.pr_number || ""}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  </a>
                )}
              </div>

              {/* Branch and Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {task.branch_name && (
                  <div className="flex items-center justify-between bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800/80 font-mono">
                    <div className="flex items-center gap-2 truncate">
                      <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="text-slate-400">Rama:</span>
                      <span className="text-indigo-300 truncate">{task.branch_name}</span>
                    </div>
                    <button
                      onClick={() => handleCopyBranch(task.branch_name!, task.id)}
                      className="text-slate-500 hover:text-slate-300 ml-2"
                      title="Copiar nombre de rama"
                    >
                      {copiedBranchId === task.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800/80 text-slate-400">
                  <UserCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Validado por:</span>
                  <strong className="text-slate-200">
                    {task.validator_name || "Validador Autorizado"}
                  </strong>
                  <span className="text-[11px] text-slate-500 ml-auto">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Prompt Box */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/60 space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Prompt que originó el cambio:
                </span>
                <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {task.edited_prompt ? task.edited_prompt : task.original_prompt}
                </p>
                {task.edited_prompt && (
                  <span className="text-[10px] text-amber-400/90 block italic">
                    (Refinado y optimizado técnicamente por el Validador)
                  </span>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Completado en Docker
                  </span>
                </div>

                {task.execution_logs && (
                  <button
                    onClick={() => setSelectedLogsTask(task)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                  >
                    <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ver Logs de Ejecución</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Execution Logs Modal */}
      {selectedLogsTask && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">
                  Logs de Ejecución Sandbox — Tarea #{selectedLogsTask.id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLogsTask(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {selectedLogsTask.pr_url && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs flex items-center justify-between">
                <span className="text-emerald-300 font-medium truncate">
                  PR: {selectedLogsTask.pr_url}
                </span>
                <a
                  href={selectedLogsTask.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-1 shrink-0 ml-2"
                >
                  <span>Abrir</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <pre className="bg-black/90 text-emerald-300 font-mono text-xs p-4 rounded-xl max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
              {selectedLogsTask.execution_logs || "Sin registros de ejecución."}
            </pre>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedLogsTask(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
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
