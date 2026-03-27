import { CalendarView } from "@/components/CalendarView";

export default function CalendarioAdmin() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Calendario</h1>
        <p className="text-muted-foreground text-sm">Appuntamenti e scadenze pratiche</p>
      </div>
      <CalendarView />
    </div>
  );
}
