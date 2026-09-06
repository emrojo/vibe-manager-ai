"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, ChatMessage, ChatThread, getToken } from "@/lib/api";
import { 
  MessageSquare, 
  Send, 
  User as UserIcon, 
  Clock, 
  ShieldCheck, 
  Search, 
  Circle,
  Sparkles
} from "lucide-react";

function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load threads
  const loadThreads = async () => {
    if (!user) return;
    try {
      const data = await apiRequest<ChatThread[]>("/chat/threads");
      setThreads(data);

      const queryUserId = searchParams.get("userId");
      if (queryUserId) {
        setSelectedUserId(Number(queryUserId));
      } else if (!selectedUserId && data.length > 0) {
        setSelectedUserId(data[0].other_user_id);
      }
    } catch (err) {
      console.error("Error cargando hilos de chat:", err);
    }
  };

  useEffect(() => {
    if (user) {
      loadThreads();
      const interval = setInterval(loadThreads, 8000);
      return () => clearInterval(interval);
    }
  }, [user]);

  // Load messages for active user
  const loadMessages = async (otherId: number) => {
    try {
      const data = await apiRequest<ChatMessage[]>(`/chat/messages/${otherId}`);
      setMessages(data);
    } catch (err) {
      console.error("Error cargando mensajes:", err);
    }
  };

  useEffect(() => {
    if (selectedUserId) {
      loadMessages(selectedUserId);
      const msgInterval = setInterval(() => loadMessages(selectedUserId), 4000);
      return () => clearInterval(msgInterval);
    }
  }, [selectedUserId]);

  // Connect WebSocket for real-time messaging
  useEffect(() => {
    const token = getToken();
    if (!token || !user) return;

    const wsUrl = `ws://localhost:8000/api/chat/ws?token=${token}`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            (msg.sender_id === selectedUserId && msg.recipient_id === user.id) ||
            (msg.sender_id === user.id && msg.recipient_id === selectedUserId)
          ) {
            setMessages((prev) => [...prev, msg]);
          }
          loadThreads();
        } catch (e) {
          console.error("Error procesando mensaje ws:", e);
        }
      };

      ws.onerror = (e) => {
        // Fallback to polling
      };

      return () => {
        ws.close();
      };
    } catch (e) {
      // WebSocket fallback
    }
  }, [user, selectedUserId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !selectedUserId) return;

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      const newMsg = await apiRequest<ChatMessage>("/chat/messages", {
        method: "POST",
        body: JSON.stringify({
          recipient_id: selectedUserId,
          content: textToSend,
        }),
      });
      setMessages((prev) => [...prev, newMsg]);
      loadThreads();
    } catch (err: any) {
      alert("Error al enviar mensaje: " + err.message);
    } finally {
      setSending(false);
    }
  };

  if (authLoading || !user) return null;

  const selectedThread = threads.find((t) => t.other_user_id === selectedUserId);
  const filteredThreads = threads.filter(
    (t) =>
      t.other_user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.other_user_email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <div className="flex flex-1 h-full overflow-hidden">
        
        {/* Sidebar: Threads list */}
        <div className="w-full sm:w-80 md:w-96 border-r border-slate-800 flex flex-col bg-slate-950/70 shrink-0">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              {user.role === "admin" ? "Bandeja de Mensajes" : "Chat con Administración"}
            </h2>

            {user.role === "admin" && (
              <div className="relative mt-3">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar usuario..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-850">
            {filteredThreads.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No hay conversaciones disponibles.
              </div>
            ) : (
              filteredThreads.map((thread) => {
                const isSelected = thread.other_user_id === selectedUserId;

                return (
                  <button
                    key={thread.other_user_id}
                    onClick={() => setSelectedUserId(thread.other_user_id)}
                    className={`w-full text-left p-3.5 transition-colors flex items-start gap-3 ${
                      isSelected
                        ? "bg-indigo-600/15 border-l-4 border-indigo-500"
                        : "hover:bg-slate-800/40 border-l-4 border-transparent"
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0 text-slate-300 font-bold text-xs">
                      {thread.other_user_name.charAt(0).toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200 truncate">
                          {thread.other_user_name}
                        </span>
                        {thread.unread_count > 0 && (
                          <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {thread.unread_count}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          {thread.other_user_email}
                        </span>
                        <span
                          className={`text-[9px] px-1 rounded uppercase font-semibold ${
                            thread.other_user_role === "admin"
                              ? "bg-purple-500/20 text-purple-300"
                              : thread.other_user_role === "validator"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-blue-500/20 text-blue-300"
                          }`}
                        >
                          {thread.other_user_role}
                        </span>
                      </div>

                      {thread.last_message && (
                        <p className="text-[11px] text-slate-400 truncate mt-1">
                          {thread.last_message}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Thread Area */}
        <div className="flex-1 flex flex-col bg-slate-900">
          {selectedThread ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow">
                    {selectedThread.other_user_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {selectedThread.other_user_name}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">
                      {selectedThread.other_user_email} • Rol: {selectedThread.other_user_role}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                    <Sparkles className="w-8 h-8 text-slate-600 mb-2" />
                    <span>Inicia la conversación enviando un mensaje.</span>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMe = m.sender_id === user.id;

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-md ${
                            isMe
                              ? "bg-indigo-600 text-white rounded-br-none"
                              : "bg-slate-800 text-slate-200 border border-slate-700/80 rounded-bl-none"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 px-1">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-950/60 flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={sending || !inputText.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs">
              Selecciona una conversación del panel izquierdo
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
