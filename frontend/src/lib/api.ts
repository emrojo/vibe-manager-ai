const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  is_banned: boolean;
  is_admin?: boolean;
  is_project_validator?: boolean;
  validated_repos_count?: number;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  repo_url: string;
  default_branch: string;
  system_prompt_rules?: string;
  is_active: boolean;
  has_github_token: boolean;
  created_at: string;
}

export interface RepoValidator {
  id: number;
  repo_url: string;
  repo_name: string;
  default_branch: string;
  user_id: number;
  validator_name?: string;
  validator_email?: string;
  project_id?: number;
  is_active: boolean;
  has_github_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface RepoTargetOption {
  id: number; // repo_validator_id (0 for legacy project)
  project_id: number;
  repo_url: string;
  repo_name: string;
  default_branch: string;
  validator_id: number;
  validator_name: string;
  validator_email: string;
  display_label: string;
}

export interface RepoValidatorCreate {
  repo_url: string;
  github_token: string;
  default_branch?: string;
  name?: string;
}

export interface PromptTask {
  id: number;
  project_id: number;
  project_name?: string;
  repo_url?: string;
  repo_validator_id?: number;
  assigned_validator_id?: number;
  assigned_validator_name?: string;
  assigned_validator_email?: string;
  user_id: number;
  user_name?: string;
  user_email?: string;
  original_prompt: string;
  edited_prompt?: string;
  status: "PENDING" | "APPROVED" | "PLAN_PENDING" | "PLAN_APPROVED" | "REJECTED" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
  rejection_reason?: string;
  validated_by_id?: number;
  validator_name?: string;
  branch_name?: string;
  commit_message?: string;
  pr_url?: string;
  pr_number?: number;
  execution_stage?: string;
  execution_logs?: string;
  error_message?: string;
  plan_content?: string;
  plan_feedback?: string;
  plan_validated_by_id?: number;
  plan_validator_name?: string;
  plan_validated_at?: string;
  plan_rejection_reason?: string;
  context_id?: number;
  context_name?: string;
  tokens_used?: number;
  tokens_fixed_context?: number;
  tokens_temporal_context?: number;
  temporal_context?: string;
  temporal_context_status?: "ACTIVE" | "MERGED" | "DISCARDED" | string;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: number;
  code: string;
  token: string;
  invite_url: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  whatsapp_share_url: string;
  email_share_url: string;
}

export interface ChatMessage {
  id: number;
  sender_id: number;
  recipient_id: number;
  sender_name?: string;
  recipient_name?: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

export interface ChatThread {
  other_user_id: number;
  other_user_name: string;
  other_user_email: string;
  other_user_role: string;
  unread_count: number;
  last_message?: string;
  last_message_at?: string;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vibe_token");
}

export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("vibe_token", token);
  }
}

export function removeToken() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("vibe_token");
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = "Error en la petición";
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || JSON.stringify(errorJson);
    } catch {
      errorDetail = await response.text() || response.statusText;
    }
    throw new Error(errorDetail);
  }

  return response.json();
}

export async function modifyTaskPlan(
  taskId: number,
  payload: { edited_plan?: string; modification_prompt: string }
): Promise<PromptTask> {
  return apiRequest<PromptTask>(`/validation/tasks/${taskId}/modify-plan`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UserContext {
  id: number;
  user_id: number;
  repo_validator_id?: number;
  validator_name?: string;
  identifier: string;
  name: string;
  description?: string;
  context_text: string;
  status?: string;
  version?: number;
  edited_text?: string;
  accepted_text?: string;
  plan_markdown?: string;
  plan_feedback?: string;
  rejection_reason?: string;
  character_count: number;
  estimated_tokens: number;
  gemini_cache_name?: string;
  gemini_cache_expire_time?: string;
  created_at: string;
  updated_at: string;
}

export interface UserContextCreate {
  identifier: string;
  name: string;
  description?: string;
  context_text: string;
  repo_validator_id?: number;
}

export interface UserTokenLog {
  id: number;
  user_id: number;
  task_id?: number;
  context_id?: number;
  tokens_prompt: number;
  tokens_fixed_context?: number;
  tokens_temporal_context?: number;
  tokens_completion: number;
  tokens_total: number;
  tokens_cached: number;
  created_at: string;
}

export interface UserQuotaStatus {
  user_id: number;
  email: string;
  token_quota_limit: number;
  tokens_used_in_window: number;
  tokens_remaining: number;
  percentage_used: number;
  quota_window_hours: number;
  quota_window_start: string;
  seconds_until_reset: number;
  is_exceeded: boolean;
  recent_logs: UserTokenLog[];
}

export interface AdminUserQuota {
  user_id: number;
  email: string;
  name: string;
  role: string;
  token_quota_limit: number;
  tokens_used_in_window: number;
  tokens_remaining: number;
  percentage_used: number;
  quota_window_hours: number;
  quota_window_start?: string;
  seconds_until_reset: number;
  is_exceeded: boolean;
}

export interface AdminUserQuotaUpdate {
  token_quota_limit?: number;
  quota_window_hours?: number;
}

export async function getUserQuota(): Promise<UserQuotaStatus> {
  return apiRequest<UserQuotaStatus>("/quotas/my-quota");
}

export async function getUserContexts(): Promise<UserContext[]> {
  return apiRequest<UserContext[]>("/contexts");
}

export async function getAcceptedUserContexts(): Promise<UserContext[]> {
  return apiRequest<UserContext[]>("/contexts/accepted");
}

export interface ActiveTemporalTask {
  id: number;
  original_prompt: string;
  status: string;
  context_id?: number;
  tokens_estimated: number;
  character_count: number;
  created_at: string;
}

export async function getActiveTemporalTasks(): Promise<ActiveTemporalTask[]> {
  return apiRequest<ActiveTemporalTask[]>("/contexts/temporal/active");
}

export async function createUserContext(data: UserContextCreate): Promise<UserContext> {
  return apiRequest<UserContext>("/contexts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteUserContext(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/contexts/${id}`, {
    method: "DELETE",
  });
}

export interface ContextEstimateResponse {
  prompt_chars: number;
  prompt_tokens_estimated: number;
  context_chars: number;
  context_tokens_estimated: number;
  temporal_chars?: number;
  temporal_tokens_estimated?: number;
  cached_tokens_estimated?: number;
  total_chars: number;
  total_tokens_estimated: number;
  fits_in_quota: boolean;
  remaining_quota_tokens: number;
}

export async function estimateContextTokens(data: {
  prompt: string;
  context_id?: number | null;
  context_text?: string | null;
  temporal_task_id?: number | null;
  temporal_context_text?: string | null;
}): Promise<ContextEstimateResponse> {
  return apiRequest<ContextEstimateResponse>("/contexts/estimate", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getAdminQuotas(): Promise<AdminUserQuota[]> {
  return apiRequest<AdminUserQuota[]>("/admin/quotas");
}

export async function updateAdminUserQuota(userId: number, data: AdminUserQuotaUpdate): Promise<AdminUserQuota> {
  return apiRequest<AdminUserQuota>(`/admin/quotas/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function resetAdminUserQuota(userId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/admin/quotas/${userId}/reset`, {
    method: "POST",
  });
}

export async function getAdminContexts(): Promise<UserContext[]> {
  return apiRequest<UserContext[]>("/admin/contexts");
}

export async function deleteAdminContext(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/admin/contexts/${id}`, {
    method: "DELETE",
  });
}

