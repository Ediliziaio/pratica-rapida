import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay,
  addWeeks, subWeeks, addMonths, subMonths, startOfMonth, endOfMonth,
  isToday, differenceInMinutes, parseISO, startOfDay, addDays,
  isSameMonth, addMinutes, addHours,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, Phone, Calendar,
  Video, Clock, Mail, AlignLeft, CheckCircle, XCircle,
  PhoneOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { CallBooking } from "@/integrations/supabase/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type BookingStatus = CallBooking["status"];
type ViewMode = "month" | "week" | "day";
type EventType = "call" | "appointment";

interface CalEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: EventType;
  // call-specific
  callStatus?: BookingStatus;
  clienteEmail?: string;
  clienteTelefono?: string | null;
  callNotes?: string | null;
  durationMinutes?: number;
  // appointment-specific
  description?: string | null;
  meetLink?: string | null;
  clientEmail?: string | null;
}

interface LayoutedEvent extends CalEvent {
  col: number;
  cols: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_H = 64; // px per hour
const DAY_START = 7;
const DAY_END = 21;
const HOURS = Array.from({ length: DAY_END - DAY_START }, (_, i) => i + DAY_START);

const CALL_COLORS: Record<BookingStatus, string> = {
  pending:   "bg-amber-400  border-amber-500  text-white",
  confirmed: "bg-blue-500   border-blue-600   text-white",
  completed: "bg-emerald-500 border-emerald-600 text-white",
  cancelled: "bg-gray-400   border-gray-500   text-white",
  no_show:   "bg-red-400    border-red-500    text-white",
};

const CALL_STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "In attesa", confirmed: "Confermato", completed: "Completato",
  cancelled: "Annullato", no_show: "Non presentato",
};

const APPT_COLOR = "bg-violet-500 border-violet-600 text-white";

