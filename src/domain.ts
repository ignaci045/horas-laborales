export type Shift = {
  id: string;
  start: number;
  end: number;
  breakMinutes: number;
  note: string;
};
export type Active = { id: string; start: number };
export type Settings = {
  theme: "light" | "dark";
  currency: string;
  defaultBreak: number;
  rate: number;
  multiplier: number;
  salary: number;
  agreedHours: number;
  useRecords: boolean;
  payMode: "hourly" | "monthly";
};
export type Data = {
  version: 1;
  revision: number;
  shifts: Shift[];
  active: Active | null;
  settings: Settings;
};
export const defaults: Settings = {
  theme: "light",
  currency: "ARS",
  defaultBreak: 0,
  rate: 0,
  multiplier: 1,
  salary: 0,
  agreedHours: 160,
  useRecords: true,
  payMode: "hourly",
};
export const initialData = (): Data => ({
  version: 1,
  revision: 0,
  shifts: [],
  active: null,
  settings: { ...defaults },
});
export const dateKey = (date: Date | number) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const localInput = (ms: number) =>
  `${dateKey(ms)}T${new Date(ms).toTimeString().slice(0, 5)}`;
export function parseLocal(input: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
    throw new Error("Ingresá una fecha y hora válidas.");
  const value = new Date(input).getTime();
  if (!Number.isFinite(value) || localInput(value) !== input)
    throw new Error("La fecha u hora no existe en tu zona horaria.");
  return value;
}
export function validateShift(
  shift: Shift,
  others: Shift[] = [],
  active: Active | null = null,
): void {
  if (
    !shift ||
    typeof shift.id !== "string" ||
    !shift.id ||
    !Number.isFinite(shift.start) ||
    !Number.isFinite(shift.end) ||
    shift.start < 0 ||
    shift.end > 8640000000000000
  )
    throw new Error("Registro inválido.");
  if (shift.end <= shift.start)
    throw new Error(
      "La salida debe ser posterior a la entrada. Si cruzás medianoche, elegí el día siguiente.",
    );
  if (
    !Number.isFinite(shift.breakMinutes) ||
    shift.breakMinutes < 0 ||
    shift.breakMinutes * 60000 >= shift.end - shift.start
  )
    throw new Error(
      "El descanso debe ser menor que la jornada y no puede ser negativo.",
    );
  if (typeof shift.note !== "string" || shift.note.length > 500)
    throw new Error("La nota admite hasta 500 caracteres.");
  if (
    others.some(
      (s) => s.id !== shift.id && shift.start < s.end && shift.end > s.start,
    )
  )
    throw new Error("Este horario se superpone con otra jornada.");
  if (active && shift.end > active.start)
    throw new Error("Este horario se superpone con la jornada en curso.");
}
export const duration = (s: Shift) => s.end - s.start - s.breakMinutes * 60000;
// Distribute an un-timed break proportionally when a shift spans a period boundary.
export function totalMs(shifts: Shift[], from = 0, to = Infinity): number {
  return shifts.reduce(
    (sum, s) =>
      sum +
      (Math.max(0, Math.min(s.end, to) - Math.max(s.start, from)) *
        duration(s)) /
        (s.end - s.start),
    0,
  );
}
export function periodRange(
  kind: "week" | "month" | "day",
  anchor: Date,
): [number, number] {
  const from = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
  );
  if (kind === "week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  if (kind === "month") from.setDate(1);
  const to = new Date(from);
  if (kind === "month") to.setMonth(to.getMonth() + 1);
  else to.setDate(to.getDate() + (kind === "week" ? 7 : 1));
  return [+from, +to];
}
export const hours = (ms: number) => ms / 3600000;
export function timeLabel(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
export function timerLabel(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculatePay(p: {
  mode: "hourly" | "monthly";
  rate: number;
  normalHours: number;
  extraHours: number;
  multiplier: number;
  salary: number;
  agreedHours: number;
  adjustment: number;
}) {
  for (const n of [
    p.rate,
    p.normalHours,
    p.extraHours,
    p.multiplier,
    p.salary,
    p.agreedHours,
  ])
    if (!Number.isFinite(n) || n < 0)
      throw new Error("Los valores deben ser números positivos o cero.");
  if (!Number.isFinite(p.adjustment))
    throw new Error("El ajuste no es válido.");
  if (p.mode === "monthly" && p.extraHours > 0 && p.agreedHours <= 0)
    throw new Error("Configurá las horas pactadas para estimar las extras.");
  const base = cents(p.mode === "hourly" ? p.rate * p.normalHours : p.salary);
  const extra = cents(
    p.extraHours *
      p.multiplier *
      (p.mode === "hourly" ? p.rate : p.salary / (p.agreedHours || 1)),
  );
  return {
    base,
    extra,
    adjustment: cents(p.adjustment),
    total: cents(base + extra + cents(p.adjustment)),
  };
}
export function validateData(input: unknown): Data {
  const d = input as Data;
  if (
    !d ||
    d.version !== 1 ||
    !Array.isArray(d.shifts) ||
    d.shifts.length > 100000 ||
    !d.settings
  )
    throw new Error("La copia no tiene un formato compatible (versión 1).");
  const ids = new Set<string>();
  const sorted = [...d.shifts].sort((a, b) => a.start - b.start);
  sorted.forEach((s, i) => {
    validateShift(s);
    if (ids.has(s.id))
      throw new Error("La copia contiene identificadores duplicados.");
    ids.add(s.id);
    if (i && sorted[i - 1].end > s.start)
      throw new Error("La copia contiene jornadas superpuestas.");
  });
  if (
    d.active !== null &&
    (!d.active ||
      typeof d.active.id !== "string" ||
      !d.active.id ||
      ids.has(d.active.id) ||
      !Number.isFinite(d.active.start) ||
      d.active.start < 0 ||
      d.active.start > Date.now() ||
      sorted.some((s) => s.end > d.active!.start))
  )
    throw new Error("La jornada activa de la copia es inválida.");
  const s = d.settings;
  if (
    !["light", "dark"].includes(s.theme) ||
    !["ARS", "USD", "EUR", "UYU", "CLP"].includes(s.currency) ||
    typeof s.useRecords !== "boolean" ||
    !["hourly", "monthly"].includes(s.payMode)
  )
    throw new Error("Las preferencias de la copia son inválidas.");
  for (const key of [
    "defaultBreak",
    "rate",
    "multiplier",
    "salary",
    "agreedHours",
  ] as const)
    if (!Number.isFinite(s[key]) || s[key] < 0)
      throw new Error("La copia contiene parámetros inválidos.");
  return {
    version: 1,
    revision: 0,
    shifts: sorted.map(({ id, start, end, breakMinutes, note }) => ({
      id,
      start,
      end,
      breakMinutes,
      note,
    })),
    active: d.active ? { id: d.active.id, start: d.active.start } : null,
    settings: {
      theme: s.theme,
      currency: s.currency,
      defaultBreak: s.defaultBreak,
      rate: s.rate,
      multiplier: s.multiplier,
      salary: s.salary,
      agreedHours: s.agreedHours,
      useRecords: s.useRecords,
      payMode: s.payMode,
    },
  };
}
export const exportBackup = (data: Data) =>
  JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
export function importBackup(text: string): Data {
  if (text.length > 20 * 1024 * 1024)
    throw new Error("La copia supera los 20 MB.");
  try {
    return validateData(JSON.parse(text));
  } catch (e) {
    if (e instanceof SyntaxError)
      throw new Error("El archivo no es un JSON válido.");
    throw e;
  }
}
