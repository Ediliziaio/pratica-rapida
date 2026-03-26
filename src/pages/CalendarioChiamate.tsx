import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Phone,
  Mail,
  User,
  CalendarDays,
  Clock,
  Plus,
  CheckCircle,
  XCircle,
  PhoneOff,
  ChevronLeft,
  ChevronRight,
  List,
} from "lucide-react";
import type { CallBooking } from "@/integrations/supabase/types";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, parseISO } from "date-fns";
import { it } from "date-fns/locale";

type BookingStatus = CallBooking["status"];

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string; dot: string }> = {
  pending: { label: "In attesa", color: "text-yellow-600 border-yellow-200 bg-yellow-50", dot: "bg-yellow-400" },
  confirmed: { label: "Confermato", color: "text-blue-600 border-blue-200 bg-blue-50", dot: "bg-blue-500" },
  completed: { label: "Completato", color: "text-emerald-600 border-emerald-200 bg-emerald-50", dot: "bg-emerald-500" },
  cancelled: { label: "Annullato", color: "text-muted-foreground border-muted bg-muted/30", dot: "bg-muted-foreground" },
  no_show: { label: "Non presentato", color: "text-destructive border-destructive/20 bg-destructive/5", dot: "bg-destructive" },
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 8:00 → 19:00

interface BookingFormData {
  cliente_nome: string;
  cliente_email: string;
  cliente_telefono: string;
  slot_datetime: string;
  duration_minutes: number;
  notes: string;
}

const DEFAULT_FORM: BookingFormData = {
  cliente_nome: "",
  cliente_email: "",
  cliente_telefono: "",
  slot_datetime: "",
  duration_minutes: 30,
  notes: "",
};

function BookingCard({ booking, onStatusChange }: { booking: CallBooking; onStatusChange: (id: string, status: BookingStatus) => void }) {
  const cfg = STATUS_CONFIG[booking.status];
  const slotDate = new Date(booking.slot_datetime);
  const isUpcoming = slotDate > new Date();

  return (
    <Card className={`${!isUpcoming && booking.status === "pending" ? "opacity-60" : ""} transition-opacity`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot} shrink-0`} />
              <span className="font-semibold">{booking.cliente_nome}</span>
              <Badge variant="outline" className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{booking.cliente_email}</span>
              {booking.cliente_telefono && (
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{booking.cliente_telefono}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1 font-medium">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                {format(slotDate, "EEEE d MMMM yyyy", { locale: it })}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {format(slotDate, "HH:mm")} · {booking.duration_minutes} min
              </span>
            </div>
            {booking.notes && <p className="text-sm text-muted-foreground italic">{booking.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {booking.status === "pending" && (
              <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => onStatusChange(booking.id, "confirmed")}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" />Conferma
              </Button>
            )}
            {(booking.status === "pending" || booking.status === "confirmed") && (
              <>
                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                  onClick={() => onStatusChange(booking.id, "completed")}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />Completata
                </Button>
                <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5"
                  onClick={() => onStatusChange(booking.id, "cancelled")}>
                  <XCircle className="h-3.5 w-3.5 mr-1" />Annulla
                </Button>
                <Button size="sm" variant="outline" className="text-muted-foreground"
                  onClick={() => onStatusChange(booking.id, "no_show")}>
                  <PhoneOff className="h-3.5 w-3.5 mr-1" />No-show
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function WeekView({ bookings, onSlotClick }: { bookings: CallBooking[]; onSlotClick: (datetime: string) => void }) {
  const [currentWeek, setCurrentWeek] = useState(new Date());

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getBookingsForSlot = (day: Date, hour: number) => {
    return bookings.filter(b => {
      const d = parseISO(b.slot_datetime);
      return isSameDay(d, day) && d.getHours() === hour;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          {format(weekStart, "d MMM", { locale: it })} – {format(weekEnd, "d MMM yyyy", { locale: it })}
        </h3>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(d => subWeeks(d, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentWeek(new Date())}>
            Oggi
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCurrentWeek(d => addWeeks(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-14 py-2 px-3 text-left text-xs text-muted-foreground font-medium">Ora</th>
              {days.map(day => {
                const isToday = isSameDay(day, new Date());
                return (
                  <th key={day.toISOString()} className={`py-2 px-2 text-center text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    <div>{format(day, "EEE", { locale: it })}</div>
                    <div className={`text-base font-bold ${isToday ? "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto" : ""}`}>
                      {format(day, "d")}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour} className="border-b last:border-0">
                <td className="py-1.5 px-3 text-xs text-muted-foreground align-top font-mono">{`${String(hour).padStart(2, "0")}:00`}</td>
                {days.map(day => {
                  const slotBookings = getBookingsForSlot(day, hour);
                  const slotDatetime = `${format(day, "yyyy-MM-dd")}T${String(hour).padStart(2, "0")}:00`;
                  return (
                    <td
                      key={day.toISOString()}
                      className="py-1 px-1 align-top min-h-[40px] cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => slotBookings.length === 0 && onSlotClick(slotDatetime)}
                    >
                      {slotBookings.map(b => {
                        const cfg = STATUS_CONFIG[b.status];
                        return (
                          <div
                            key={b.id}
                            className={`rounded px-1.5 py-1 text-xs mb-0.5 border truncate ${cfg.color}`}
                            title={`${b.cliente_nome} - ${b.duration_minutes}min`}
                          >
                            <span className="font-medium truncate block">{b.cliente_nome}</span>
                            <span className="opacity-70">{format(parseISO(b.slot_datetime), "HH:mm")}</span>
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CalendarioChiamate() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<BookingFormData>(DEFAULT_FORM);
  const [viewMode, setViewMode] = useState<"list" | "week">("week");

  const { data: bookings = [], isLoading } = useQuery<CallBooking[]>({
    queryKey: ["call_bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_bookings")
        .select("*")
        .order("slot_datetime", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CallBooking[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: BookingFormData) => {
      const { error } = await supabase.from("call_bookings").insert({
        cliente_nome: payload.cliente_nome,
        cliente_email: payload.cliente_email,
        cliente_telefono: payload.cliente_telefono || null,
        slot_datetime: new Date(payload.slot_datetime).toISOString(),
        duration_minutes: payload.duration_minutes,
        notes: payload.notes || null,
        status: "pending",
        reminder_sent: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call_bookings"] });
      toast({ title: "Prenotazione creata" });
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: (err) => toast({ variant: "destructive", title: "Errore", description: String(err) }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await supabase.from("call_bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["call_bookings"] });
      toast({ title: "Stato aggiornato" });
    },
    onError: (err) => toast({ variant: "destructive", title: "Errore", description: String(err) }),
  });

  const filtered = bookings.filter(b => statusFilter === "all" || b.status === statusFilter);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.cliente_nome || !form.cliente_email || !form.slot_datetime) {
      toast({ variant: "destructive", title: "Compila i campi obbligatori" });
      return;
    }
    createMutation.mutate(form);
  };

  const openNewWithSlot = (datetime: string) => {
    setForm({ ...DEFAULT_FORM, slot_datetime: datetime });
    setDialogOpen(true);
  };

  // Stats
  const today = new Date();
  const upcoming = bookings.filter(b => new Date(b.slot_datetime) > today && b.status !== "cancelled").length;
  const pending = bookings.filter(b => b.status === "pending").length;
  const thisWeek = bookings.filter(b => {
    const d = new Date(b.slot_datetime);
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    return d >= weekStart && d <= weekEnd;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Calendario Chiamate</h1>
          <p className="text-muted-foreground">Gestione prenotazioni call con i clienti</p>
        </div>
        <Button onClick={() => { setForm(DEFAULT_FORM); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Nuova prenotazione
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{upcoming}</p>
          <p className="text-xs text-muted-foreground">Prossime</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-orange-500">{pending}</p>
          <p className="text-xs text-muted-foreground">Da confermare</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{thisWeek}</p>
          <p className="text-xs text-muted-foreground">Questa settimana</p>
        </CardContent></Card>
      </div>

      {/* View toggle + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 border rounded-lg p-1">
          <Button
            variant={viewMode === "week" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setViewMode("week")}
          >
            <CalendarDays className="h-3.5 w-3.5 mr-1" />Settimana
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-3"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3.5 w-3.5 mr-1" />Lista
          </Button>
        </div>

        {viewMode === "list" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Filtra per stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="pending">In attesa</SelectItem>
              <SelectItem value="confirmed">Confermato</SelectItem>
              <SelectItem value="completed">Completato</SelectItem>
              <SelectItem value="cancelled">Annullato</SelectItem>
              <SelectItem value="no_show">Non presentato</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground">Caricamento...</div>
      ) : viewMode === "week" ? (
        <WeekView bookings={bookings} onSlotClick={openNewWithSlot} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <CalendarDays className="h-12 w-12 opacity-30" />
          <p className="text-lg font-medium">Nessuna prenotazione trovata</p>
          <p className="text-sm">Clicca su uno slot nel calendario per prenotare</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onStatusChange={(id, status) => updateStatusMutation.mutate({ id, status })}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova prenotazione chiamata</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nome cliente <span className="text-destructive">*</span></Label>
                <Input value={form.cliente_nome} onChange={e => setForm({ ...form, cliente_nome: e.target.value })} placeholder="Mario Rossi" />
              </div>
              <div className="space-y-1">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.cliente_email} onChange={e => setForm({ ...form, cliente_email: e.target.value })} placeholder="mario@email.it" />
              </div>
              <div className="space-y-1">
                <Label>Telefono</Label>
                <Input value={form.cliente_telefono} onChange={e => setForm({ ...form, cliente_telefono: e.target.value })} placeholder="+39 333 0000000" />
              </div>
              <div className="space-y-1">
                <Label>Data e ora <span className="text-destructive">*</span></Label>
                <Input type="datetime-local" value={form.slot_datetime} onChange={e => setForm({ ...form, slot_datetime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Durata (minuti)</Label>
                <Select value={String(form.duration_minutes)} onValueChange={v => setForm({ ...form, duration_minutes: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90].map(m => (
                      <SelectItem key={m} value={String(m)}>{m} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Note</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Note opzionali..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvataggio..." : "Crea prenotazione"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
