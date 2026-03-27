import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  meet_link?: string;
  client_email?: string;
}

interface NewEventForm {
  title: string;
  description: string;
  start_datetime: string;
  end_datetime: string;
  meet_link_enabled: boolean;
  client_email: string;
}

const defaultForm: NewEventForm = {
  title: "",
  description: "",
  start_datetime: "",
  end_datetime: "",
  meet_link_enabled: false,
  client_email: "",
};

export function CalendarView() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewEventForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const {
    data: events = [],
    isLoading,
    isError,
  } = useQuery<CalendarEvent[]>({
    queryKey: ["calendar_events", format(monthStart, "yyyy-MM")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("*")
        .gte("start_datetime", monthStart.toISOString())
        .lte("start_datetime", monthEnd.toISOString())
        .order("start_datetime", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const eventsForSelectedDay: CalendarEvent[] = selectedDay
    ? events.filter((e) => {
        const eventDate = new Date(e.start_datetime);
        return (
          eventDate.getFullYear() === selectedDay.getFullYear() &&
          eventDate.getMonth() === selectedDay.getMonth() &&
          eventDate.getDate() === selectedDay.getDate()
        );
      })
    : [];

  const daysWithEvents: Date[] = events.map((e) => new Date(e.start_datetime));

  function handleDayClick(day: Date) {
    setSelectedDay((prev) =>
      prev &&
      prev.getFullYear() === day.getFullYear() &&
      prev.getMonth() === day.getMonth() &&
      prev.getDate() === day.getDate()
        ? undefined
        : day
    );
  }

  function openNewEventDialog() {
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function handleFormChange(field: keyof NewEventForm, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.title.trim()) {
      toast({ title: "Titolo obbligatorio", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        start_datetime: form.start_datetime || undefined,
        end_datetime: form.end_datetime || undefined,
        meet_link_enabled: form.meet_link_enabled,
        client_email: form.client_email.trim() || undefined,
      };

      const { error } = await supabase.functions.invoke(
        "google-calendar/create-event",
        { body }
      );

      if (error) throw error;

      toast({ title: "Appuntamento creato con successo" });
      setDialogOpen(false);
      setForm(defaultForm);
      queryClient.invalidateQueries({
        queryKey: ["calendar_events", format(monthStart, "yyyy-MM")],
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Errore durante la creazione";
      toast({ title: "Errore", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Calendario</h1>
        <Button onClick={openNewEventDialog}>Nuovo Appuntamento</Button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Calendar */}
        <Card className="w-full lg:w-auto">
          <CardContent className="p-4">
            {isError && (
              <p className="mb-2 text-sm text-destructive">
                Errore nel caricamento degli eventi.
              </p>
            )}
            {isLoading && (
              <p className="mb-2 text-sm text-muted-foreground">
                Caricamento eventi…
              </p>
            )}
            <DayPicker
              locale={it}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              selected={selectedDay}
              onDayClick={handleDayClick}
              modifiers={{ hasEvent: daysWithEvents }}
              modifiersClassNames={{ hasEvent: "rdp-day--has-event" }}
              footer={
                <style>{`
                  .rdp-day--has-event {
                    position: relative;
                  }
                  .rdp-day--has-event::after {
                    content: "";
                    display: block;
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background-color: hsl(var(--primary));
                    position: absolute;
                    bottom: 2px;
                    left: 50%;
                    transform: translateX(-50%);
                  }
                `}</style>
              }
            />
          </CardContent>
        </Card>

        {/* Day panel */}
        {selectedDay && (
          <Card className="flex-1">
            <CardHeader>
              <CardTitle>
                {format(selectedDay, "EEEE d MMMM yyyy", { locale: it })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {eventsForSelectedDay.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nessun evento per questo giorno.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {eventsForSelectedDay.map((event) => (
                    <li
                      key={event.id}
                      className="rounded-lg border p-3 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{event.title}</span>
                        <Badge variant="secondary">
                          {format(new Date(event.start_datetime), "HH:mm")}
                          {" – "}
                          {format(new Date(event.end_datetime), "HH:mm")}
                        </Badge>
                      </div>
                      {event.description && (
                        <p className="text-sm text-muted-foreground">
                          {event.description}
                        </p>
                      )}
                      {event.meet_link && (
                        <a
                          href={event.meet_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary underline"
                        >
                          Partecipa a Google Meet
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* New event dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo Appuntamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">
                Titolo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                placeholder="Titolo evento"
                value={form.title}
                onChange={(e) => handleFormChange("title", e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Descrizione</Label>
              <Input
                id="description"
                placeholder="Descrizione (opzionale)"
                value={form.description}
                onChange={(e) => handleFormChange("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="start_datetime">Inizio</Label>
                <Input
                  id="start_datetime"
                  type="datetime-local"
                  value={form.start_datetime}
                  onChange={(e) =>
                    handleFormChange("start_datetime", e.target.value)
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="end_datetime">Fine</Label>
                <Input
                  id="end_datetime"
                  type="datetime-local"
                  value={form.end_datetime}
                  onChange={(e) =>
                    handleFormChange("end_datetime", e.target.value)
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="meet_link"
                checked={form.meet_link_enabled}
                onCheckedChange={(checked) =>
                  handleFormChange("meet_link_enabled", checked)
                }
              />
              <Label htmlFor="meet_link" className="cursor-pointer">
                Genera link Google Meet
              </Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_email">Cerca cliente per email</Label>
              <Input
                id="client_email"
                type="email"
                placeholder="email@cliente.it"
                value={form.client_email}
                onChange={(e) =>
                  handleFormChange("client_email", e.target.value)
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Annulla
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creazione…" : "Crea Appuntamento"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
