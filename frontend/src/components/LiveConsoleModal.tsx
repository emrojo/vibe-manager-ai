"use client";

import { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  X, 
  Copy, 
  Check, 
  Download, 
  ArrowDown, 
  AlertCircle, 
  GitPullRequest, 
  ExternalLink,
  RefreshCw,
  Wifi,
  WifiOff
} from "lucide-react";

interface LiveConsoleModalProps {
  task: {
    id: number;
    project_name?: string;
    status?: string;
    execution_stage?: string;
    error_message?: string;
    execution_logs?: string;
    pr_url?: string;
    branch_name?: string;
    commit_message?: string;
  } | null;
  onClose: () => void;
}

export default function LiveConsoleModal({ task, onClose }: LiveConsoleModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<string>(task?.status || "PENDING");
  const [stage, setStage] = useState<string>(task?.execution_stage || "Inicializando...");
  const [errorMessage, setErrorMessage] = useState<string | null>(task?.error_message || null);
  const [prUrl, setPrUrl] = useState<string | null>(task?.pr_url || null);
  const [connected, setConnected] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!task) return;

    setStatus(task.status || "PENDING");
    setStage(task.execution_stage || "Inicializando...");
    setErrorMessage(task.error_message || null);
    setPrUrl(task.pr_url || null);

    // Initial logs from task if present
    if (task.execution_logs) {
      setLogs(task.execution_logs.split("\n"));
    } else {
      setLogs([]);
    }

    // Determine WebSocket URL
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const wsProto = isHttps ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost";
    
    // Connect to WebSocket console
    let wsUrl = `${wsProto}//${host}/api/processes/${task.id}/console`;
    // If in dev direct to backend 3010 / 8000
    if (host.includes(":3010")) {
      wsUrl = `${wsProto}//${window.location.hostname}:8000/api/processes/${task.id}/console`;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "init") {
          setStatus(msg.status || "RUNNING");
          if (msg.stage) setStage(msg.stage);
          if (msg.error_message) setErrorMessage(msg.error_message);
          if (msg.pr_url) setPrUrl(msg.pr_url);
          if (msg.history && Array.isArray(msg.history)) {
            setLogs(msg.history);
          }
        } else if (msg.type === "log") {
          setLogs((prev) => [...prev, msg.line]);
        } else if (msg.type === "stage") {
          setStage(msg.stage);
        } else if (msg.type === "finish") {
          setStatus(msg.status);
          if (msg.error) setErrorMessage(msg.error);
          if (msg.result?.pr_url) setPrUrl(msg.result.pr_url);
          if (msg.result?.logs) {
            setLogs(msg.result.logs.split("\n"));
          }
        }
      } catch (err) {
        console.error("Error parseando mensaje WebSocket console:", err);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = (err) => {
      console.warn("WebSocket console aviso:", err);
      setConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [task]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleCopyLogs = () => {
    const text = logs.join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = logs.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vibe-task-${task?.id}-console.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!task) return null;

  const isRunning = status === "RUNNING";
  const isFailed = status === "FAILED";
  const isCompleted = status === "COMPLETED";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full flex flex-col max-h-[92vh] shadow-2xl overflow-hidden">
        
        {/* Terminal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Terminal className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm">
                  Consola de Ejecución — Tarea #{task.id}
                </span>
                <span className="text-xs text-slate-400">
                  ({task.project_name || "Proyecto"})
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {/* Live connection indicator */}
                {isRunning ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    En Vivo {connected ? "(WebSocket conectado)" : "(Conectando...)"}
                  </span>
                ) : isCompleted ? (
                  <span className="text-[11px] text-emerald-400 font-medium">
                    ✓ Ejecución Exitosa
                  </span>
                ) : isFailed ? (
                  <span className="text-[11px] text-rose-400 font-medium">
                    ✕ Falló la Ejecución
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    {status}
                  </span>
                )}

                {/* Stage badge */}
                {stage && (
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                    {stage}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? "Autodesplazamiento activo" : "Activar autodesplazamiento"}
              className={`p-2 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
                autoScroll 
                  ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-300" 
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            <button
              onClick={handleCopyLogs}
              title="Copiar registros"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
            </button>

            <button
              onClick={handleDownloadLogs}
              title="Descargar archivo de logs"
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Descargar</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Prominent Error Banner */}
        {isFailed && (
          <div className="mx-4 mt-4 p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start gap-3 text-rose-200 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <strong className="text-rose-300 text-sm font-semibold block">
                Causa del Error de Ejecución:
              </strong>
              <p className="font-mono whitespace-pre-wrap leading-relaxed">
                {errorMessage || "El sandbox finalizó de forma inesperada sin emitir código de éxito."}
              </p>
            </div>
          </div>
        )}

        {/* PR Created Banner */}
        {prUrl && (
          <div className="mx-4 mt-4 p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-3 text-emerald-200 animate-in fade-in">
            <div className="flex items-center gap-2 text-xs">
              <GitPullRequest className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>
                <strong>Pull Request Creado en GitHub:</strong> {prUrl}
              </span>
            </div>
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-lg shadow-emerald-600/20"
            >
              <span>Ver PR</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Terminal Body */}
        <div className="flex-1 p-4 bg-black/95 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 min-h-[360px] max-h-[550px] select-text">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 space-y-2">
              {isRunning ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <p>Iniciando contenedor sandbox y conectando terminal...</p>
                </>
              ) : (
                <p>Sin registros disponibles para esta tarea.</p>
              )}
            </div>
          ) : (
            logs.map((line, idx) => {
              const lower = line.toLowerCase();
              const isErr = lower.includes("error") || lower.includes("fatal:") || lower.includes("traceback");
              const isWarn = lower.includes("aviso:") || lower.includes("warning");
              const isSuccess = lower.includes("éxito") || lower.includes("exitosamente") || lower.includes("creado exitosamente");
              const isCommand = line.startsWith("[VIBE-RUNNER] Executing:") || line.startsWith("Comando:");

              return (
                <div key={idx} className="flex items-start gap-3 leading-relaxed hover:bg-white/5 px-1 py-0.5 rounded">
                  <span className="text-slate-600 select-none text-[11px] w-8 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <span
                    className={`break-all whitespace-pre-wrap ${
                      isErr
                        ? "text-rose-400 font-semibold"
                        : isWarn
                        ? "text-amber-300"
                        : isSuccess
                        ? "text-emerald-400 font-semibold"
                        : isCommand
                        ? "text-sky-300"
                        : "text-slate-300"
                    }`}
                  >
                    {line}
                  </span>
                </div>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </div>

        {/* Terminal Footer */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-2">
            <span>{logs.length} líneas</span>
            <span>•</span>
            <span className="font-mono">UTF-8</span>
          </div>

          <div>
            <span>Vibe Manager Sandbox Engine</span>
          </div>
        </div>

      </div>
    </div>
  );
}
