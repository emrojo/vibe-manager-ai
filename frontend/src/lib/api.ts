const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "validator" | "user";
  is_active: boolean;
  is_banned: boolean;
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

export interface PromptTask {
  id: number;
  project_id: number;
  project_name?: string;
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
  plan_validated_by_id?: number;
  plan_validator_name?: string;
  plan_validated_at?: string;
  plan_rejection_reason?: string;
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