function eventColorClass(ev: CalEvent) {
  return ev.type === "call" && ev.callStatus
    ? CALL_COLORS[ev.callStatus]
    : APPT_COLOR;
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function layoutDay(events: CalEvent[]): LayoutedEvent[] {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const cols: CalEvent[][] = [];
  for (const ev of sorted) {
    let placed = false;
    for (const col of cols) {
      if (col[col.length - 1].end <= ev.start) { col.push(ev); placed = true; break; }
    }
    if (!placed) cols.push([ev]);
  }
  const result: LayoutedEvent[] = [];
  for (let c = 0; c < cols.length; c++)
    for (const ev of cols[c])
      result.push({ ...ev, col: c, cols: cols.length });
  return result;
}

function topPx(start: Date) {
  return (start.getHours() - DAY_START + start.getMinutes() / 60) * HOUR_H;
}

function heightPx(start: Date, end: Date) {
  return Math.max((differenceInMinutes(end, start) / 60) * HOUR_H, 22);
}

function toLocalDT(d: Date) {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Small event pill used in month view */
function EventPill({ ev, onClick }: { ev: CalEvent; onClick: () => void }) {
  const bg = ev.type === "call" && ev.callStatus
    ? CALL_COLORS[ev.callStatus].split(" ")[0]
    : "bg-violet-500";
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate text-white font-medium ${bg} hover:opacity-90 transition-opacity`}
    >
      <span className="opacity-80 mr-1">{format(ev.start, "HH:mm")}</span>
      {ev.title}
    </button>
  );
}

/** Positioned block in week/day time grid */
function EventBlock({ ev, onClick }: { ev: LayoutedEvent; onClick: () => void }) {
  const top = topPx(ev.start);
  const height = heightPx(ev.start, ev.end);
  const color = eventColorClass(ev);
  const w = `calc(${100 / ev.cols}% - 2px)`;
  const left = `calc(${(ev.col / ev.cols) * 100}% + 1px)`;

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: "absolute", top: `${top}px`, height: `${height}px`, width: w, left }}
      className={`rounded-md px-1.5 py-1 text-left overflow-hidden border ${color} hover:opacity-90 transition-opacity cursor-pointer z-10 flex flex-col shadow-sm`}
    >
      <span className="text-[11px] font-semibold leading-tight truncate">{ev.title}</span>
      {height > 34 && (
        <span className="text-[10px] opacity-80 leading-tight">
          {format(ev.start, "HH:mm")}–{format(ev.end, "HH:mm")}
        </span>
      )}
    </button>
  );
}

/** Red line at current time */
function NowLine() {
  const now = new Date();
  const top = topPx(now);
  if (top < 0 || top > HOURS.length * HOUR_H) return null;
  return (
    <div
      style={{ position: "absolute", top: `${top}px`, left: 0, right: 0, zIndex: 20 }}
      className="flex items-center pointer-events-none"
    >
      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
      <div className="flex-1 h-[2px] bg-red-500" />
    </div>
  );
}

/** Shared time-grid columns (used by week + day views) */
function TimeGrid({
  days, eventsByDay, onSlotClick, onEventClick,
}: {
  days: Date[];
  eventsByDay: Map<string, LayoutedEvent[]>;
  onSlotClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  return (
    <div className="flex flex-1 min-w-0">
      {/* Hour labels */}
      <div className="w-14 shrink-0 border-r">
        {HOURS.map(h => (
          <div key={h} style={{ height: `${HOUR_H}px` }}
            className="relative flex items-start justify-end pr-2">
            <span className="text-[10px] text-muted-foreground font-mono -translate-y-2">
              {String(h).padStart(2, "0")}:00
            </span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      {days.map((day, di) => {
        const key = format(day, "yyyy-MM-dd");
        const laid = eventsByDay.get(key) ?? [];
        return (
          <div key={di} className={`flex-1 relative border-l min-w-0 ${isToday(day) ? "bg-blue-50/30 dark:bg-blue-900/10" : ""}`}>
            {/* Hour bands */}
            {HOURS.map(h => (
              <div key={h}
                style={{ height: `${HOUR_H}px` }}
                className="border-b border-border/40 cursor-pointer hover:bg-accent/20 transition-colors"
                onClick={() => {
                  const d = new Date(day);
                  d.setHours(h, 0, 0, 0);
                  onSlotClick(d);
                }}
              />
            ))}
            {/* Events + now line */}
            <div className="absolute inset-0 px-0.5 pointer-events-none">
              <div className="relative h-full pointer-events-auto">
                {laid.map(ev => (
                  <EventBlock key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
                ))}
                {isToday(day) && <NowLine />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ events, currentDate, onSlotClick, onEventClick }: {
  events: CalEvent[];
  currentDate: Date;
  onSlotClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, LayoutedEvent[]>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      const dayEvs = events.filter(e => isSameDay(e.start, day));
      map.set(key, layoutDay(dayEvs));
    }
    return map;
  }, [events, days]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, topPx(new Date()) - 100);
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Day headers */}
      <div className="flex shrink-0 border-b bg-background">
        <div className="w-14 shrink-0" />
        {days.map((day, i) => {
          const t = isToday(day);
          return (
            <div key={i} className="flex-1 py-2 text-center border-l">
              <p className="text-[11px] font-medium uppercase text-muted-foreground">
                {format(day, "EEE", { locale: it })}
              </p>
              <div className={`mx-auto mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${t ? "bg-blue-600 text-white" : "text-foreground"}`}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto min-h-0">
        <TimeGrid days={days} eventsByDay={eventsByDay} onSlotClick={onSlotClick} onEventClick={onEventClick} />
      </div>
    </div>
  );
}

// ── Day View ──────────────────────────────────────────────────────────────────

function DayView({ events, currentDate, onSlotClick, onEventClick }: {
  events: CalEvent[];
  currentDate: Date;
  onSlotClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const eventsByDay = useMemo(() => {
    const key = format(currentDate, "yyyy-MM-dd");
    return new Map([[key, layoutDay(events.filter(e => isSameDay(e.start, currentDate)))]]);
  }, [events, currentDate]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, topPx(new Date()) - 100);
    }
  }, []);

  const t = isToday(currentDate);
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div className="flex shrink-0 border-b bg-background">
        <div className="w-14 shrink-0" />
        <div className="flex-1 py-2 text-center border-l">
          <p className="text-[11px] font-medium uppercase text-muted-foreground">
            {format(currentDate, "EEEE", { locale: it })}
          </p>
          <div className={`mx-auto mt-0.5 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${t ? "bg-blue-600 text-white" : "text-foreground"}`}>
            {format(currentDate, "d")}
          </div>
        </div>
      </div>
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto min-h-0">
        <TimeGrid days={[currentDate]} eventsByDay={eventsByDay} onSlotClick={onSlotClick} onEventClick={onEventClick} />
      </div>
    </div>
  );
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({ events, currentDate, onDayClick, onEventClick }: {
  events: CalEvent[];
  currentDate: Date;
  onDayClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  const mStart = startOfMonth(currentDate);
  const mEnd   = endOfMonth(currentDate);
  const gStart = startOfWeek(mStart, { weekStartsOn: 1 });
  const gEnd   = endOfWeek(mEnd,   { weekStartsOn: 1 });
  const allDays = eachDayOfInterval({ start: gStart, end: gEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
  const DAY_NAMES = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Day-name header */}
      <div className="grid grid-cols-7 shrink-0 border-b bg-background">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks grid */}
      <div className="flex-1 overflow-y-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-0" style={{ minHeight: "100px" }}>
            {week.map((day, di) => {
              const t = isToday(day);
              const inMonth = isSameMonth(day, currentDate);
              const dayEvs = events
                .filter(e => isSameDay(e.start, day))
                .sort((a, b) => a.start.getTime() - b.start.getTime());
              const visible = dayEvs.slice(0, 3);
              const more = dayEvs.length - 3;

              return (
                <div
                  key={di}
                  className={`border-l p-1 cursor-pointer hover:bg-accent/20 transition-colors ${!inMonth ? "bg-muted/20" : ""}`}
                  onClick={() => onDayClick(day)}
                >
                  <div className="flex justify-end mb-1">
                    <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${t ? "bg-blue-600 text-white" : inMonth ? "text-foreground" : "text-muted-foreground/40"}`}>
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {visible.map(ev => (
                      <EventPill key={ev.id} ev={ev} onClick={() => onEventClick(ev)} />
                    ))}
                    {more > 0 && (
                      <button
                        className="w-full text-left text-[11px] text-muted-foreground hover:text-foreground px-1"
                        onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                      >
                        +{more} altri
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Event Detail Dialog ───────────────────────────────────────────────────────

function EventDetailDialog({ ev, onClose, onStatusChange }: {
  ev: CalEvent | null;
  onClose: () => void;
  onStatusChange: (id: string, s: BookingStatus) => void;
}) {
  if (!ev) return null;
  const dotBg = ev.type === "call" && ev.callStatus
    ? CALL_COLORS[ev.callStatus].split(" ")[0]
    : "bg-violet-500";

  return (
    <Dialog open={!!ev} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className={`w-3 h-3 rounded-sm mt-1.5 shrink-0 ${dotBg}`} />
            <DialogTitle className="text-base leading-snug">{ev.title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {format(ev.start, "EEEE d MMMM yyyy", { locale: it })}
              {", "}{format(ev.start, "HH:mm")}–{format(ev.end, "HH:mm")}
            </span>
          </div>

          {ev.type === "call" && (
            <>
              {ev.clienteEmail && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-4 w-4 shrink-0" /><span>{ev.clienteEmail}</span>
                </div>
              )}
              {ev.clienteTelefono && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-4 w-4 shrink-0" /><span>{ev.clienteTelefono}</span>
                </div>
              )}
              {ev.callNotes && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <AlignLeft className="h-4 w-4 shrink-0 mt-0.5" /><span>{ev.callNotes}</span>
                </div>
              )}
              {ev.callStatus && (
                <Badge className={`${CALL_COLORS[ev.callStatus].replace("text-white", "")} text-white border text-xs`}>
                  {CALL_STATUS_LABEL[ev.callStatus]}
                </Badge>
              )}
            </>
          )}

          {ev.type === "appointment" && (
            <>
              {ev.description && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <AlignLeft className="h-4 w-4 shrink-0 mt-0.5" /><span>{ev.description}</span>
                </div>
              )}
              {ev.meetLink && (
                <a href={ev.meetLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-500 hover:underline">
                  <Video className="h-4 w-4 shrink-0" />Partecipa a Google Meet
                </a>
              )}
            </>
          )}
        </div>

        {/* Status actions (calls only) */}
        {ev.type === "call" && ev.callStatus && (
          <div className="flex flex-wrap gap-2 pt-3 border-t">
            {ev.callStatus === "pending" && (
              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => { onStatusChange(ev.id, "confirmed"); onClose(); }}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" />Conferma
              </Button>
            )}
            {(ev.callStatus === "pending" || ev.callStatus === "confirmed") && (
              <>
                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => { onStatusChange(ev.id, "completed"); onClose(); }}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />Completata
                </Button>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                  onClick={() => { onStatusChange(ev.id, "cancelled"); onClose(); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />Annulla
                </Button>
                <Button size="sm" variant="outline" className="text-muted-foreground"
                  onClick={() => { onStatusChange(ev.id, "no_show"); onClose(); }}>
                  <PhoneOff className="h-3.5 w-3.5 mr-1" />No-show
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Event Dialog ───────────────────────────────────────────────────────

interface CallForm {
  cliente_nome: string; cliente_email: string; cliente_telefono: string;
  slot_datetime: string; duration_minutes: number; notes: string;
}
interface ApptForm {
  title: string; description: string; start_datetime: string;
  end_datetime: string; meet_link_enabled: boolean; client_email: string;
}

function CreateEventDialog({ open, onOpenChange, initialDate, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDate: Date | null;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<EventType>("call");
  const [submitting, setSubmitting] = useState(false);

  const [callForm, setCallForm] = useState<CallForm>({
    cliente_nome: "", cliente_email: "", cliente_telefono: "",
    slot_datetime: "", duration_minutes: 30, notes: "",
  });
  const [apptForm, setApptForm] = useState<ApptForm>({
    title: "", description: "", start_datetime: "", end_datetime: "",
    meet_link_enabled: false, client_email: "",
  });

  useEffect(() => {
    if (open) {
      const ds = initialDate ? toLocalDT(initialDate) : "";
      const de = initialDate ? toLocalDT(addHours(initialDate, 1)) : "";
      setCallForm({ cliente_nome: "", cliente_email: "", cliente_telefono: "", slot_datetime: ds, duration_minutes: 30, notes: "" });
      setApptForm({ title: "", description: "", start_datetime: ds, end_datetime: de, meet_link_enabled: false, client_email: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (type === "call") {
        if (!callForm.cliente_nome || !callForm.cliente_email || !callForm.slot_datetime) {
          toast({ variant: "destructive", title: "Compila i campi obbligatori" });
          return;
        }
        const { error } = await supabase.from("call_bookings").insert({
          cliente_nome: callForm.cliente_nome,
          cliente_email: callForm.cliente_email,
          cliente_telefono: callForm.cliente_telefono || null,
          slot_datetime: new Date(callForm.slot_datetime).toISOString(),
          duration_minutes: callForm.duration_minutes,
          notes: callForm.notes || null,
          status: "pending",
          reminder_sent: false,
        });
        if (error) throw error;
      } else {
        if (!apptForm.title.trim()) {
          toast({ variant: "destructive", title: "Titolo obbligatorio" });
          return;
        }
        const { error } = await supabase.functions.invoke("google-calendar/create-event", {
          body: {
            title: apptForm.title.trim(),
            description: apptForm.description.trim() || undefined,
            start_datetime: apptForm.start_datetime || undefined,
            end_datetime: apptForm.end_datetime || undefined,
            meet_link_enabled: apptForm.meet_link_enabled,
            client_email: apptForm.client_email.trim() || undefined,
          },
        });
        if (error) throw error;
      }
      toast({ title: type === "call" ? "Chiamata prenotata" : "Appuntamento creato" });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast({ variant: "destructive", title: "Errore", description: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo evento</DialogTitle>
        </DialogHeader>

        {/* Type toggle */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(["call", "appointment"] as EventType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${type === t ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "call" ? <Phone className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
              {t === "call" ? "Chiamata" : "Appuntamento"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {type === "call" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nome cliente <span className="text-destructive">*</span></Label>
                <Input value={callForm.cliente_nome} onChange={e => setCallForm({ ...callForm, cliente_nome: e.target.value })} placeholder="Mario Rossi" />
              </div>
              <div className="space-y-1">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={callForm.cliente_email} onChange={e => setCallForm({ ...callForm, cliente_email: e.target.value })} placeholder="mario@email.it" />
              </div>
              <div className="space-y-1">
                <Label>Telefono</Label>
                <Input value={callForm.cliente_telefono} onChange={e => setCallForm({ ...callForm, cliente_telefono: e.target.value })} placeholder="+39 333 0000000" />
              </div>
              <div className="space-y-1">
                <Label>Data e ora <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={callForm.slot_datetime} onChange={e => setCallForm({ ...callForm, slot_datetime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Durata</Label>
                <Select value={String(callForm.duration_minutes)} onValueChange={v => setCallForm({ ...callForm, duration_minutes: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90].map(m => <SelectItem key={m} value={String(m)}>{m} min</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Note</Label>
                <Textarea value={callForm.notes} onChange={e => setCallForm({ ...callForm, notes: e.target.value })} rows={2} placeholder="Note opzionali..." />
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label>Titolo <span className="text-destructive">*</span></Label>
                <Input value={apptForm.title} onChange={e => setApptForm({ ...apptForm, title: e.target.value })} placeholder="Titolo evento" />
              </div>
              <div className="space-y-1">
                <Label>Descrizione</Label>
                <Input value={apptForm.description} onChange={e => setApptForm({ ...apptForm, description: e.target.value })} placeholder="Descrizione (opzionale)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Inizio</Label>
                  <Input type="datetime-local" value={apptForm.start_datetime} onChange={e => setApptForm({ ...apptForm, start_datetime: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Fine</Label>
                  <Input type="datetime-local" value={apptForm.end_datetime} onChange={e => setApptForm({ ...apptForm, end_datetime: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={apptForm.meet_link_enabled} onCheckedChange={c => setApptForm({ ...apptForm, meet_link_enabled: c })} />
                <Label className="cursor-pointer">Genera link Google Meet</Label>
              </div>
              <div className="space-y-1">
                <Label>Email cliente</Label>
                <Input type="email" value={apptForm.client_email} onChange={e => setApptForm({ ...apptForm, client_email: e.target.value })} placeholder="email@cliente.it" />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-1 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creazione…" : "Crea evento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CalendarioChiamate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEv, setSelectedEv] = useState<CalEvent | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);

  // Compute visible date range
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "month") {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      return {
        rangeStart: startOfWeek(ms, { weekStartsOn: 1 }),
        rangeEnd: addDays(endOfWeek(me, { weekStartsOn: 1 }), 1),
      };
    }
    if (viewMode === "week") {
      return {
        rangeStart: startOfWeek(currentDate, { weekStartsOn: 1 }),
        rangeEnd: addDays(endOfWeek(currentDate, { weekStartsOn: 1 }), 1),
      };
    }
    return {
      rangeStart: startOfDay(currentDate),
      rangeEnd: addDays(startOfDay(currentDate), 1),
    };
  }, [viewMode, currentDate]);

  // Fetch call bookings
  const { data: callBookings = [] } = useQuery<CallBooking[]>({
    queryKey: ["cal_bookings", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_bookings")
        .select("*")
        .gte("slot_datetime", rangeStart.toISOString())
        .lt("slot_datetime", rangeEnd.toISOString())
        .order("slot_datetime", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CallBooking[];
    },
  });

  // Fetch calendar events
  const { data: calendarEvs = [] } = useQuery<Array<{
    id: string; title: string; description?: string | null;
    start_datetime: string; end_datetime: string;
    meet_link?: string | null; client_email?: string | null;
  }>>({
    queryKey: ["cal_events", rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("start_datetime", rangeStart.toISOString())
        .lt("start_datetime", rangeEnd.toISOString())
        .order("start_datetime", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Upcoming (next 14 days) for sidebar
  const { data: upcomingRaw = [] } = useQuery<CallBooking[]>({
    queryKey: ["cal_upcoming"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_bookings")
        .select("*")
        .gte("slot_datetime", new Date().toISOString())
        .lte("slot_datetime", addDays(new Date(), 14).toISOString())
        .neq("status", "cancelled")
        .order("slot_datetime", { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as CallBooking[];
    },
  });

  // Unify into CalEvent[]
  const events = useMemo((): CalEvent[] => {
    const calls: CalEvent[] = callBookings.map(b => ({
      id: b.id, title: b.cliente_nome,
      start: parseISO(b.slot_datetime),
      end: addMinutes(parseISO(b.slot_datetime), b.duration_minutes),
      type: "call",
      callStatus: b.status,
      clienteEmail: b.cliente_email,
      clienteTelefono: b.cliente_telefono,
      callNotes: b.notes,
      durationMinutes: b.duration_minutes,
    }));
    const apts: CalEvent[] = calendarEvs.map(e => ({
      id: e.id, title: e.title,
      start: parseISO(e.start_datetime),
      end: e.end_datetime ? parseISO(e.end_datetime) : addHours(parseISO(e.start_datetime), 1),
      type: "appointment",
      description: e.description,
      meetLink: e.meet_link,
      clientEmail: e.client_email,
    }));
    return [...calls, ...apts];
  }, [callBookings, calendarEvs]);

  const upcoming = useMemo((): CalEvent[] =>
    upcomingRaw.map(b => ({
      id: b.id, title: b.cliente_nome,
      start: parseISO(b.slot_datetime),
      end: addMinutes(parseISO(b.slot_datetime), b.duration_minutes),
      type: "call",
      callStatus: b.status,
      clienteEmail: b.cliente_email,
      durationMinutes: b.duration_minutes,
    })), [upcomingRaw]);

  const daysWithEvents = useMemo(() => events.map(e => e.start), [events]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await supabase.from("call_bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cal_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["cal_upcoming"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: err => toast({ variant: "destructive", title: "Errore", description: String(err) }),
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["cal_bookings"] });
    queryClient.invalidateQueries({ queryKey: ["cal_events"] });
    queryClient.invalidateQueries({ queryKey: ["cal_upcoming"] });
  }

  function navigate(dir: -1 | 1) {
    setCurrentDate(d => {
      if (viewMode === "month") return dir === 1 ? addMonths(d, 1) : subMonths(d, 1);
      if (viewMode === "week")  return dir === 1 ? addWeeks(d, 1)  : subWeeks(d, 1);
      return addDays(d, dir);
    });
  }

  function headerTitle() {
    if (viewMode === "month") return format(currentDate, "MMMM yyyy", { locale: it });
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      const we = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(ws, "d MMM", { locale: it })} – ${format(we, "d MMM yyyy", { locale: it })}`;
    }
    return format(currentDate, "EEEE d MMMM yyyy", { locale: it });
  }

  function openCreate(date: Date) {
    setCreateDate(date);
    setCreateOpen(true);
  }

  // Full-bleed layout: negate AppLayout padding, fill viewport below sticky header
  return (
    <div
      className="-mx-4 md:-mx-6 lg:-mx-8 -mt-4 md:-mt-6 lg:-mt-8 -mb-4 md:-mb-6 lg:-mb-8 flex flex-col overflow-hidden bg-background"
      style={{ height: "calc(100svh - 3rem)" }}
    >
      {/* ── Top toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        {/* Nav arrows + today */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-3 ml-1" onClick={() => setCurrentDate(new Date())}>
            Oggi
          </Button>
        </div>

        {/* Period title */}
        <h2 className="text-base font-semibold capitalize flex-1 hidden sm:block">{headerTitle()}</h2>

        {/* View switcher */}
        <div className="flex gap-0.5 border rounded-lg p-0.5 bg-muted/40 ml-auto sm:ml-0">
          {(["day", "week", "month"] as ViewMode[]).map(v => (
            <Button
              key={v}
              variant={viewMode === v ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setViewMode(v)}
            >
              {v === "day" ? "Giorno" : v === "week" ? "Settimana" : "Mese"}
            </Button>
          ))}
        </div>

        {/* New event */}
        <Button
          size="sm"
          className="gap-1.5 h-8 shrink-0"
          onClick={() => openCreate(new Date())}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuovo</span>
        </Button>
      </div>

      {/* ── Body: sidebar + calendar ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left mini sidebar */}
        <div className="hidden lg:flex w-60 shrink-0 border-r flex-col bg-background overflow-y-auto p-3 gap-5">
          {/* Mini month picker */}
          <div className="[&_.rdp]:!p-0 [&_.rdp]:!m-0">
            <DayPicker
              locale={it}
              month={currentDate}
              onMonthChange={d => setCurrentDate(d)}
              selected={currentDate}
              onDayClick={day => {
                setCurrentDate(day);
                if (viewMode === "month") setViewMode("week");
              }}
              modifiers={{ hasEvent: daysWithEvents }}
              modifiersClassNames={{ hasEvent: "rdp-has-event" }}
              footer={
                <style>{`
                  .rdp-has-event { position: relative; }
                  .rdp-has-event::after {
                    content: "";
                    display: block;
                    width: 4px; height: 4px;
                    border-radius: 50%;
                    background: hsl(var(--primary));
                    position: absolute;
                    bottom: 2px; left: 50%;
                    transform: translateX(-50%);
                  }
                `}</style>
              }
            />
          </div>

          {/* Upcoming events */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Prossimi eventi
            </p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Nessun evento nei prossimi 14 giorni</p>
            ) : (
              <div className="space-y-1">
                {upcoming.map(ev => {
                  const dotBg = ev.callStatus ? CALL_COLORS[ev.callStatus].split(" ")[0] : "bg-violet-500";
                  return (
                    <button
                      key={ev.id}
                      className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent transition-colors"
                      onClick={() => setSelectedEv(ev)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dotBg}`} />
                        <span className="text-xs font-medium truncate">{ev.title}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground ml-3.5 mt-0.5">
                        {format(ev.start, "d MMM · HH:mm", { locale: it })}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Calendar view */}
        <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
          {viewMode === "week" && (
            <WeekView
              events={events}
              currentDate={currentDate}
              onSlotClick={openCreate}
              onEventClick={setSelectedEv}
            />
          )}
          {viewMode === "day" && (
            <DayView
              events={events}
              currentDate={currentDate}
              onSlotClick={openCreate}
              onEventClick={setSelectedEv}
            />
          )}
          {viewMode === "month" && (
            <MonthView
              events={events}
              currentDate={currentDate}
              onDayClick={day => { setCurrentDate(day); setViewMode("day"); }}
              onEventClick={setSelectedEv}
            />
          )}
        </div>
      </div>

      {/* Dialogs */}
      <EventDetailDialog
        ev={selectedEv}
        onClose={() => setSelectedEv(null)}
        onStatusChange={(id, s) => updateStatus.mutate({ id, status: s })}
      />
      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialDate={createDate}
        onCreated={invalidateAll}
      />
    </div>
  );
}
