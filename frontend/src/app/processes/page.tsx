"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api";
import LiveConsoleModal from "@/components/LiveConsoleModal";
import { 
  Activity, 
  Terminal, 
  RefreshCw, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  GitPullRequest, 
  ExternalLink,
  Layers,
  Server
} from "lucide-react";

interface ProcessItem {
  id: number;
  project_id: number;
  project_name: string;
  user_id: number;
  user_name: string;
  original_prompt: string;
  edited_prompt?: string;
  status: "PENDING" | "APPROVED" | "RUNNING" | "COMPLETED" | "FAILED" | "REJECTED";
  stage?: string;
  duration_seconds: number;
  error_message?: string;
  branch_name?: string;
  pr_url?: string;
  pr_number?: number;
  created_at: string;
  updated_at: string;
}

export default function ProcessesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [runningCount, setRunningCount] = useState<number>(0);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<"ALL" | "RUNNING" | "COMPLETED" | "FAILED">("ALL");
  const [selectedTask, setSelectedTask] = useState<ProcessItem | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  const loadProcesses = async (showLoading = false) => {
    if (!user) return;
    if (showLoading) setLoading(true);
    try {
      const data = await apiRequest<{ running_count: number; pending_count: number; processes: ProcessItem[] }>("/processes/active");
      setProcesses(data.processes);
      setRunningCount(data.running_count);
      setPendingCount(data.pending_count);
    } catch (err) {
      console.error("Error cargando procesos:", err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadProcesses(true);
      // Auto-poll every 3.5 seconds
      const interval = setInterval(() => loadProcesses(false), 3500);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Local ticker for live running elapsed seconds
  useEffect(() => {
    const ticker = setInterval(() => {
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.status === "RUNNING") {
            return { ...p, duration_seconds: (p.duration_seconds || 0) + 1 };
          }
          return p;
        })
      );
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const filteredProcesses = processes.filter((p) => {
    if (filterTab === "RUNNING") return p.status === "RUNNING";
    if (filterTab === "COMPLETED") return p.status === "COMPLETED";
    if (filterTab === "FAILED") return p.status === "FAILED";
    return true;
  });

  if (authLoading || !user) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Activity className="w-7 h-7 text-indigo-400" />
            Monitor de Procesos en Tiempo Real
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Supervisa el estado, las etapas de ejecución y accede a la consola en vivo de los sandbox Docker.
          </p>
        </div>

        <button
          onClick={() => loadProcesses(true)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-medium text-slate-300 transition-all shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refrescar</span>
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Server className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
              En Ejecución
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xl font-black text-white">{runningCount}</span>
              {runningCount > 0 && (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
              En Cola / Pendientes
            </span>
            <span className="text-2xl font-black text-white mt-0.5 block">{pendingCount}</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
              Completadas Recientes
            </span>
            <span className="text-2xl font-black text-white mt-0.5 block">
              {processes.filter((p) => p.status === "COMPLETED").length}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider block">
              Fallidas / Con Error
            </span>
            <span className="text-2xl font-black text-white mt-0.5 block">
              {processes.filter((p) => p.status === "FAILED").length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: "ALL", label: "Todos los Procesos" },
          { id: "RUNNING", label: `En Ejecución (${runningCount})` },
          { id: "COMPLETED", label: "Completados" },
          { id: "FAILED", label: "Con Error" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterTab(tab.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              filterTab === tab.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Process List */}
      {filteredProcesses.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl space-y-2">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">
            No hay procesos en esta categoría ({filterTab})
          </h3>
          <p className="text-xs text-slate-500">
            Los procesos se registrarán automáticamente cuando las tareas aprobadas entren al runner sandbox.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProcesses.map((proc) => {
            const isRunning = proc.status === "RUNNING";
            const isFailed = proc.status === "FAILED";
            const isCompleted = proc.status === "COMPLETED";

            return (
              <div
                key={proc.id}
                className={`bg-slate-900 border rounded-2xl p-5 shadow-xl transition-all ${
                  isRunning
                    ? "border-indigo-500/40 ring-1 ring-indigo-500/20"
                    : isFailed
                    ? "border-rose-500/30"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs px-2.5 py-0.5 rounded-md bg-slate-950 text-indigo-400 font-bold border border-indigo-500/20">
                        #{proc.id}
                      </span>
                      <h3 className="font-bold text-white text-base">
                        {proc.project_name}
                      </h3>
                      <span className="text-xs text-slate-400">
                        por <strong className="text-slate-300">{proc.user_name}</strong>
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-mono line-clamp-1 max-w-2xl mt-1">
                      {proc.edited_prompt || proc.original_prompt}
                    </p>
                  </div>

                  {/* Status & Timer */}
                  <div className="flex items-center gap-3">
                    {isRunning && (
                      <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-mono">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        <span>{formatSeconds(proc.duration_seconds || 0)}</span>
                      </div>
                    )}

                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider ${
                        isRunning
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                          : isCompleted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : isFailed
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {proc.status}
                    </span>
                  </div>
                </div>

                {/* Stage Info */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Etapa:</span>
                    <span className="text-slate-300 font-mono bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800">
                      {proc.stage || (isRunning ? "Ejecutando sandbox..." : proc.status)}
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    {proc.pr_url && (
                      <a
                        href={proc.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <GitPullRequest className="w-3.5 h-3.5" />
                        <span>PR #{proc.pr_number || "Ver"}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}

                    <button
                      onClick={() => setSelectedTask(proc)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isRunning
                          ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{isRunning ? "Ver Consola en Vivo" : "Ver Consola"}</span>
                    </button>
                  </div>
                </div>

                {/* Prominent Error Banner if Failed */}
                {isFailed && (
                  <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl text-xs text-rose-300 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <strong className="text-rose-400 font-semibold block">
                        Causa del Error de Ejecución:
                      </strong>
                      <p className="font-mono whitespace-pre-wrap leading-relaxed">
                        {proc.error_message || "Fallo en el contenedor del runner sin detalles adicionales."}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Live Console Modal */}
      {selectedTask && (
        <LiveConsoleModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
