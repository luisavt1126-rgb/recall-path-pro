export function formatHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function decimalHours(minutes: number) {
  return (minutes / 60).toFixed(1).replace(".", ",");
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function longDate(date: Date) {
  const text = date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - day);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a: Date | string, b: Date | string) {
  return Math.floor(
    (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000,
  );
}

export function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Formata uma data local como o valor de <input type="date"> (yyyy-mm-dd). */
export function toDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Converte o valor de <input type="date"> em ISO (meio-dia local, sem fuso). */
export function dateInputToIso(value: string) {
  const iso = new Date(`${value}T12:00:00`);
  return Number.isNaN(iso.getTime()) ? new Date().toISOString() : iso.toISOString();
}
