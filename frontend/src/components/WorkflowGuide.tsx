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
  Bot
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
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/30 border border-slate-800/90 rounded-2xl p-5 shadow-xl relative overflow-hidden">
      {/* Glow background accent */}
      <div className="absolute top-0 right-1/4 w-72 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            {isValidator ? <ShieldCheck className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                {title}
              </h2>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  isValidator
                    ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                    : "bg-blue-500/10 text-blue-300 border-blue-500/30"
                }`}
              >
                {isValidator ? t("navbar.role_validator", "Validador") : t("navbar.role_user", "Usuario")}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>

        {onFilterStep && (
          <button
            type="button"
            onClick={() => onFilterStep("ALL")}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all self-start sm:self-auto ${
              !activeFilterStep || activeFilterStep === "ALL"
                ? "bg-slate-800 text-slate-200 border border-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("workflow.filter_all", "Todas las etapas")}
          </button>
        )}
      </div>

      {/* Steps Pipeline */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${steps.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"} gap-3 mt-4`}>
        {steps.map((step) => {
          const Icon = step.icon;
          const isSelected = activeFilterStep === step.key;

          const cardContent = (
            <div
              className={`h-full p-3.5 rounded-xl border transition-all relative flex flex-col justify-between ${
                isSelected
                  ? "bg-indigo-600/15 border-indigo-500 text-white shadow-md shadow-indigo-600/10"
                  : "bg-slate-950/70 border-slate-800/80 hover:border-slate-700/80 text-slate-300 hover:bg-slate-900/60"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                        isSelected
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-slate-800 text-slate-300 border border-slate-700"
                      }`}
                    >
                      {step.number}
                    </span>
                    <Icon
                      className={`w-4 h-4 ${
                        isSelected ? "text-indigo-300" : "text-slate-400"
                      }`}
                    />
                  </div>

                  {step.badgeCount !== undefined && step.badgeCount > 0 && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        step.badgeVariant === "amber"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : step.badgeVariant === "purple"
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : step.badgeVariant === "emerald"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                          : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                      }`}
                    >
                      {step.badgeCount}
                    </span>
                  )}
                </div>

                <h3 className="text-xs font-bold text-slate-100">{step.title}</h3>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {step.description}
                </p>
              </div>

              {step.href && (
                <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-indigo-400 font-medium">
                  <span>Ir a sección</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          );

          return onFilterStep ? (
            <button
              key={step.key}
              type="button"
              onClick={() => onFilterStep(step.key)}
              className="text-left w-full focus:outline-none"
            >
              {cardContent}
            </button>
          ) : step.href ? (
            <Link key={step.key} href={step.href}>
              {cardContent}
            </Link>
          ) : (
            <div key={step.key}>{cardContent}</div>
          );
        })}
      </div>
    </div>
  );
}
