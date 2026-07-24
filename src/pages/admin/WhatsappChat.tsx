/**
 * /admin/whatsapp-chat — Chat in-app coi clienti via WhatsApp.
 *
 * Layout 2 colonne (WhatsApp Web-like):
 *  - Sidebar sinistra: lista conversazioni (ordinate per last_message_at,
 *    badge unread, search per phone/name)
 *  - Pannello destro: thread messaggi della conversation selezionata +
 *    input per scrivere
 *
 * Logica 24h customer service window:
 *  - Se last_inbound_at è entro 24h → possiamo inviare testo libero
 *  - Se > 24h o null → possiamo inviare solo template approvati
 *
 * Realtime:
 *  - Supabase Realtime su INSERT in whatsapp_messages → push istantaneo
 *    al frontend (sia inbound che outbound da altri utenti)
 *  - UPDATE per status changes (delivered/read)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useWaProvider } from "@/hooks/useWaProvider";
import {
  MessageCircle, Search, Send, Archive, ArchiveRestore, Clock,
  CheckCheck, Check, AlertTriangle, FileText, Phone, Loader2,
  ChevronLeft, Paperclip, X, Image as ImageIcon, File as FileIcon,
  Zap, UserCheck,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";

// ============================================================
// Tipi
// ============================================================

interface Conversation {
  id: string;
  phone: string;
  display_name: string | null;
  practice_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "inbound" | "outbound" | null;
  unread_count: number;
  last_inbound_at: string | null;
  is_archived: boolean;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatAssignee {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  template_name: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  error_message: string | null;
  sent_by_user_id: string | null;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface WhatsappTemplate {
  id: string;
  meta_template_name: string;
  language: string;
  status: string;
  body_text: string;
  is_active: boolean;
}

// ============================================================
// Pagina principale
// ============================================================

export default function WhatsappChat() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned">("all");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Chat WhatsApp</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Conversa direttamente coi clienti dall'app. Gli inbound popolano automaticamente le conversazioni.
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[500px]">
          {/* Sidebar conversazioni */}
          <ConversationsList
            selectedId={selectedId}
            onSelect={setSelectedId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(!showArchived)}
            filter={filter}
            onFilterChange={setFilter}
          />

          {/* Thread principale */}
          <div className="flex-1 flex flex-col min-w-0">
            {selectedId ? (
              <ChatThread conversationId={selectedId} onBack={() => setSelectedId(null)} />
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Sidebar conversazioni
// ============================================================

function ConversationsList({
  selectedId, onSelect, searchQuery, onSearchChange, showArchived, onToggleArchived,
  filter, onFilterChange,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  filter: "all" | "mine" | "unassigned";
  onFilterChange: (f: "all" | "mine" | "unassigned") => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["whatsapp-conversations", showArchived, filter, user?.id],
    queryFn: async (): Promise<Conversation[]> => {
      let q = supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("is_archived", showArchived)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (filter === "mine" && user?.id) {
        q = q.eq("assigned_to", user.id);
      } else if (filter === "unassigned") {
        q = q.is("assigned_to", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as Conversation[]) ?? [];
    },
  });

  // Realtime: aggiorna la lista quando arrivano nuovi messaggi o nuove conv.
  // L'invalidate è "broad" — invalida tutte le varianti di filtro
  // (whatsapp-conversations) così non perdiamo aggiornamenti quando l'utente
  // cambia filtro.
  //
  // Debounce 600ms: il canale riceve TUTTI gli eventi della tabella (no
  // filter server-side perché i conversation scope vanno valutati con RLS
  // + UI filter). Quando arriva un burst (es. import bulk di messaggi o
  // chat molto attiva con 5+ msg/s), il debounce evita N invalidate +
  // refetch back-to-back che bloccherebbero il rendering. Una invalidate
  // ogni 600ms è sufficiente per UX percepita di "aggiornamento live".
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const scheduleInvalidate = () => {
      if (timeoutId) return; // burst già pianificato
      timeoutId = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
        timeoutId = null;
      }, 600);
    };
    const channel = supabase
      .channel("whatsapp-conversations-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        scheduleInvalidate,
      )
      .subscribe();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      c.phone.toLowerCase().includes(q) ||
      (c.display_name?.toLowerCase().includes(q) ?? false) ||
      (c.last_message_preview?.toLowerCase().includes(q) ?? false),
    );
  }, [conversations, searchQuery]);

  return (
    <div className="w-80 border-r flex flex-col bg-slate-50/50 shrink-0">
      <div className="p-3 border-b bg-white space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per numero o nome..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        {/* Filtro assignment: Tutte / Le mie / Non assegnate */}
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md text-xs">
          <button
            onClick={() => onFilterChange("all")}
            className={`flex-1 px-2 py-1 rounded font-medium transition-colors ${
              filter === "all" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tutte
          </button>
          <button
            onClick={() => onFilterChange("mine")}
            className={`flex-1 px-2 py-1 rounded font-medium transition-colors ${
              filter === "mine" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Le mie
          </button>
          <button
            onClick={() => onFilterChange("unassigned")}
            className={`flex-1 px-2 py-1 rounded font-medium transition-colors ${
              filter === "unassigned" ? "bg-white shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Da assegnare
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleArchived}
          className="w-full justify-start text-xs gap-2"
        >
          {showArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
          {showArchived ? "Mostra attive" : "Mostra archiviate"}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-4 flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="p-6 text-center text-muted-foreground">
            <MessageCircle className="h-10 w-10 mx-auto opacity-30 mb-2" />
            <p className="text-sm">
              {showArchived ? "Nessuna conversazione archiviata" : "Nessuna conversazione attiva"}
            </p>
            <p className="text-xs mt-1">
              {!showArchived && "Le conversazioni compaiono quando un cliente scrive o quando invii un messaggio."}
            </p>
          </div>
        )}
        {filtered.map((conv) => (
          <ConversationRow
            key={conv.id}
            conv={conv}
            selected={conv.id === selectedId}
            onClick={() => onSelect(conv.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ConversationRow({ conv, selected, onClick }: {
  conv: Conversation;
  selected: boolean;
  onClick: () => void;
}) {
  const lastMsgTime = conv.last_message_at
    ? formatChatTime(new Date(conv.last_message_at))
    : "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 border-b hover:bg-slate-100 transition-colors ${
        selected ? "bg-emerald-50 hover:bg-emerald-50 border-l-4 border-l-emerald-500" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {conv.display_name || `+${conv.phone}`}
          </p>
          {conv.display_name && (
            <p className="text-[10px] text-muted-foreground font-mono">+{conv.phone}</p>
          )}
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="text-[10px] text-muted-foreground">{lastMsgTime}</span>
          {conv.unread_count > 0 && (
            <Badge className="h-4 min-w-4 px-1 text-[10px] bg-emerald-600">{conv.unread_count}</Badge>
          )}
        </div>
      </div>
      {conv.last_message_preview && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {conv.last_message_direction === "outbound" && (
            <CheckCheck className="h-3 w-3 shrink-0 text-emerald-500" />
          )}
          <p className="truncate">{conv.last_message_preview}</p>
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
        {conv.practice_id && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <FileText className="h-2.5 w-2.5" /> Pratica
          </Badge>
        )}
        {conv.assigned_to && (
          <Badge variant="outline" className="text-[10px] gap-1 border-emerald-300 text-emerald-700">
            <UserCheck className="h-2.5 w-2.5" /> Assegnata
          </Badge>
        )}
      </div>
    </button>
  );
}

// ============================================================
// Thread messaggi (pannello destro)
// ============================================================

function ChatThread({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carica conversation metadata
  const { data: conv } = useQuery({
    queryKey: ["whatsapp-conversation", conversationId],
    queryFn: async (): Promise<Conversation | null> => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("*")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data as Conversation | null;
    },
  });

  // Carica messaggi del thread (ultimi 200)
  const { data: messages } = useQuery({
    queryKey: ["whatsapp-messages", conversationId],
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data as Message[]) ?? [];
    },
  });

  // Realtime: insert/update messaggi di QUESTA conversation
  useEffect(() => {
    const channel = supabase
      .channel(`whatsapp-thread-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", conversationId] });
          queryClient.invalidateQueries({ queryKey: ["whatsapp-conversation", conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  // Marca come letta (azzera unread_count) quando entro nella conversation
  useEffect(() => {
    if (!conv || conv.unread_count === 0) return;
    supabase
      .from("whatsapp_conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(() => queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] }));
  }, [conv, conversationId, queryClient]);

  // Auto-scroll in fondo quando arrivano messaggi nuovi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 24h customer service window: posso scrivere testo libero?
  // Buffer di sicurezza 5min: il clock skew del browser vs server può causare
  // false positivi proprio al limite (utente clicca "invia" a 23:59:59,
  // server riceve a 00:00:01 e rifiuta). Meglio anticipare la chiusura
  // window di 5 min e suggerire un template prima del fallimento Meta.
  // Con provider OpenWA (whatsapp-web.js) la finestra NON esiste: testo
  // libero sempre consentito, come da WhatsApp normale.
  const { provider } = useWaProvider();
  const canSendFreeText = useMemo(() => {
    if (provider === "openwa") return true;
    if (!conv?.last_inbound_at) return false;
    const ageMs = Date.now() - new Date(conv.last_inbound_at).getTime();
    const WINDOW_MS = 24 * 3600 * 1000 - 5 * 60 * 1000; // 23h55m
    return ageMs < WINDOW_MS;
  }, [conv, provider]);

  const archiveMutation = useMutation({
    mutationFn: async (archived: boolean) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ is_archived: archived })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversation", conversationId] });
    },
  });

  if (!conv) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Header thread */}
      <div className="border-b p-3 flex items-center gap-3 bg-white">
        <Button variant="ghost" size="sm" onClick={onBack} className="lg:hidden">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {conv.display_name || `+${conv.phone}`}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span className="font-mono">+{conv.phone}</span>
            {conv.practice_id && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <FileText className="h-2.5 w-2.5" /> Pratica
              </Badge>
            )}
          </div>
        </div>

        {/* Assignment dropdown */}
        <AssignmentPicker
          conversationId={conversationId}
          assignedTo={conv.assigned_to}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => archiveMutation.mutate(!conv.is_archived)}
          disabled={archiveMutation.isPending}
          title={conv.is_archived ? "Riattiva" : "Archivia"}
        >
          {conv.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#e5ddd5]/30">
        {!messages || messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            Nessun messaggio ancora in questa conversazione.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              showDate={idx === 0 || !isSameDay(messages[idx - 1].sent_at, msg.sent_at)}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversationId}
        phone={conv.phone}
        practiceId={conv.practice_id}
        canSendFreeText={canSendFreeText}
        lastInboundAt={conv.last_inbound_at}
        userId={user?.id ?? null}
      />
    </>
  );
}

function MessageBubble({ msg, showDate }: { msg: Message; showDate: boolean }) {
  const isOutbound = msg.direction === "outbound";
  return (
    <>
      {showDate && (
        <div className="flex justify-center my-3">
          <span className="bg-white/80 text-[11px] text-muted-foreground px-2.5 py-1 rounded-full shadow-sm">
            {formatDateHeader(new Date(msg.sent_at))}
          </span>
        </div>
      )}
      <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
          isOutbound
            ? msg.status === "failed"
              ? "bg-red-100 text-red-900 border border-red-200"
              : "bg-emerald-100"
            : "bg-white"
        }`}>
          {msg.template_name && (
            <p className="text-[10px] text-muted-foreground mb-1 italic">
              Template: {msg.template_name}
            </p>
          )}
          {/* Media (sia inbound che outbound). Inbound vengono mirrorati su
              Supabase Storage dal webhook (signed URL 7 giorni), quindi
              media_url è valorizzato anche per loro. */}
          {msg.media_url && (
            <MediaPreview url={msg.media_url} mimeType={msg.media_mime_type} type={msg.message_type} />
          )}
          {!msg.media_url && msg.message_type !== "text" && msg.message_type !== "template" && msg.direction === "inbound" && (
            <div className="flex items-center gap-2 p-2 bg-slate-100 rounded text-xs">
              <FileIcon className="h-4 w-4 text-slate-500 shrink-0" />
              <span className="text-slate-700">Allegato: {msg.message_type} (download fallito)</span>
            </div>
          )}
          {msg.body ? (
            <p className="text-sm whitespace-pre-wrap break-words mt-1">{msg.body}</p>
          ) : !msg.media_url && msg.direction === "outbound" ? (
            <p className="text-xs text-muted-foreground italic">[{msg.message_type}]</p>
          ) : null}
          {msg.error_message && (
            <p className="text-[10px] text-red-700 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {msg.error_message}
            </p>
          )}
          <div className="flex items-center justify-end gap-1 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {format(new Date(msg.sent_at), "HH:mm")}
            </span>
            {isOutbound && <StatusIcon status={msg.status} />}
          </div>
        </div>
      </div>
    </>
  );
}

function MediaPreview({ url, mimeType, type }: { url: string; mimeType: string | null; type: string }) {
  const isImage = mimeType?.startsWith("image/") || type === "image";
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block max-w-xs">
        <img
          src={url}
          alt="Allegato"
          className="rounded-md max-h-64 w-auto object-cover"
          loading="lazy"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 p-2 bg-white/50 rounded text-xs hover:bg-white/80 transition-colors"
    >
      <FileIcon className="h-4 w-4 text-slate-600 shrink-0" />
      <span className="text-slate-700 underline">Apri allegato ({type})</span>
    </a>
  );
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "pending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-emerald-500" />;
    case "failed":
      return <AlertTriangle className="h-3 w-3 text-red-500" />;
    default:
      return null;
  }
}

// ============================================================
// Composer (input messaggio)
// ============================================================

function MessageComposer({
  conversationId, phone, practiceId, canSendFreeText, lastInboundAt, userId,
}: {
  conversationId: string;
  phone: string;
  practiceId: string | null;
  canSendFreeText: boolean;
  lastInboundAt: string | null;
  userId: string | null;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [templatePicker, setTemplatePicker] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendTextMutation = useMutation({
    mutationFn: async () => {
      if (!text.trim()) throw new Error("Messaggio vuoto");
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: phone,
          text_body: text.trim(),
          practice_id: practiceId ?? undefined,
          sent_by_user_id: userId ?? undefined,
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");
    },
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", conversationId] });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio fallito", description: err.message });
    },
  });

  // Upload media a Supabase Storage + invio a Meta via send-whatsapp.
  // Flow: file → storage (path unico) → signed URL 24h → send-whatsapp con
  // media_url. Meta scarica e re-uploada lato suo.
  const sendMediaMutation = useMutation({
    mutationFn: async () => {
      if (!pendingFile) throw new Error("Nessun file");
      const file = pendingFile;

      // 1. Determina media_type Meta da MIME
      const mime = file.type;
      let mediaType: "image" | "document" | "video" | "audio";
      if (mime.startsWith("image/")) mediaType = "image";
      else if (mime.startsWith("video/")) mediaType = "video";
      else if (mime.startsWith("audio/")) mediaType = "audio";
      else mediaType = "document";

      // 2. Validation: limiti ufficiali Meta WhatsApp Cloud API (v18+).
      // Ref: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
      //   image: 5 MB (jpg/png/webp)
      //   video: 16 MB (mp4/3gpp)
      //   audio: 16 MB (aac/m4a/amr/mp3/ogg)
      //   document: 100 MB (pdf/doc/xls/ppt/txt)
      const limits: Record<typeof mediaType, number> = {
        image: 5 * 1024 * 1024,
        video: 16 * 1024 * 1024,
        audio: 16 * 1024 * 1024,
        document: 100 * 1024 * 1024,
      };
      if (file.size > limits[mediaType]) {
        throw new Error(`File troppo grande (max ${Math.round(limits[mediaType] / 1024 / 1024)}MB per ${mediaType})`);
      }

      // 3. Upload a Supabase Storage. Path: convId/timestamp_filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${conversationId}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { contentType: mime, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      // 4. Signed URL (24h TTL — Meta scarica subito quindi basta)
      const { data: signed, error: signErr } = await supabase.storage
        .from("whatsapp-media")
        .createSignedUrl(path, 24 * 3600);
      if (signErr || !signed?.signedUrl) throw new Error("Impossibile generare signed URL");

      // 5. Invia a Meta via send-whatsapp
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: phone,
          media_type: mediaType,
          media_url: signed.signedUrl,
          media_caption: text.trim() || undefined,
          media_filename: mediaType === "document" ? file.name : undefined,
          practice_id: practiceId ?? undefined,
          sent_by_user_id: userId ?? undefined,
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");
    },
    onSuccess: () => {
      setPendingFile(null);
      setText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", conversationId] });
      toast({ title: "Allegato inviato" });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Invio allegato fallito", description: err.message });
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (pendingFile) sendMediaMutation.mutate();
      else if (canSendFreeText && text.trim()) sendTextMutation.mutate();
    }
  };

  const isUploading = sendMediaMutation.isPending;
  const isSendingText = sendTextMutation.isPending;
  const isBusy = isUploading || isSendingText;

  return (
    <div className="border-t p-3 bg-white space-y-2">
      {!canSendFreeText && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-900">Finestra 24h chiusa</p>
            <p className="text-amber-800 mt-0.5">
              {lastInboundAt
                ? `Ultimo messaggio del cliente: ${formatDistanceToNow(new Date(lastInboundAt), { addSuffix: true, locale: it })}. Per riaprire la chat puoi solo inviare un template approvato.`
                : "Il cliente non ha mai scritto. Puoi inviare solo template approvati per iniziare la conversazione."}
            </p>
          </div>
        </div>
      )}

      {/* File preview prima dell'invio */}
      {pendingFile && (
        <div className="rounded-md border bg-slate-50 p-2 flex items-center gap-2">
          {pendingFile.type.startsWith("image/") ? (
            <ImageIcon className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <FileIcon className="h-4 w-4 text-blue-600 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{pendingFile.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {(pendingFile.size / 1024).toFixed(1)} KB · {pendingFile.type || "tipo sconosciuto"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPendingFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            disabled={isBusy}
            className="h-7 w-7 p-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/ogg,video/mp4"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canSendFreeText || isBusy}
          title="Allega file"
          className="gap-1.5 h-9"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            pendingFile
              ? "Caption opzionale per l'allegato…"
              : canSendFreeText
                ? "Scrivi un messaggio…"
                : "Apri prima la chat con un template ↗"
          }
          disabled={(!canSendFreeText && !pendingFile) || isBusy}
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <QuickReplyPicker
              onPick={(body) => setText((cur) => cur ? `${cur}\n${body}` : body)}
              disabled={isBusy || !canSendFreeText}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplatePicker(true)}
              disabled={isBusy}
              title="Invia un template approvato"
              className="gap-1.5"
            >
              <FileText className="h-3.5 w-3.5" />
              Template
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (pendingFile) sendMediaMutation.mutate();
              else sendTextMutation.mutate();
            }}
            disabled={
              isBusy ||
              (!pendingFile && (!canSendFreeText || !text.trim()))
            }
            className="gap-1.5"
          >
            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Invia
          </Button>
        </div>
      </div>

      {templatePicker && (
        <TemplatePickerDialog
          phone={phone}
          practiceId={practiceId}
          userId={userId}
          conversationId={conversationId}
          onClose={() => setTemplatePicker(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// Dialog: scegli + invia template (fuori dalla finestra 24h)
// ============================================================

function TemplatePickerDialog({
  phone, practiceId, userId, conversationId, onClose,
}: {
  phone: string;
  practiceId: string | null;
  userId: string | null;
  conversationId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<WhatsappTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);

  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates-approved"],
    queryFn: async (): Promise<WhatsappTemplate[]> => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, meta_template_name, language, status, body_text, is_active")
        .eq("status", "APPROVED")
        .eq("is_active", true)
        .order("meta_template_name");
      if (error) throw error;
      return (data as WhatsappTemplate[]) ?? [];
    },
  });

  // Estrai placeholders dal body del template selezionato
  const placeholders = useMemo(() => {
    if (!selected) return [];
    const matches = selected.body_text.matchAll(/\{\{(\d+)\}\}/g);
    return Array.from(new Set(Array.from(matches).map((m) => parseInt(m[1], 10)))).sort((a, b) => a - b);
  }, [selected]);

  // Ridimensiona params quando placeholders cambia
  useEffect(() => {
    setParams(placeholders.map((_, i) => params[i] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeholders.length]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Nessun template selezionato");
      const parameters = params.filter((p) => p.trim().length > 0).map((text) => ({ type: "text", text }));
      const components = parameters.length > 0 ? [{ type: "body", parameters }] : [];
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          to: phone,
          template_name: selected.meta_template_name,
          language: selected.language,
          components,
          practice_id: practiceId ?? undefined,
          sent_by_user_id: userId ?? undefined,
        },
      });
      if (error) throw error;
      const res = data as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error ?? "Invio fallito");
    },
    onSuccess: () => {
      toast({ title: "Template inviato" });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", conversationId] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore invio", description: err.message });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invia template</DialogTitle>
          <DialogDescription>
            Scegli un template approvato. I template aprono la chat anche oltre la finestra 24h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setSelected(templates?.find((t) => t.id === e.target.value) ?? null)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">— scegli template —</option>
              {templates?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.meta_template_name} ({t.language})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              <div className="rounded-md bg-slate-50 border p-2.5 text-xs">
                <p className="font-medium mb-1">Body:</p>
                <pre className="whitespace-pre-wrap break-words text-[11px]">{selected.body_text}</pre>
              </div>

              {placeholders.map((n, i) => (
                <div key={n}>
                  <label className="text-xs font-medium">{`{{${n}}}`}</label>
                  <Input
                    value={params[i] ?? ""}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = e.target.value;
                      setParams(next);
                    }}
                    placeholder={`Valore per {{${n}}}`}
                    className="text-xs"
                  />
                </div>
              ))}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!selected || sendMutation.isPending}
            className="gap-2"
          >
            {sendMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Invia template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Quick reply picker (popover con lista canned responses)
// ============================================================

interface QuickReply {
  id: string;
  label: string;
  body: string;
  category: string | null;
  sort_order: number;
  usage_count: number;
}

function QuickReplyPicker({ onPick, disabled }: { onPick: (body: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: replies } = useQuery({
    queryKey: ["whatsapp-quick-replies"],
    queryFn: async (): Promise<QuickReply[]> => {
      const { data, error } = await supabase
        .from("whatsapp_quick_replies")
        .select("id, label, body, category, sort_order, usage_count")
        .eq("is_active", true)
        .order("sort_order")
        .order("label");
      if (error) throw error;
      return (data as QuickReply[]) ?? [];
    },
  });

  // Raggruppa per categoria
  const grouped = useMemo(() => {
    if (!replies) return new Map<string, QuickReply[]>();
    const q = search.trim().toLowerCase();
    const filtered = q
      ? replies.filter((r) =>
          r.label.toLowerCase().includes(q) ||
          r.body.toLowerCase().includes(q) ||
          (r.category?.toLowerCase().includes(q) ?? false),
        )
      : replies;
    const map = new Map<string, QuickReply[]>();
    for (const r of filtered) {
      const cat = r.category ?? "Senza categoria";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(r);
    }
    return map;
  }, [replies, search]);

  const handlePick = async (r: QuickReply) => {
    onPick(r.body);
    setOpen(false);
    setSearch("");
    // Fire-and-forget: incrementa usage_count (per ordering smart futuro)
    try {
      await supabase.rpc("increment_quick_reply_usage" as never, { _id: r.id } as never);
    } catch {
      // non-blocking
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          title="Risposta rapida"
          className="gap-1.5"
        >
          <Zap className="h-3.5 w-3.5" />
          Rapide
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Cerca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-2 space-y-3">
          {grouped.size === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {(replies?.length ?? 0) === 0
                ? "Nessuna risposta rapida configurata. Aggiungile da /admin/whatsapp-quick-replies."
                : "Nessun risultato."}
            </p>
          )}
          {Array.from(grouped.entries()).map(([cat, items]) => (
            <div key={cat} className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-1.5">{cat}</p>
              {items.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handlePick(r)}
                  className="w-full text-left p-2 rounded hover:bg-slate-100 transition-colors group"
                >
                  <p className="text-xs font-medium">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 group-hover:text-foreground">{r.body}</p>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Assignment picker: assegna la chat a un utente staff
// ============================================================

function AssignmentPicker({ conversationId, assignedTo }: {
  conversationId: string;
  assignedTo: string | null;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: assignees } = useQuery({
    queryKey: ["chat-assignees"],
    queryFn: async (): Promise<ChatAssignee[]> => {
      const { data, error } = await supabase.rpc("list_chat_assignees" as never);
      if (error) throw error;
      return (data as ChatAssignee[]) ?? [];
    },
    enabled: open, // carica solo quando aprono il dropdown
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string | null) => {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ assigned_to: userId })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversation", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Errore assegnazione", description: err.message });
    },
  });

  const currentAssignee = assignees?.find((a) => a.user_id === assignedTo);
  const assignedToMe = assignedTo === user?.id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          title="Assegna chat"
        >
          <UserCheck className={`h-3.5 w-3.5 ${assignedTo ? "text-emerald-600" : "text-muted-foreground"}`} />
          {assignedToMe ? (
            <span className="text-xs">A te</span>
          ) : currentAssignee ? (
            <span className="text-xs max-w-[100px] truncate">
              {currentAssignee.full_name?.split(" ")[0] ?? currentAssignee.email.split("@")[0]}
            </span>
          ) : (
            <span className="text-xs">Assegna</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="end">
        <div className="space-y-0.5">
          {/* Quick action: prendi in carico */}
          {user?.id && assignedTo !== user.id && (
            <button
              onClick={() => assignMutation.mutate(user.id!)}
              disabled={assignMutation.isPending}
              className="w-full text-left px-2 py-1.5 rounded text-xs font-medium hover:bg-emerald-50 text-emerald-700 flex items-center gap-2"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Prendi in carico
            </button>
          )}
          {/* Rimuovi assegnazione */}
          {assignedTo && (
            <button
              onClick={() => assignMutation.mutate(null)}
              disabled={assignMutation.isPending}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-100 text-muted-foreground"
            >
              ✕ Rimuovi assegnazione
            </button>
          )}
          <div className="h-px bg-slate-200 my-1" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold px-2 py-1">
            Assegna a
          </p>
          {!assignees && (
            <div className="px-2 py-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Caricamento…
            </div>
          )}
          {assignees && assignees.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-2">Nessun utente staff disponibile</p>
          )}
          {assignees?.map((a) => (
            <button
              key={a.user_id}
              onClick={() => assignMutation.mutate(a.user_id)}
              disabled={assignMutation.isPending || a.user_id === assignedTo}
              className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-slate-100 flex items-center justify-between gap-2 ${
                a.user_id === assignedTo ? "bg-emerald-50 text-emerald-700" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{a.full_name ?? a.email.split("@")[0]}</p>
                <p className="text-[10px] text-muted-foreground truncate">{a.email}</p>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">
                {a.role === "super_admin" ? "admin" : a.role}
              </Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Empty state
// ============================================================

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 text-muted-foreground">
      <div className="text-center max-w-sm px-6">
        <MessageCircle className="h-16 w-16 mx-auto opacity-20 mb-4" />
        <h2 className="text-base font-medium mb-1">Seleziona una conversazione</h2>
        <p className="text-sm">
          Le conversazioni compaiono automaticamente quando un cliente scrive al numero WhatsApp Business o quando invii un messaggio.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Utility date formatting
// ============================================================

function formatChatTime(d: Date): string {
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMM", { locale: it });
}

function formatDateHeader(d: Date): string {
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}
