"use client";

import React from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { 
  Sparkles, 
  Send, 
  FileCode2, 
  GitPullRequest, 
  CheckSquare, 
  CheckCircle2, 
  Clock, 
  RefreshCw, 
  Boxes, 
  ArrowRight,
  ShieldCheck,
  Cpu,
  Bot,
  ChevronRight
} from "lucide-react";

export interface WorkflowStep {
  key: string;
  number: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeCount?: number;
  badgeVariant?: "indigo" | "amber" | "purple" | "emerald";
  href?: string;
}

interface WorkflowGuideProps {
  flowType: "prompts" | "contexts";
  isValidator: boolean;
  activeFilterStep?: string;
  onFilterStep?: (stepKey: string) => void;
  counts?: {
    pendingPrompts?: number;
    pendingPlans?: number;
    running?: number;
    completedPRs?: number;
    pendingContexts?: number;
    pendingCtxPlans?: number;
    acceptedContexts?: number;
  };
}

export default function WorkflowGuide({
  flowType,
  isValidator,
  activeFilterStep,
  onFilterStep,
  counts = {},
}: WorkflowGuideProps) {
  const { t } = useI18n();

  const getSteps = (): WorkflowStep[] => {
    if (flowType === "prompts") {
      if (!isValidator) {
        // Standard User (3 Steps)
        return [
          {
            key: "create",
            number: 1,
            title: t("workflow.step_prompt_create", "1. Creación de Prompt"),
            description: t("workflow.step_prompt_create_desc", "Redacta tu instrucción y selecciona el repositorio"),
            icon: Send,
          },
          {
            key: "plan",
            number: 2,
            title: t("workflow.step_prompt_view_plan", "2. Plan de Trabajo Intermedio"),
            description: t("workflow.step_prompt_view_plan_desc", "Visualiza el plan generado y su estado de ejecución"),
            icon: FileCode2,
            badgeCount: (counts.pendingPlans || 0) + (counts.running || 0),
            badgeVariant: "purple",
          },
          {
            key: "prs",
            number: 3,
            title: t("workflow.step_prompt_prs", "3. Pull Request Generado"),
            description: t("workflow.step_prompt_prs_desc", "Revisa el código final y ramas en GitHub"),
            icon: GitPullRequest,
            badgeCount: counts.completedPRs,
            badgeVariant: "emerald",
            href: "/pull-requests",
          },
        ];
      } else {
        // Validator (4 Steps)
        return [
          {
            key: "create",
            number: 1,
            title: t("workflow.step_val_create", "1. Creación de Prompt"),
            description: t("workflow.step_val_create_desc", "Envío de instrucción o propuesta"),
            icon: Send,
          },
          {
            key: "validate_prompt",
            number: 2,
            title: t("workflow.step_val_validate_prompt", "2. Validación de Prompt"),
            description: t("workflow.step_val_validate_prompt_desc", "Revisa, edita y autoriza el prompt entrante"),
            icon: CheckSquare,
            badgeCount: counts.pendingPrompts,
            badgeVariant: "amber",
            href: "/validator?section=prompts",
          },
          {
            key: "validate_plan",
            number: 3,
            title: t("workflow.step_val_validate_plan", "3. Validación de Plan"),
            description: t("workflow.step_val_validate_plan_desc", "Aprueba el plan técnico generado por Gemini"),
            icon: FileCode2,
            badgeCount: counts.pendingPlans,
            badgeVariant: "purple",
            href: "/validator?section=plans",
          },
          {
            key: "prs",
            number: 4,
            title: t("workflow.step_val_prs", "4. Pull Requests"),
            description: t("workflow.step_val_prs_desc", "Seguimiento de ramas y PRs creados"),
            icon: GitPullRequest,
            badgeCount: counts.completedPRs,
            badgeVariant: "emerald",
            href: "/pull-requests",
          },
        ];
      }
    } else {
      // flowType === "contexts"
      if (!isValidator) {
        // Standard User (3 Steps)
        return [
          {
            key: "initial",
            number: 1,
            title: t("workflow.step_ctx_initial", "1. Texto Inicial"),
            description: t("workflow.step_ctx_initial_desc", "Directivas y reglas de arquitectura"),
            icon: Boxes,
            badgeCount: counts.pendingContexts,
            badgeVariant: "amber",
          },
          {
            key: "plan",
            number: 2,
            title: t("workflow.step_ctx_view_plan", "2. Plan de Contexto (Gemini)"),
            description: t("workflow.step_ctx_view_plan_desc", "Plan técnico estructurado por la IA"),
            icon: Bot,
            badgeCount: counts.pendingCtxPlans,
            badgeVariant: "purple",
          },
          {
            key: "accepted",
            number: 3,
            title: t("workflow.step_ctx_accepted", "3. Aceptación y Uso"),
            description: t("workflow.step_ctx_accepted_desc", "Contexto activo para inyectar en prompts"),
            icon: CheckCircle2,
            badgeCount: counts.acceptedContexts,
            badgeVariant: "emerald",
          },
        ];
      } else {
        // Validator (4 Steps)
        return [
          {
            key: "initial",
            number: 1,
            title: t("workflow.step_ctx_initial", "1. Texto Inicial"),
            description: t("workflow.step_ctx_initial_desc", "Directivas y reglas de arquitectura"),
            icon: Boxes,
          },
          {
            key: "validate_text",
            number: 2,
            title: t("workflow.step_ctx_val_text", "2. Validación de Directivas"),
            description: t("workflow.step_ctx_val_text_desc", "Revisar y aprobar reglas iniciales"),
            icon: CheckSquare,
            badgeCount: counts.pendingContexts,
            badgeVariant: "amber",
            href: "/validator?section=contexts",
          },
          {
            key: "validate_plan",
            number: 3,
            title: t("workflow.step_ctx_val_plan", "3. Validación de Plan"),
            description: t("workflow.step_ctx_val_plan_desc", "Revisar y aprobar plan técnico"),
            icon: FileCode2,
            badgeCount: counts.pendingCtxPlans,
            badgeVariant: "purple",
            href: "/validator?section=contexts",
          },
          {
            key: "accepted",
            number: 4,
            title: t("workflow.step_ctx_val_accepted", "4. Aceptación y Activación"),
            description: t("workflow.step_ctx_val_accepted_desc", "Aprobado para producción y caché"),
            icon: CheckCircle2,
            badgeCount: counts.acceptedContexts,
            badgeVariant: "emerald",
          },
        ];
      }
    }
  };

  const steps = getSteps();

  const title =
    flowType === "prompts"
      ? t("workflow.prompts_workflow_title", "Flujo de Trabajo: Prompt a Pull Request")
      : t("workflow.contexts_workflow_title", "Flujo de Trabajo: Contextos Técnicos");

  const subtitle =
    flowType === "prompts"
      ? isValidator
        ? t("workflow.prompts_workflow_validator_subtitle", "Supervisa y aprueba cada etapa técnica del pipeline de desarrollo con IA")
        : t("workflow.prompts_workflow_user_subtitle", "Sigue el ciclo de vida guiado de tus cambios desde la redacción hasta el Pull Request")
      : isValidator
      ? t("workflow.contexts_workflow_validator_subtitle", "Revisa directivas, aprueba el plan técnico y activa contextos para el equipo")
      : t("workflow.contexts_workflow_user_subtitle", "Define tus directivas, supervisa el plan de arquitectura de Gemini y úsalo en tus prompts");

  return (
    <nav
      aria-label="Workflow Breadcrumb"
      className="relative z-20 flex flex-wrap items-center justify-between gap-2 p-1.5 sm:p-2 bg-slate-900/90 border border-slate-800 rounded-xl shadow-md backdrop-blur-sm"
    >
      {/* Breadcrumb Steps List */}
      <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {/* Flow Tag */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-semibold text-slate-300 shrink-0">
          {isValidator ? (
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          )}
          <span className="hidden sm:inline font-medium">{title}</span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
              isValidator
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
            }`}
          >
            {isValidator ? t("navbar.role_validator", "Validador") : t("navbar.role_user", "Usuario")}
          </span>
        </div>

        <span className="text-slate-600 select-none">/</span>

        {/* Steps */}
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isSelected = activeFilterStep === step.key;

          const stepElement = (
            <div
              className={`relative group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer select-none ${
                isSelected
                  ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-400 font-semibold"
                  : "bg-slate-950/60 hover:bg-slate-800/80 text-slate-300 hover:text-white border border-slate-800/80"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold font-mono ${
                  isSelected ? "bg-white/20 text-white" : "bg-slate-800 text-slate-300"
                }`}
              >
                {step.number}
              </span>
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{step.title.replace(/^\d+\.\s*/, "")}</span>

              {step.badgeCount !== undefined && step.badgeCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                    isSelected
                      ? "bg-white text-indigo-700"
                      : step.badgeVariant === "amber"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : step.badgeVariant === "purple"
                      ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                      : step.badgeVariant === "emerald"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                  }`}
                >
                  {step.badgeCount}
                </span>
              )}

              {/* Floating Tooltip */}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover:flex flex-col items-center pointer-events-none z-50 transition-all duration-150 animate-fadeIn">
                {/* Arrow pointing up */}
                <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 border-l border-t border-slate-700 -mb-1.5 z-10" />
                <div className="bg-slate-900/95 border border-slate-700 text-slate-200 text-xs rounded-xl py-2.5 px-3.5 shadow-2xl w-64 max-w-xs text-left backdrop-blur-md">
                  <div className="flex items-center gap-2 font-bold text-white mb-1.5">
                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shrink-0 font-mono">
                      {step.number}
                    </span>
                    <span className="text-xs">{step.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                    {step.description}
                  </p>
                  {step.badgeCount !== undefined && step.badgeCount > 0 && (
                    <div className="mt-2 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10px] text-amber-300 font-medium">
                      <span>{t("workflow.pending_badge", { count: step.badgeCount })}</span>
                      <span className="text-slate-400">Clic para filtrar</span>
                    </div>
                  )}
                  {step.href && (
                    <div className="mt-1.5 pt-1 border-t border-slate-800/80 text-[10px] text-indigo-300 flex items-center justify-between">
                      <span>Ir a la sección</span>
                      <span>→</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );

          return (
            <React.Fragment key={step.key}>
              {onFilterStep ? (
                <button
                  type="button"
                  onClick={() => onFilterStep(step.key)}
                  className="focus:outline-none"
                >
                  {stepElement}
                </button>
              ) : step.href ? (
                <Link href={step.href}>{stepElement}</Link>
              ) : (
                stepElement
              )}

              {idx < steps.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0 select-none" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Right action: "Todas las etapas" pill */}
      {onFilterStep && (
        <button
          type="button"
          onClick={() => onFilterStep("ALL")}
          className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all shrink-0 ${
            !activeFilterStep || activeFilterStep === "ALL"
              ? "bg-slate-800 text-white border border-slate-700 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {t("workflow.filter_all", "Todas las etapas")}
        </button>
      )}
    </nav>
  );
}
