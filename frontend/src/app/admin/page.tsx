"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { 
  apiRequest, 
  User, 
  Invitation, 
  Project, 
  AdminUserQuota, 
  UserContext, 
  getAdminQuotas, 
  updateAdminUserQuota, 
  resetAdminUserQuota, 
  getAdminContexts, 
  deleteAdminContext 
} from "@/lib/api";
import { 
  ShieldAlert, 
  Users, 
  KeyRound, 
  FolderGit2, 
  UserCheck, 
  UserX, 
  ShieldCheck, 
  Share2, 
  Copy, 
  MessageSquare, 
  Plus, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Mail,
  Edit3,
  Power,
  Search,
  Coins,
  Database,
  Layers,
  Cpu,
  X
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<"users" | "invites" | "projects" | "gemini" | "quotas">("users");
  const [stats, setStats] = useState<any>(null);
  
  // Quotas & Contexts state
  const [quotasList, setQuotasList] = useState<AdminUserQuota[]>([]);
  const [adminContextsList, setAdminContextsList] = useState<UserContext[]>([]);
  const [editingQuotaUser, setEditingQuotaUser] = useState<AdminUserQuota | null>(null);
  const [editQuotaLimit, setEditQuotaLimit] = useState<number>(100000);
  const [editQuotaHours, setEditQuotaHours] = useState<number>(5);
  const [savingQuota, setSavingQuota] = useState(false);
  const [resettingQuotaId, setResettingQuotaId] = useState<number | null>(null);
  const [deletingCtxId, setDeletingCtxId] = useState<number | null>(null);
  const [quotaSearch, setQuotaSearch] = useState("");

  // Users state
  const [usersList, setUsersList] = useState<User[]>([]);
  // Invites state
  const [invitesList, setInvitesList] = useState<Invitation[]>([]);
  const [newInviteMaxUses, setNewInviteMaxUses] = useState<number>(5);
  const [newInviteDays, setNewInviteDays] = useState<number>(30);
  // Projects state
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [newProjName, setNewProjName] = useState("");
  const [newProjDesc, setNewProjDesc] = useState("");
  const [newProjRepo, setNewProjRepo] = useState("");
  const [newProjBranch, setNewProjBranch] = useState("main");
  const [newProjToken, setNewProjToken] = useState("");
  const [newProjRules, setNewProjRules] = useState("");

  // Edit project state
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProjName, setEditProjName] = useState("");
  const [editProjDesc, setEditProjDesc] = useState("");
  const [editProjRepo, setEditProjRepo] = useState("");
  const [editProjBranch, setEditProjBranch] = useState("main");
  const [editProjToken, setEditProjToken] = useState("");
  const [editProjRules, setEditProjRules] = useState("");
  const [editProjActive, setEditProjActive] = useState(true);
  const [updatingProj, setUpdatingProj] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");

  // Gemini state
  const [geminiConfig, setGeminiConfig] = useState<{ configured: boolean; masked_key: string; model: string }>({
    configured: false,
    masked_key: "",
    model: "gemini-3.6-flash",
  });
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [geminiModelInput, setGeminiModelInput] = useState("gemini-3.6-flash");
  const [savingGemini, setSavingGemini] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        router.push("/login");
      } else if (user.role !== "admin") {
        router.push("/dashboard");
      }
    }
  }, [user, authLoading, router]);

  const loadAllData = async () => {
    if (!user || user.role !== "admin") return;
    setLoading(true);
    try {
      const [statsData, usersData, invitesData, projsData, geminiData, quotasData, contextsData] = await Promise.all([
        apiRequest<any>("/admin/stats"),
        apiRequest<User[]>("/admin/users"),
        apiRequest<Invitation[]>("/admin/invitations"),
        apiRequest<Project[]>("/projects"),
        apiRequest<any>("/admin/settings/gemini").catch(() => ({ configured: false, masked_key: "", model: "gemini-3.6-flash" })),
        getAdminQuotas().catch(() => []),
        getAdminContexts().catch(() => []),
      ]);
      setStats(statsData);
      setUsersList(usersData);
      setInvitesList(invitesData);
      setProjectsList(projsData);
      setGeminiConfig(geminiData);
      setGeminiModelInput(geminiData.model || "gemini-3.6-flash");
      setQuotasList(quotasData);
      setAdminContextsList(contextsData);
    } catch (err: any) {
      console.error("Error cargando consola admin:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.role === "admin") {
      loadAllData();
    }
  }, [user]);

  // Quota & Context Actions
  const handleStartEditQuota = (q: AdminUserQuota) => {
    setEditingQuotaUser(q);
    setEditQuotaLimit(q.token_quota_limit);
    setEditQuotaHours(q.quota_window_hours);
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaUser) return;
    setSavingQuota(true);
    try {
      await updateAdminUserQuota(editingQuotaUser.user_id, {
        token_quota_limit: Number(editQuotaLimit),
        quota_window_hours: Number(editQuotaHours),
      });
      setFeedback({ type: "success", text: `Cuota para ${editingQuotaUser.email} actualizada correctamente.` });
      setEditingQuotaUser(null);
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al actualizar cuota." });
    } finally {
      setSavingQuota(false);
    }
  };

  const handleResetQuota = async (userId: number, email: string) => {
    if (!confirm(`¿Deseas reiniciar manualmente la ventana de cuota para ${email}? Los tokens usados volverán a 0 inmediatamente.`)) return;
    setResettingQuotaId(userId);
    try {
      await resetAdminUserQuota(userId);
      setFeedback({ type: "success", text: `Cuota para ${email} reiniciada a 0 exitosamente.` });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al reiniciar cuota." });
    } finally {
      setResettingQuotaId(null);
    }
  };

  const handleDeleteAdminContext = async (contextId: number, name: string) => {
    if (!confirm(`¿Seguro que deseas eliminar el contexto "${name}" (ID #${contextId})? Esta acción no se puede deshacer.`)) return;
    setDeletingCtxId(contextId);
    try {
      await deleteAdminContext(contextId);
      setFeedback({ type: "success", text: `Contexto "${name}" eliminado exitosamente.` });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al eliminar contexto." });
    } finally {
      setDeletingCtxId(null);
    }
  };

  function formatTimeRemaining(seconds: number): string {
    if (seconds <= 0) return "Listo para reiniciar";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  // User Actions
  const handleToggleBan = async (u: User) => {
    const action = u.is_banned ? "unban" : "ban";
    try {
      await apiRequest(`/admin/users/${u.id}/${action}`, { method: "POST" });
      setFeedback({
        type: "success",
        text: `Usuario ${u.email} ${u.is_banned ? "readmitido" : "suspendido"} exitosamente.`,
      });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleToggleValidator = async (u: User) => {
    const nextRole = u.role === "validator" ? "user" : "validator";
    try {
      await apiRequest(`/admin/users/${u.id}/role`, {
        method: "POST",
        body: JSON.stringify({ role: nextRole }),
      });
      setFeedback({
        type: "success",
        text: `Rol de ${u.email} actualizado a '${nextRole}'.`,
      });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  // Invitation Actions
  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/admin/invitations", {
        method: "POST",
        body: JSON.stringify({
          max_uses: Number(newInviteMaxUses),
          expires_in_days: Number(newInviteDays),
        }),
      });
      setFeedback({ type: "success", text: "Nueva invitación generada con éxito." });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleRevokeInvitation = async (id: number) => {
    try {
      await apiRequest(`/admin/invitations/${id}`, { method: "DELETE" });
      setFeedback({ type: "success", text: "Invitación revocada." });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Project Actions
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: newProjName.trim(),
          description: newProjDesc.trim() || undefined,
          repo_url: newProjRepo.trim(),
          default_branch: newProjBranch.trim() || "main",
          github_token: newProjToken.trim() || undefined,
          system_prompt_rules: newProjRules.trim() || undefined,
          is_active: true,
        }),
      });
      setFeedback({ type: "success", text: "Proyecto agregado correctamente." });
      setNewProjName("");
      setNewProjDesc("");
      setNewProjRepo("");
      setNewProjToken("");
      setNewProjRules("");
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleDeleteProject = async (id: number) => {
    if (!confirm("¿Seguro que deseas eliminar este proyecto y sus prompts asociados?")) return;
    try {
      await apiRequest(`/projects/${id}`, { method: "DELETE" });
      setFeedback({ type: "success", text: "Proyecto eliminado exitosamente." });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleStartEditProject = (p: Project) => {
    setEditingProject(p);
    setEditProjName(p.name);
    setEditProjDesc(p.description || "");
    setEditProjRepo(p.repo_url);
    setEditProjBranch(p.default_branch || "main");
    setEditProjToken(""); // Blank means keep existing token
    setEditProjRules(p.system_prompt_rules || "");
    setEditProjActive(p.is_active);
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    setUpdatingProj(true);
    try {
      const payload: any = {
        name: editProjName.trim(),
        description: editProjDesc.trim() || undefined,
        repo_url: editProjRepo.trim(),
        default_branch: editProjBranch.trim() || "main",
        system_prompt_rules: editProjRules.trim() || undefined,
        is_active: editProjActive,
      };
      if (editProjToken.trim()) {
        payload.github_token = editProjToken.trim();
      }

      await apiRequest(`/projects/${editingProject.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      setFeedback({ type: "success", text: `Proyecto "${editProjName}" actualizado exitosamente.` });
      setEditingProject(null);
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al actualizar proyecto" });
    } finally {
      setUpdatingProj(false);
    }
  };

  const handleToggleActiveProject = async (p: Project) => {
    try {
      await apiRequest(`/projects/${p.id}`, {
        method: "PUT",
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      setFeedback({
        type: "success",
        text: `Repositorio "${p.name}" ${!p.is_active ? "activado" : "desactivado"} exitosamente.`,
      });
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Error al cambiar estado" });
    }
  };

  const handleSaveGeminiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGemini(true);
    try {
      const res = await apiRequest<any>("/admin/settings/gemini", {
        method: "POST",
        body: JSON.stringify({
          api_key: geminiKeyInput.trim(),
          model: geminiModelInput.trim() || undefined,
        }),
      });
      setFeedback({ type: "success", text: "Configuración de Google Gemini guardada con éxito." });
      setGeminiKeyInput("");
      setGeminiConfig(res);
      await loadAllData();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    } finally {
      setSavingGemini(false);
    }
  };

  if (authLoading || !user || user.role !== "admin") return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <ShieldAlert className="w-7 h-7 text-purple-400" />
          Consola de Administración
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Gestiona los usuarios, otorga roles de validador, genera códigos de invitación y administra los repositorios vinculados.
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
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Metrics Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-md">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Usuarios Registrados
            </span>
            <div className="text-2xl font-bold text-white mt-1 flex items-center justify-between">
              <span>{stats.users.total}</span>
              <Users className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              {stats.users.validators} validadores • {stats.users.banned} baneados
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-md">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Prompts Pendientes
            </span>
            <div className="text-2xl font-bold text-amber-400 mt-1 flex items-center justify-between">
              <span>{stats.prompts.pending}</span>
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Esperando revisión de validador
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-md">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              PRs Generados en GitHub
            </span>
            <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center justify-between">
              <span>{stats.prompts.completed_prs}</span>
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Ejecutados con éxito en Docker
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-md">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Proyectos Web
            </span>
            <div className="text-2xl font-bold text-indigo-400 mt-1 flex items-center justify-between">
              <span>{stats.projects_total}</span>
              <FolderGit2 className="w-5 h-5 text-indigo-400" />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Repositorios configurados
            </span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "users"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Gestión de Usuarios</span>
        </button>

        <button
          onClick={() => setActiveTab("invites")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "invites"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Códigos y Enlaces de Invitación</span>
        </button>

        <button
          onClick={() => setActiveTab("projects")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "projects"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <FolderGit2 className="w-4 h-4" />
          <span>Repositorios GitHub</span>
        </button>

        <button
          onClick={() => setActiveTab("gemini")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "gemini"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Google Gemini AI</span>
        </button>

        <button
          onClick={() => setActiveTab("quotas")}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "quotas"
              ? "border-purple-500 text-purple-400"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <Coins className="w-4 h-4" />
          <span>Cuotas y Contextos</span>
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === "users" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Directorio de Usuarios</h2>
              <p className="text-xs text-slate-400">
                Otorga el rol de validador, banea cuentas o inicia un chat directo
              </p>
            </div>
            <button
              onClick={loadAllData}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Rol</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {usersList.map((u) => {
                  const isCurrentAdmin = u.id === user.id;

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {u.name}
                        {isCurrentAdmin && (
                          <span className="ml-2 text-[10px] text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
                            (Tú)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                            u.role === "admin"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : u.role === "validator"
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {u.is_banned ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Baneado
                          </span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {!isCurrentAdmin && (
                          <>
                            {/* Toggle Validator Role */}
                            <button
                              onClick={() => handleToggleValidator(u)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                u.role === "validator"
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                              }`}
                              title={u.role === "validator" ? "Quitar rol de validador" : "Hacer validador"}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
                              {u.role === "validator" ? "Quitar Validador" : "Hacer Validador"}
                            </button>

                            {/* Ban / Readmit */}
                            <button
                              onClick={() => handleToggleBan(u)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                                u.is_banned
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                                  : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                              }`}
                            >
                              {u.is_banned ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5 inline mr-1" />
                                  Readmitir
                                </>
                              ) : (
                                <>
                                  <UserX className="w-3.5 h-3.5 inline mr-1" />
                                  Banear
                                </>
                              )}
                            </button>

                            {/* Chat link */}
                            <Link
                              href={`/chat?userId=${u.id}`}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 inline-flex items-center gap-1"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Chat
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: INVITATIONS */}
      {activeTab === "invites" && (
        <div className="space-y-6">
          {/* Create Invite Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-1">Generar Nueva Invitación</h2>
            <p className="text-xs text-slate-400 mb-4">
              Crea códigos o enlaces que pueden ser compartidos libremente por WhatsApp o correo electrónico.
            </p>

            <form onSubmit={handleCreateInvitation} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Usos Máximos (-1 = ilimitado)
                </label>
                <input
                  type="number"
                  value={newInviteMaxUses}
                  onChange={(e) => setNewInviteMaxUses(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Vigencia (Días)
                </label>
                <input
                  type="number"
                  value={newInviteDays}
                  onChange={(e) => setNewInviteDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 px-5 rounded-xl shadow-lg shadow-purple-600/20 flex items-center justify-center gap-2 transition-all text-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Generar Invitación</span>
              </button>
            </form>
          </div>

          {/* Invites List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white">Invitaciones Activas</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase bg-slate-950/60 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Usos</th>
                    <th className="py-3 px-4">Expiración</th>
                    <th className="py-3 px-4">Compartir</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invitesList.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-purple-400">
                        {inv.code}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-300 font-mono">
                        {inv.used_count} / {inv.max_uses === -1 ? "∞" : inv.max_uses}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "Sin fecha"}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {/* Copy Link Button */}
                          <button
                            onClick={() => copyToClipboard(inv.invite_url, inv.id)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 flex items-center gap-1 transition-all"
                            title="Copiar enlace de registro"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>{copiedId === inv.id ? "¡Copiado!" : "Copiar Enlace"}</span>
                          </button>

                          {/* WhatsApp Share Button */}
                          <a
                            href={inv.whatsapp_share_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1 transition-all"
                            title="Enviar por WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>

                          {/* Email Share Button */}
                          <a
                            href={inv.email_share_url}
                            className="px-2.5 py-1 rounded bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-xs flex items-center gap-1 transition-all"
                            title="Enviar por Correo"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email</span>
                          </a>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {inv.is_active ? (
                          <button
                            onClick={() => handleRevokeInvitation(inv.id)}
                            className="text-xs text-rose-400 hover:text-rose-300"
                          >
                            Revocar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500">Revocada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PROJECTS */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          {/* Add Project Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-base font-bold text-white mb-1">Añadir Nuevo Repositorio Web</h2>
            <p className="text-xs text-slate-400 mb-4">
              Configura los proyectos sobre los cuales los usuarios podrán proponer prompts.
            </p>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Nombre del Proyecto
                  </label>
                  <input
                    type="text"
                    required
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    placeholder="Ej: Tienda Online Next.js"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    URL del Repositorio GitHub
                  </label>
                  <input
                    type="text"
                    required
                    value={newProjRepo}
                    onChange={(e) => setNewProjRepo(e.target.value)}
                    placeholder="https://github.com/usuario/repositorio"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Rama por Defecto
                  </label>
                  <input
                    type="text"
                    value={newProjBranch}
                    onChange={(e) => setNewProjBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    GitHub Personal Access Token (PAT)
                  </label>
                  <input
                    type="password"
                    value={newProjToken}
                    onChange={(e) => setNewProjToken(e.target.value)}
                    placeholder="ghp_••••••••••••••••••••••••••••••••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Necesario para crear ramas y PRs automáticamente en el repositorio.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Reglas y Directrices para la IA en este Proyecto (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={newProjRules}
                  onChange={(e) => setNewProjRules(e.target.value)}
                  placeholder="Ej: Utiliza Tailwind CSS v3, convenciones de TypeScript estricto y comentarios en español."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-purple-600/20 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar Proyecto</span>
                </button>
              </div>
            </form>
          </div>

          {/* Projects Search and Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-white">
                Repositorios Registrados ({projectsList.length})
              </h3>
              <p className="text-xs text-slate-400">
                Visualiza, modifica parámetros y activa/pausa los repositorios disponibles.
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="Buscar repositorio..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>
          </div>

          {/* Projects List */}
          {projectsList.filter(
            (p) =>
              p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
              p.repo_url.toLowerCase().includes(projectSearch.toLowerCase())
          ).length === 0 ? (
            <div className="text-center py-12 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
              <FolderGit2 className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">No se encontraron repositorios</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectsList
                .filter(
                  (p) =>
                    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
                    p.repo_url.toLowerCase().includes(projectSearch.toLowerCase())
                )
                .map((p) => (
                  <div
                    key={p.id}
                    className={`bg-slate-900 border rounded-2xl p-5 shadow-xl space-y-3 transition-all ${
                      p.is_active ? "border-slate-800" : "border-slate-800/50 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-base">{p.name}</h4>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              p.is_active
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400 border border-slate-700"
                            }`}
                          >
                            {p.is_active ? "Activo" : "Pausado"}
                          </span>
                        </div>

                        <a
                          href={p.repo_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-mono"
                        >
                          {p.repo_url}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Toggle Active button */}
                        <button
                          onClick={() => handleToggleActiveProject(p)}
                          title={p.is_active ? "Pausar repositorio" : "Activar repositorio"}
                          className={`p-2 rounded-lg text-xs transition-colors ${
                            p.is_active
                              ? "text-emerald-400 hover:bg-emerald-500/10"
                              : "text-slate-500 hover:text-emerald-400 hover:bg-slate-800"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>

                        {/* Edit button */}
                        <button
                          onClick={() => handleStartEditProject(p)}
                          title="Modificar repositorio"
                          className="p-2 text-slate-400 hover:text-purple-300 rounded-lg hover:bg-purple-500/10 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteProject(p.id)}
                          title="Eliminar repositorio"
                          className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 bg-slate-950 p-3 rounded-xl border border-slate-800/80 font-mono">
                      <div className="flex items-center justify-between">
                        <span>Rama base: <strong className="text-slate-200">{p.default_branch}</strong></span>
                        <span>
                          {p.has_github_token ? (
                            <span className="text-emerald-400 font-medium">● PAT Configurado</span>
                          ) : (
                            <span className="text-amber-400 font-medium">○ Sin PAT Personal</span>
                          )}
                        </span>
                      </div>
                      {p.system_prompt_rules && (
                        <div className="mt-1 text-[11px] text-slate-400 italic border-t border-slate-900 pt-1">
                          Reglas: {p.system_prompt_rules}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: GEMINI AI SETTINGS */}
      {activeTab === "gemini" && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                Configuración de Google Gemini AI para el Runner en Docker
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Configura la clave de API y el modelo de IA que se utilizarán dentro de los contenedores Docker para interpretar prompts, aplicar cambios en código y crear Pull Requests en GitHub.
              </p>
            </div>

            {/* Current Status Badge */}
            <div className="flex items-center gap-3 p-4 bg-slate-950 rounded-xl border border-slate-800">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xs space-y-0.5">
                <div className="text-slate-200 font-semibold">
                  Estado:{" "}
                  {geminiConfig.configured ? (
                    <span className="text-emerald-400 font-bold">API Key Configurada ({geminiConfig.masked_key})</span>
                  ) : (
                    <span className="text-amber-400 font-bold">No configurada (Modo simulación activo)</span>
                  )}
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Modelo activo: <span className="text-indigo-400 font-bold">{geminiConfig.model}</span>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveGeminiSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Nueva Google Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder={geminiConfig.configured ? "••••••••••••••••••••••••••••••••" : "AIzaSy••••••••••••••••••••••••••••"}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Puedes obtenerla gratuitamente en <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline">Google AI Studio</a>.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Modelo de Gemini
                  </label>
                  <select
                    value={geminiModelInput}
                    onChange={(e) => setGeminiModelInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    <option value="gemini-3.6-flash">gemini-3.6-flash (Recomendado - Nueva Generación)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Ultra Rápido)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Razonamiento Complejo)</option>
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Legacy / Cuentas Antiguas)</option>
                  </select>
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Modelo invocado por el contenedor Docker para planificar y editar código.
                  </span>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingGemini || (!geminiKeyInput.trim() && geminiModelInput === geminiConfig.model)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-6 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 text-xs transition-all disabled:opacity-50"
                >
                  {savingGemini ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Guardar Configuración Gemini</span>
                </button>
              </div>
            </form>

            {/* Security Explanation */}
            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
              <strong className="text-slate-200 block">Aislamiento y Seguridad en Docker:</strong>
              <p>
                - La API Key de Gemini y los tokens de GitHub se inyectan únicamente como variables de entorno efímeras en memoria en el contenedor efímero <code className="text-indigo-400">vibe-runner</code>.
              </p>
              <p>
                - Nunca se guardan ni se commitean credenciales en los repositorios de GitHub.
              </p>
              <p>
                - Los cambios se aíslan dentro del workspace temporal del contenedor y se envían a GitHub únicamente en ramas nuevas dedicadas (<code className="text-emerald-400">vibe/task-*</code>).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PROJECT MODAL */}
      {editingProject && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-base">
                  Modificar Repositorio GitHub
                </h3>
              </div>
              <button
                onClick={() => setEditingProject(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Nombre del Proyecto
                </label>
                <input
                  type="text"
                  required
                  value={editProjName}
                  onChange={(e) => setEditProjName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  URL del Repositorio GitHub
                </label>
                <input
                  type="text"
                  required
                  value={editProjRepo}
                  onChange={(e) => setEditProjRepo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Rama Base por Defecto
                  </label>
                  <input
                    type="text"
                    required
                    value={editProjBranch}
                    onChange={(e) => setEditProjBranch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Actualizar PAT (Opcional)
                  </label>
                  <input
                    type="password"
                    value={editProjToken}
                    onChange={(e) => setEditProjToken(e.target.value)}
                    placeholder={editingProject.has_github_token ? "Mantener actual..." : "ghp_..."}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Reglas y Directrices para la IA
                </label>
                <textarea
                  rows={3}
                  value={editProjRules}
                  onChange={(e) => setEditProjRules(e.target.value)}
                  placeholder="Directrices técnicas que Gemini aplicará en este repositorio..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-purple-500 font-mono"
                />
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <input
                  type="checkbox"
                  id="editProjActive"
                  checked={editProjActive}
                  onChange={(e) => setEditProjActive(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="editProjActive" className="text-xs text-slate-300 select-none cursor-pointer">
                  Repositorio activo (visible y seleccionable para que los usuarios envíen prompts)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updatingProj || !editProjName.trim() || !editProjRepo.trim()}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-purple-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {updatingProj ? (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 5: QUOTAS & CONTEXTS */}
      {activeTab === "quotas" && (
        <div className="space-y-8">
          {/* Section 1: User Quotas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-indigo-400" />
                  <span>Control de Cuotas de Tokens (Ventana de 5 Horas)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Límites de consumo para mitigar envíos masivos de prompts. Se decrementan con el uso real reportado por Gemini.
                </p>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar usuario o email..."
                  value={quotaSearch}
                  onChange={(e) => setQuotaSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500 w-full sm:w-64"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Límite</th>
                    <th className="py-3 px-4">Consumido</th>
                    <th className="py-3 px-4">Restante</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Reinicio en</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {quotasList
                    .filter(
                      (q) =>
                        !quotaSearch ||
                        q.email.toLowerCase().includes(quotaSearch.toLowerCase()) ||
                        q.name.toLowerCase().includes(quotaSearch.toLowerCase())
                    )
                    .map((q) => (
                      <tr key={q.user_id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-white">{q.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{q.email}</div>
                          <span className="text-[10px] uppercase font-semibold text-slate-500">{q.role}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-200">
                          {q.token_quota_limit.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {q.tokens_used_in_window.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-white">
                              {q.tokens_remaining.toLocaleString()}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              ({q.percentage_used}%)
                            </span>
                          </div>
                          <div className="w-28 bg-slate-950 rounded-full h-1.5 mt-1.5 overflow-hidden border border-slate-800">
                            <div
                              className={`h-full rounded-full ${
                                q.percentage_used >= 100
                                  ? "bg-rose-500"
                                  : q.percentage_used >= 80
                                  ? "bg-amber-500"
                                  : "bg-indigo-500"
                              }`}
                              style={{ width: `${Math.min(100, q.percentage_used)}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {q.is_exceeded ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Agotada (429)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Disponible
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px]">
                          {formatTimeRemaining(q.seconds_until_reset)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleStartEditQuota(q)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleResetQuota(q.user_id, q.email)}
                              disabled={resettingQuotaId === q.user_id}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium border border-indigo-500/30 transition-colors disabled:opacity-50"
                              title="Reiniciar consumo a 0 y resetear ventana"
                            >
                              {resettingQuotaId === q.user_id ? "Reiniciando..." : "Reiniciar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: User Contexts */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                <span>Contextos Personales de Usuarios</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Vista de administración de todos los contextos creados por usuarios. Cada usuario sólo puede acceder a los suyos en su workspace.
              </p>
            </div>

            {adminContextsList.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl text-slate-400 text-xs">
                No hay contextos personales registrados todavía en la plataforma.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">ID</th>
                      <th className="py-3 px-4">Usuario ID</th>
                      <th className="py-3 px-4">Identificador</th>
                      <th className="py-3 px-4">Nombre y Descripción</th>
                      <th className="py-3 px-4">Tamaño</th>
                      <th className="py-3 px-4">Gemini Cache</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {adminContextsList.map((ctx) => (
                      <tr key={ctx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono text-slate-400">#{ctx.id}</td>
                        <td className="py-3.5 px-4 font-mono text-indigo-400">User #{ctx.user_id}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                            {ctx.identifier}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="font-medium text-white">{ctx.name}</div>
                          {ctx.description && (
                            <div className="text-[11px] text-slate-400 truncate">{ctx.description}</div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          <div>{ctx.character_count.toLocaleString()} chars</div>
                          <div className="text-[10px] text-slate-500">~{ctx.estimated_tokens.toLocaleString()} tokens</div>
                        </td>
                        <td className="py-3.5 px-4">
                          {ctx.gemini_cache_name ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                              Cached
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">Inyección estándar</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {new Date(ctx.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteAdminContext(ctx.id, ctx.name)}
                            disabled={deletingCtxId === ctx.id}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Eliminar contexto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Quota Modal */}
      {editingQuotaUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Coins className="w-5 h-5 text-indigo-400" />
                <span>Ajustar Cuota de Tokens</span>
              </div>
              <button
                onClick={() => setEditingQuotaUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <div className="text-white font-semibold">{editingQuotaUser.name}</div>
              <div className="text-slate-400 font-mono">{editingQuotaUser.email}</div>
              <div className="text-[11px] text-slate-500 mt-1">
                Actualmente usados: {editingQuotaUser.tokens_used_in_window.toLocaleString()} tokens
              </div>
            </div>

            <form onSubmit={handleSaveQuota} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                  Límite de Tokens por Ventana *
                </label>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  required
                  value={editQuotaLimit}
                  onChange={(e) => setEditQuotaLimit(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Por defecto son 100,000 tokens cada 5 horas.
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 uppercase tracking-wider">
                  Duración de la Ventana (Horas) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={72}
                  required
                  value={editQuotaHours}
                  onChange={(e) => setEditQuotaHours(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingQuotaUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingQuota}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {savingQuota ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Guardar Cuota</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

