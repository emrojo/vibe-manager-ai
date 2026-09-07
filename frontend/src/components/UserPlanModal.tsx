"use client";

import { 
  X, 
  FileCode2, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  GitPullRequest, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FileText
} from "lucide-react";
import { PromptTask } from "@/lib/api";
import { useState } from "react";

interface UserPlanModalProps {
  task: PromptTask | null;
  onClose: () => void;
}

function PlanMarkdownView({ content }: { content: string }) {
  if (!content) {
    return <p className="text-xs text-slate-500 italic">No hay contenido de plan disponible.</p>;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const renderInline = (text: string) => {
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
          <pre key={`code-${i}`} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto my-2 shadow-inner">
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
        <h3 key={`h3-${i}`} className="text-xs font-bold uppercase tracking-wider text-slate-300 mt-3 mb-1">
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

export default function UserPlanModal({ task, onClose }: UserPlanModalProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Plan Técnico de Implementación</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-semibold border border-indigo-500/30">
                  #{task.id}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {task.project_name || `Proyecto #${task.project_id}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Banner */}
          {task.status === "PLAN_PENDING" && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-amber-200">Plan en espera de validación técnica</strong>
                Gemini ha formulado este plan en el sandbox Docker. El equipo validador revisará la propuesta antes de dar luz verde a los cambios de código.
              </div>
            </div>
          )}

          {task.status === "PLAN_APPROVED" && (
            <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300 flex items-start gap-2.5">
              <CheckCircle className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-teal-200">Plan técnico aprobado</strong>
                El plan ha sido validado{task.plan_validator_name ? ` por ${task.plan_validator_name}` : ""} y se encuentra encolado para su aplicación en el contenedor Docker.
              </div>
            </div>
          )}

          {task.status === "RUNNING" && (
            <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300 flex items-start gap-2.5">
              <span className="w-3.5 h-3.5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin shrink-0 mt-0.5" />
              <div>
                <strong className="block font-semibold text-indigo-200">Ejecución en curso</strong>
                El sandbox Docker está aplicando las modificaciones en el código siguiendo este plan técnico.
              </div>
            </div>
          )}

          {task.status === "COMPLETED" && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Plan ejecutado exitosamente.</strong> Los cambios han sido comiteados y se ha abierto un Pull Request.
                </span>
              </div>
              {task.pr_url && (
                <a
                  href={task.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium flex items-center gap-1 shrink-0 transition-all"
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>Ver PR en GitHub</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {task.plan_rejection_reason && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-1">
              <strong className="block font-semibold text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Motivo del rechazo del plan:
              </strong>
              <p className="font-mono">{task.plan_rejection_reason}</p>
            </div>
          )}

          {/* Collapsible Prompt Info */}
          <div className="bg-slate-950/70 rounded-xl border border-slate-800 p-3 text-xs">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="w-full flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="font-semibold flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Prompt original que generó este plan</span>
              </span>
              {showPrompt ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showPrompt && (
              <div className="mt-2 pt-2 border-t border-slate-800 font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                {task.edited_prompt || task.original_prompt}
              </div>
            )}
          </div>

          {/* Plan Content */}
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-2">
            <div className="text-[11px] uppercase tracking-wider font-bold text-slate-400 pb-2 border-b border-slate-800/80">
              Estrategia y Pasos Técnicos Propuestos
            </div>
            <PlanMarkdownView content={task.plan_content || ""} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {task.plan_validated_at 
              ? `Validado el ${new Date(task.plan_validated_at).toLocaleString()}`
              : `Creado el ${new Date(task.created_at).toLocaleString()}`}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
