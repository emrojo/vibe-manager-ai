"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n-context";
import { apiRequest } from "@/lib/api";
import Navbar from "@/components/Navbar";
import WorkflowGuide from "@/components/WorkflowGuide";
import {
  Boxes,
  Plus,
  CheckCircle2,
  CheckSquare,
  Clock,
  AlertTriangle,
  XCircle,
  Bot,
  Eye,
  Edit3,
  Trash2,
  RefreshCw,
  ShieldCheck,
  FileText,
  Sparkles,
  X,
  Layers,
  ChevronRight
} from "lucide-react";

interface RepoValidator {
  id: number;
  repo_name: string;
  repo_url: string;
  default_branch: string;
  is_active: boolean;
}

interface UserContextItem {
  id: number;
  user_id: number;
  user_name?: string;
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
  gemini_cache_name?: string;
  gemini_cache_expire_time?: string;
  created_at: string;
  updated_at: string;
}

export default function ContextsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const isValidator = user?.role === "admin" || user?.role === "validator" || (user?.validated_repos_count ?? 0) > 0 || Boolean(user?.is_project_validator);
  const [stageFilter, setStageFilter] = useState<string>("ALL");
  const [contexts, setContexts] = useState<UserContextItem[]>([]);
  const [repoValidators, setRepoValidators] = useState<RepoValidator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inspectContext, setInspectContext] = useState<UserContextItem | null>(null);
  const [iteratingContext, setIteratingContext] = useState<UserContextItem | null>(null);

  // Form states
  const [formIdentifier, setFormIdentifier] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formText, setFormText] = useState("");
  const [formRepoValidatorId, setFormRepoValidatorId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ctxRes, valRes] = await Promise.all([
        apiRequest<UserContextItem[]>("/contexts"),
        apiRequest<any[]>("/repo-validators/targets")
      ]);
      setContexts(ctxRes);
      setRepoValidators(valRes.map((v: any) => ({
        id: v.id,
        repo_name: v.repo_name || v.repo_url,
        repo_url: v.repo_url,
        default_branch: v.default_branch || "main",
        is_active: true
      })));
      setError(null);
    } catch (err: any) {
      setError(err.message || t("contexts.error_loading", "Error cargando contextos"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreateModal = () => {
    setIteratingContext(null);
    setFormIdentifier("");
    setFormName("");
    setFormDescription("");
    setFormText("");
    setFormRepoValidatorId(repoValidators.length > 0 ? repoValidators[0].id : "");
    setFormError(null);
    setShowCreateModal(true);
  };

  const openIterateModal = (ctx: UserContextItem) => {
    setIteratingContext(ctx);
    setFormIdentifier(ctx.identifier);
    setFormName(ctx.name);
    setFormDescription(ctx.description || "");
    setFormText(ctx.accepted_text || ctx.edited_text || ctx.context_text);
    setFormRepoValidatorId(ctx.repo_validator_id || (repoValidators.length > 0 ? repoValidators[0].id : ""));
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleSaveContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formIdentifier.trim() || !formName.trim() || !formText.trim()) {
      setFormError(t("contexts.form_error_required", "Por favor completa el identificador, nombre y las directrices del contexto."));
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      if (iteratingContext) {
        // Iterate / Update
        await apiRequest(`/contexts/${iteratingContext.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            context_text: formText.trim(),
            repo_validator_id: formRepoValidatorId ? Number(formRepoValidatorId) : undefined
          })
        });
      } else {
        // Create new
        await apiRequest("/contexts", {
          method: "POST",
          body: JSON.stringify({
            identifier: formIdentifier.trim().toLowerCase(),
            name: formName.trim(),
            description: formDescription.trim() || undefined,
            context_text: formText.trim(),
            repo_validator_id: formRepoValidatorId ? Number(formRepoValidatorId) : undefined
          })
        });
      }

      setShowCreateModal(false);
      fetchData();
    } catch (err: any) {
      setFormError(err.message || t("contexts.form_error_save", "Error al guardar el contexto"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContext = async (id: number) => {
    if (!confirm(t("contexts.confirm_delete", "¿Estás seguro de eliminar este contexto? Esta acción no se puede deshacer."))) return;
    try {
      await apiRequest(`/contexts/${id}`, {
        method: "DELETE"
      });
      fetchData();
    } catch (err: any) {
      alert(t("contexts.error_delete", "Error eliminando contexto: ") + err.message);
    }
  };

  const renderStatusBadge = (status: UserContextItem["status"]) => {
    switch (status) {
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            {t("contexts.status_pending", "En Revisión Inicial")}
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {t("contexts.status_approved", "Generando Plan (Gemini)...")}
          </span>
        );
      case "PLAN_PENDING":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Bot className="w-3.5 h-3.5" />
            {t("contexts.status_plan_pending", "Plan en Validación")}
          </span>
        );
      case "ACCEPTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {t("contexts.status_accepted", "✓ Aceptado para Prompts")}
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3.5 h-3.5" />
            {t("contexts.status_rejected", "Rechazado")}
          </span>
        );
      default:
        return null;
    }
  };

  const estimatedTokens = Math.max(1, Math.round(formText.trim().length / 3.8));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600/30 to-violet-500/30 border border-indigo-500/30">
                <Boxes className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  {t("contexts.title", "Mis Contextos de Desarrollo")}
                </h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  {t("contexts.subtitle", "Directrices técnicas y arquitectónicas con validación en dos fases y generación de Plan de Contexto con Gemini.")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              title={t("common.refresh", "Actualizar")}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all"
            >
              <Plus className="w-4 h-4" />
              {t("contexts.new_context_button", "Nuevo Contexto")}
            </button>
          </div>
        </div>

        {/* Workflow Stepper Guide */}
        <div className="mt-6">
          <WorkflowGuide
            flowType="contexts"
            isValidator={isValidator}
            activeFilterStep={stageFilter}
            onFilterStep={(stepKey) => setStageFilter(stepKey)}
            counts={{
              pendingContexts: contexts.filter((c) => c.status === "PENDING").length,
              pendingCtxPlans: contexts.filter((c) => c.status === "PLAN_PENDING" || c.status === "APPROVED").length,
              acceptedContexts: contexts.filter((c) => c.status === "ACCEPTED").length,
            }}
          />
        </div>

        {/* Workflow Info Alert */}
        <div className="mt-6 p-4 rounded-xl bg-slate-900/60 border border-indigo-500/20 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            <span className="font-semibold text-indigo-300">{t("contexts.qa_workflow_label", "Flujo de Garantía de Calidad:")}</span> {t("contexts.qa_workflow_desc", "Todo contexto creado o editado pasa por revisión inicial de su validador. Al ser aprobado,")} <strong className="text-white">Gemini</strong> {t("contexts.qa_workflow_desc_2", "genera un")} <strong className="text-white">{t("contexts.qa_workflow_desc_3", "Plan de Contexto Técnico")}</strong> {t("contexts.qa_workflow_desc_4", "que el validador aprueba antes de quedar disponible para tus prompts.")}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        {/* Filter Tabs Header */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setStageFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                stageFilter === "ALL" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
              }`}
            >
              {t("workflow.filter_all", "Todas las etapas")} ({contexts.length})
            </button>
            <button
              type="button"
              onClick={() => setStageFilter(isValidator ? "validate_text" : "initial")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                stageFilter === "initial" || stageFilter === "validate_text"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t("workflow.filter_ctx_pending", "1. En Revisión Inicial")} ({contexts.filter((c) => c.status === "PENDING").length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStageFilter(isValidator ? "validate_plan" : "plan")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                stageFilter === "plan" || stageFilter === "validate_plan"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{t("workflow.filter_ctx_plans", "2. Planes Técnicos")} ({contexts.filter((c) => c.status === "PLAN_PENDING" || c.status === "APPROVED").length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStageFilter("accepted")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                stageFilter === "accepted"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t("workflow.filter_ctx_accepted", "3. Aceptados / Activos")} ({contexts.filter((c) => c.status === "ACCEPTED").length})</span>
            </button>
          </div>
        </div>

        {/* Contexts List */}
        <div className="mt-4 space-y-4">
          {loading && contexts.length === 0 ? (
            <div className="py-20 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-500" />
              {t("contexts.loading_contexts", "Cargando tus contextos...")}
            </div>
          ) : contexts.length === 0 ? (
            <div className="py-20 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
              <Boxes className="w-12 h-12 mx-auto text-slate-600 mb-3" />
              <h3 className="text-lg font-medium text-slate-300">{t("contexts.no_contexts_title", "No tienes contextos creados")}</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                {t("contexts.no_contexts_desc", "Crea un contexto personalizado con las normas técnicas de tu proyecto para reducir tokens y alinear a la IA.")}
              </p>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                {t("contexts.create_first_context", "Crear Mi Primer Contexto")}
              </button>
            </div>
          ) : (() => {
            const filteredContexts = contexts.filter((ctx) => {
              if (stageFilter === "initial" || stageFilter === "validate_text") return ctx.status === "PENDING";
              if (stageFilter === "plan" || stageFilter === "validate_plan") {
                return ctx.status === "PLAN_PENDING" || ctx.status === "APPROVED";
              }
              if (stageFilter === "accepted") return ctx.status === "ACCEPTED";
              return true;
            });

            if (filteredContexts.length === 0) {
              return (
                <div className="py-16 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
                  <Boxes className="w-10 h-10 mx-auto text-slate-600 mb-2" />
                  <h3 className="text-base font-medium text-slate-300">No hay contextos en esta etapa</h3>
                  <p className="text-xs text-slate-500 mt-1">Selecciona &quot;Todas las etapas&quot; para visualizar todos tus contextos.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-4">
                {filteredContexts.map((ctx) => (
                <div
                  key={ctx.id}
                  className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 transition-all shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-semibold text-white truncate">{ctx.name}</h3>
                      <code className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        @{ctx.identifier}
                      </code>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-400 font-mono">
                        v{ctx.version}
                      </span>
                      {renderStatusBadge(ctx.status)}
                    </div>

                    {/* Step Lifecycle Progress Indicators */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 pb-0.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium border ${
                        ctx.status !== "PENDING" && ctx.status !== "REJECTED"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : ctx.status === "PENDING"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-slate-800 text-slate-500 border-slate-700"
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>1. Directivas</span>
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-600" />
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium border ${
                        ctx.status === "ACCEPTED"
                          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                          : ctx.status === "PLAN_PENDING" || ctx.status === "APPROVED" || ctx.plan_markdown
                          ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                          : "bg-slate-800/60 text-slate-500 border-slate-700/60"
                      }`}>
                        <Bot className="w-3 h-3" />
                        <span>2. Plan Técnico</span>
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-600" />
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium border ${
                        ctx.status === "ACCEPTED"
                          ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 font-semibold"
                          : "bg-slate-800/60 text-slate-500 border-slate-700/60"
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>3. Aceptado</span>
                      </span>
                    </div>

                    {ctx.description && (
                      <p className="text-xs text-slate-400 line-clamp-2">{ctx.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                      <span>
                        {t("contexts.validator_label", "Validador:")} <strong className="text-slate-200">{ctx.repo_name || t("contexts.validator_general", "General")}</strong>
                        {ctx.assigned_validator_name ? ` (${ctx.assigned_validator_name})` : ""}
                      </span>
                      <span>•</span>
                      <span>
                        {t("contexts.estimated_tokens_label", "Tokens estimados:")} <strong className="text-slate-200">{ctx.estimated_tokens.toLocaleString()}</strong> (~{ctx.character_count.toLocaleString()} {t("contexts.chars_label", "chars")})
                      </span>
                      {ctx.gemini_cache_name && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {t("contexts.cache_active_gemini", "Cache Activo en Gemini")}
                          </span>
                        </>
                      )}
                    </div>

                    {ctx.status === "REJECTED" && ctx.rejection_reason && (
                      <div className="mt-2 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                        <strong>{t("contexts.rejection_reason", "Motivo de rechazo:")}</strong> {ctx.rejection_reason}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                    <button
                      onClick={() => setInspectContext(ctx)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        ctx.plan_markdown || ctx.status === "PLAN_PENDING" || ctx.status === "ACCEPTED"
                          ? "bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/40 shadow-sm"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                      <span>{ctx.plan_markdown ? t("workflow.step_ctx_view_plan", "Ver Plan de Contexto") : t("contexts.view_detail_plan", "Ver Detalle & Plan")}</span>
                    </button>

                    {isValidator && (ctx.status === "PENDING" || ctx.status === "PLAN_PENDING") && (
                      <Link
                        href="/validator?section=contexts"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs font-semibold text-amber-200 transition-all border border-amber-500/40"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                        <span>Validar</span>
                      </Link>
                    )}

                    <button
                      onClick={() => openIterateModal(ctx)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-xs font-medium text-indigo-300 transition-all border border-indigo-500/30"
                      title={t("contexts.iterate_title_btn", "Iterar y enviar nueva versión a validación")}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {t("contexts.iterate", "Iterar")} (v{ctx.version + 1})
                    </button>

                    <button
                      onClick={() => handleDeleteContext(ctx.id)}
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                      title={t("contexts.delete_title", "Eliminar contexto")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        </div>
      </main>

      {/* Modal Crear / Iterar Contexto */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl p-6 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 shrink-0">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {iteratingContext ? `${t("contexts.iterate_modal_title", "Modificar e Iterar Contexto")}: ${iteratingContext.name} (v${iteratingContext.version + 1})` : t("contexts.create_modal_title", "Crear Nuevo Contexto Personal")}
                </h2>
                <p className="text-xs text-slate-400">
                  {iteratingContext ? t("contexts.iterate_desc", "Al modificar el contenido, el contexto incrementará su versión y pasará de nuevo por el flujo de validación técnica.") : t("contexts.create_modal_desc", "Configura un nuevo conjunto de directrices técnicas para tus futuros prompts.")}
                </p>
              </div>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2 shrink-0">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveContext} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {t("contexts.id_label", "Identificador (Slug) *")}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono">@</span>
                    <input
                      type="text"
                      disabled={Boolean(iteratingContext)}
                      value={formIdentifier}
                      onChange={(e) => setFormIdentifier(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                      placeholder="backend-fastapi"
                      className="w-full pl-7 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                      required
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">{t("contexts.id_helper", "Único para tus prompts (ej: @react-clean, @api-rules)")}</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {t("contexts.name_label", "Nombre Descriptivo *")}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={t("contexts.name_placeholder", "Reglas FastAPI & Clean Architecture")}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t("contexts.repo_target_label", "Validador de Repositorio Responsable")}
                </label>
                <select
                  value={formRepoValidatorId}
                  onChange={(e) => setFormRepoValidatorId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">{t("contexts.no_repo_assigned", "Sin repositorio asignado (Revisión general de administradores)")}</option>
                  {repoValidators.map((rv) => (
                    <option key={rv.id} value={rv.id}>
                      {rv.repo_name} ({rv.default_branch})
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500">
                  {t("contexts.repo_helper", "El validador de este repositorio será quien revise y apruebe las directrices y el Plan generado.")}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  {t("contexts.desc_label", "Descripción Corta (Opcional)")}
                </label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t("contexts.desc_placeholder", "Convenciones de arquitectura, dependencias y manejo de errores...")}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    {t("contexts.directives_label", "Directrices de Contexto / Estándares de Código *")}
                  </label>
                  <div className="text-[11px] text-slate-400 font-mono">
                    ~{estimatedTokens.toLocaleString()} {t("contexts.tokens_label", "tokens estimados")} ({formText.length.toLocaleString()} {t("contexts.chars_label", "caracteres")})
                  </div>
                </div>
                <textarea
                  rows={8}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder={t("contexts.directives_placeholder", "Escribe las reglas de arquitectura, patrones de diseño, componentes que deben usarse, estilos obligatorios, etc.")}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
                  required
                />
              </div>
            </form>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-all"
              >
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSaveContext}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("common.saving", "Guardando...")}
                  </>
                ) : iteratingContext ? (
                  <>
                    <Edit3 className="w-3.5 h-3.5" /> {t("contexts.iterate_submit", "Guardar y Reenviar a Validación")} (v{iteratingContext.version + 1})
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" /> {t("contexts.create_submit", "Enviar a Validación")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Inspeccionar Detalle & Plan */}
      {inspectContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl p-6 relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setInspectContext(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pb-4 border-b border-slate-800 shrink-0">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{inspectContext.name}</h2>
                  <code className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                    @{inspectContext.identifier}
                  </code>
                  <span className="text-xs text-slate-400">v{inspectContext.version}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {renderStatusBadge(inspectContext.status)}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-1">
              {/* Context Plan Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-purple-400" /> {t("contexts.plan_modal_title", "Plan Técnico Generado por Gemini")}
                </h4>
                {inspectContext.plan_markdown ? (
                  <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/20 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                    {inspectContext.plan_markdown}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-500 italic">
                    {inspectContext.status === "PENDING"
                      ? t("contexts.plan_status_pending", "El Plan de Contexto se generará automáticamente con Gemini una vez que el validador apruebe el texto inicial.")
                      : t("contexts.plan_not_ready", "Aún no se ha generado un Plan de Contexto para esta versión.")}
                  </div>
                )}
              </div>

              {/* Canonical / Validated Context Text */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" /> {t("contexts.base_directives_title", "Texto de Directrices Base")}
                </h4>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                  {inspectContext.accepted_text || inspectContext.edited_text || inspectContext.context_text}
                </div>
                {inspectContext.edited_text && inspectContext.edited_text !== inspectContext.context_text && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    {t("contexts.validator_adjusted_note", "* El validador ajustó directamente el texto original durante la fase de validación inicial.")}
                  </p>
                )}
              </div>

              {/* Feedback from Validator if any */}
              {inspectContext.plan_feedback && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    {t("contexts.validator_feedback_title", "Feedback de Ajuste del Validador")}
                  </h4>
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 font-mono">
                    {inspectContext.plan_feedback}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500">
                {t("common.created_at", "Creado el")} {new Date(inspectContext.created_at).toLocaleDateString()} • {t("common.updated_at", "Actualizado el")} {new Date(inspectContext.updated_at).toLocaleDateString()}
              </div>
              <button
                onClick={() => setInspectContext(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white transition-all"
              >
                {t("common.close", "Cerrar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
