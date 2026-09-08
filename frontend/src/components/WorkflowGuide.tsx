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
  ShieldCheck, 
  Bot,
  Layers,
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
        // Standard User (4 sequential guided steps with explicit waiting phases)
        return [
          {
            key: "create",
            number: 1,
            title: t("workflow.step_prompt_create", "Creación de Prompt"),
            description: t("workflow.step_prompt_create_desc", "Redacta tu instrucción y selecciona el repositorio"),
            icon: Send,
          },
          {
            key: "waiting_prompt_val",
            number: 2,
            title: t("workflow.step_waiting_val", "En Espera de Validación"),
            description: t("workflow.step_waiting_val_desc", "El prompt está pendiente de revisión por el validador del repositorio"),
            icon: Clock,
            badgeCount: counts.pendingPrompts,
            badgeVariant: "amber",
          },
          {
            key: "waiting_plan_val",
            number: 3,
            title: t("workflow.step_waiting_plan_val", "Plan de Trabajo (En Espera)"),
            description: t("workflow.step_waiting_plan_val_desc", "Plan generado por Gemini. En espera de autorización para ejecutar"),
            icon: FileCode2,
            badgeCount: counts.pendingPlans,
            badgeVariant: "purple",
          },
          {
            key: "prs",
            number: 4,
            title: t("workflow.step_prompt_prs", "Pull Request Generado"),
            description: t("workflow.step_prompt_prs_desc", "Ejecución en Docker completada y PR listo en GitHub"),
            icon: GitPullRequest,
            badgeCount: (counts.running || 0) + (counts.completedPRs || 0),
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
            title: t("workflow.step_val_create", "Creación de Prompt"),
            description: t("workflow.step_val_create_desc", "Envío de instrucción o propuesta al sistema"),
            icon: Send,
          },
          {
            key: "validate_prompt",
            number: 2,
            title: t("workflow.step_val_validate_prompt", "Validación de Prompts"),
            description: t("workflow.step_val_validate_prompt_desc", "Revisa, edita directivas y autoriza el prompt entrante"),
            icon: CheckSquare,
            badgeCount: counts.pendingPrompts,
            badgeVariant: "amber",
            href: "/validator?section=prompts",
          },
          {
            key: "validate_plan",
            number: 3,
            title: t("workflow.step_val_validate_plan", "Validación de Planes"),
            description: t("workflow.step_val_validate_plan_desc", "Aprueba o ajusta el plan técnico estructurado por Gemini"),
            icon: FileCode2,
            badgeCount: counts.pendingPlans,
            badgeVariant: "purple",
            href: "/validator?section=plans",
          },
          {
            key: "prs",
            number: 4,
            title: t("workflow.step_val_prs", "Pull Requests y Runners"),
            description: t("workflow.step_val_prs_desc", "Supervisión de ejecución en Docker y PRs en GitHub"),
            icon: GitPullRequest,
            badgeCount: (counts.running || 0) + (counts.completedPRs || 0),
            badgeVariant: "emerald",
            href: "/pull-requests",
          },
        ];
      }
    } else {
      // flowType === "contexts"
      if (!isValidator) {
        // Standard User (4 Steps with explicit waiting state)
        return [
          {
            key: "initial",
            number: 1,
            title: t("workflow.step_ctx_initial", "Creación de Directivas"),
            description: t("workflow.step_ctx_initial_desc", "Define el texto y reglas arquitectónicas iniciales"),
            icon: Boxes,
          },
          {
            key: "waiting_ctx_val",
            number: 2,
            title: t("workflow.step_ctx_waiting_val", "En Espera de Validación"),
            description: t("workflow.step_ctx_waiting_val_desc", "Directivas enviadas. Esperando revisión inicial del validador"),
            icon: Clock,
            badgeCount: counts.pendingContexts,
            badgeVariant: "amber",
          },
          {
            key: "waiting_ctx_plan",
            number: 3,
            title: t("workflow.step_ctx_waiting_plan", "Plan de Contexto (En Espera)"),
            description: t("workflow.step_ctx_waiting_plan_desc", "Plan estructurado por IA. Esperando autorización para activar"),
            icon: Bot,
            badgeCount: counts.pendingCtxPlans,
            badgeVariant: "purple",
          },
          {
            key: "accepted",
            number: 4,
            title: t("workflow.step_ctx_accepted", "Contextos Aceptados"),
            description: t("workflow.step_ctx_accepted_desc", "Contexto activo para inyectar en prompts con caché Gemini"),
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
            title: t("workflow.step_ctx_initial", "Creación de Directivas"),
            description: t("workflow.step_ctx_initial_desc", "Define el texto y reglas arquitectónicas iniciales"),
            icon: Boxes,
          },
          {
            key: "validate_text",
            number: 2,
            title: t("workflow.step_ctx_val_text", "Validación de Directivas"),
            description: t("workflow.step_ctx_val_text_desc", "Revisar y aprobar directivas iniciales del contexto"),
            icon: CheckSquare,
            badgeCount: counts.pendingContexts,
            badgeVariant: "amber",
            href: "/validator?section=contexts",
          },
          {
            key: "validate_plan",
            number: 3,
            title: t("workflow.step_ctx_val_plan", "Validación de Plan Técnico"),
            description: t("workflow.step_ctx_val_plan_desc", "Revisar y aprobar plan técnico estructurado por Gemini"),
            icon: FileCode2,
            badgeCount: counts.pendingCtxPlans,
            badgeVariant: "purple",
            href: "/validator?section=contexts",
          },
          {
            key: "accepted",
            number: 4,
            title: t("workflow.step_ctx_val_accepted", "Aceptados y Activos"),
            description: t("workflow.step_ctx_val_accepted_desc", "Aprobado para producción y caché en prompts del equipo"),
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
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute -left-20 -top-20 w-56 h-56 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-indigo-400">
            {isValidator ? (
              <ShieldCheck className="w-5 h-5 text-purple-400" />
            ) : (
              <Sparkles className="w-5 h-5 text-indigo-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {title}
              </h2>
              <span
                className={`text-[9px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                  isValidator
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                }`}
              >
                {isValidator ? t("navbar.role_validator", "Validador") : t("navbar.role_user", "Usuario")}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Global Filter / Reset Button */}
        {onFilterStep && (
          <button
            type="button"
            onClick={() => onFilterStep("ALL")}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all shrink-0 flex items-center gap-1.5 border ${
              !activeFilterStep || activeFilterStep === "ALL"
                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-200 shadow-sm"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{t("workflow.filter_all", "Todas las etapas")}</span>
          </button>
        )}
      </div>

      {/* Round Nodes Stepper Row */}
      <div className="mt-5 relative">
        {/* Continuous Connecting Line (Desktop) */}
        <div className="hidden md:block absolute top-6 left-12 right-12 h-0.5 bg-slate-800 -z-0" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-2 relative z-10">
          {steps.map((step) => {
            const Icon = step.icon;
            const isSelected = activeFilterStep === step.key;

            return (
              <div
                key={step.key}
                onClick={() => onFilterStep && onFilterStep(step.key)}
                className={`flex flex-col items-center group cursor-pointer text-center p-2 rounded-xl transition-all duration-200 select-none ${
                  isSelected
                    ? "bg-slate-950/80 ring-1 ring-indigo-500/50 shadow-lg"
                    : "hover:bg-slate-950/40"
                }`}
              >
                {/* Round Circle Node with Badge */}
                <div className="relative">
                  <div
                    className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-md ${
                      isSelected
                        ? "bg-gradient-to-tr from-indigo-600 to-violet-600 text-white ring-4 ring-indigo-500/30 shadow-indigo-500/30 scale-105 border-2 border-white"
                        : "bg-slate-950 text-slate-300 border-2 border-slate-700 group-hover:border-indigo-500/60 group-hover:text-white group-hover:bg-slate-900"
                    }`}
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>

                  {/* Top-Right Pending Badge Counter */}
                  {step.badgeCount !== undefined && step.badgeCount > 0 && (
                    <span
                      title={`${step.badgeCount} elementos pendientes en este paso`}
                      className={`absolute -top-1.5 -right-1.5 min-w-[22px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold font-mono shadow-md border ${
                        isSelected
                          ? "bg-white text-indigo-700 border-indigo-200"
                          : step.badgeVariant === "amber"
                          ? "bg-amber-500 text-slate-950 border-amber-300 animate-pulse font-black"
                          : step.badgeVariant === "purple"
                          ? "bg-purple-500 text-white border-purple-300 font-bold"
                          : step.badgeVariant === "emerald"
                          ? "bg-emerald-500 text-slate-950 border-emerald-300 font-black"
                          : "bg-indigo-600 text-white border-indigo-300 font-bold"
                      }`}
                    >
                      {step.badgeCount}
                    </span>
                  )}
                </div>

                {/* Content Located Directly Below Node */}
                <div className="mt-2.5 flex flex-col items-center w-full">
                  {/* Step Label: PASO 1, PASO 2, etc. */}
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md border ${
                      isSelected
                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                        : "bg-slate-950 text-slate-400 border-slate-800 group-hover:text-slate-300"
                    }`}
                  >
                    {t("workflow.step_label", { number: step.number }) || `PASO ${step.number}`}
                  </span>

                  {/* Step Title */}
                  <h3
                    className={`mt-1 text-xs sm:text-sm font-bold transition-colors line-clamp-1 ${
                      isSelected ? "text-white" : "text-slate-300 group-hover:text-white"
                    }`}
                  >
                    {step.title.replace(/^\d+\.\s*/, "")}
                  </h3>

                  {/* Step Description */}
                  <p className="mt-1 text-[11px] text-slate-400 leading-snug line-clamp-2 max-w-[170px] sm:max-w-[200px]">
                    {step.description}
                  </p>

                  {/* Element count note if available */}
                  {step.badgeCount !== undefined && step.badgeCount > 0 && (
                    <span className="mt-1 text-[10px] font-medium text-amber-400/90">
                      {step.badgeCount} {t("workflow.pending_badge", { count: step.badgeCount })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
