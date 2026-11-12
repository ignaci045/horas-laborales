import { describe, expect, it } from "vitest";
import {
  calculatePay,
  duration,
  exportBackup,
  importBackup,
  initialData,
  parseLocal,
  periodRange,
  totalMs,
  validateShift,
  type Shift,
} from "./domain";
const make = (
  start = "2026-11-09T09:00",
  end = "2026-11-09T17:00",
  breakMinutes = 0,
  id = "a",
): Shift => ({
  id,
  start: parseLocal(start),
  end: parseLocal(end),
  breakMinutes,
  note: "",
});
describe("Jornadas", () => {
  it("calcula ocho horas", () => expect(duration(make())).toBe(8 * 3600000));
  it("descuenta descansos", () =>
    expect(duration(make(undefined, undefined, 45))).toBe(7.25 * 3600000));
  it("cruza medianoche con fechas explícitas", () =>
    expect(duration(make("2026-11-09T22:00", "2026-11-10T06:00", 30))).toBe(
      7.5 * 3600000,
    ));
  it("suma sin redondeos intermedios", () =>
    expect(
      totalMs([make(), make("2026-11-10T09:00", "2026-11-10T12:30", 15, "b")]),
    ).toBe(11.25 * 3600000));
  it("recorta al período y distribuye el descanso", () =>
    expect(
      totalMs(
        [make("2026-11-09T22:00", "2026-11-10T06:00", 60)],
        parseLocal("2026-11-10T00:00"),
        parseLocal("2026-11-11T00:00"),
      ),
    ).toBe(5.25 * 3600000));
  it("semana comienza el lunes y termina el lunes siguiente", () => {
    const [from, to] = periodRange("week", new Date(2026, 10, 11));
    expect(new Date(from).getDay()).toBe(1);
    expect(new Date(to).getDate()).toBe(16);
  });
  it("mes cambia de año correctamente", () => {
    const [from, to] = periodRange("month", new Date(2026, 11, 31));
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getFullYear()).toBe(2027);
  });
  it("rechaza salida anterior e intervalos nulos", () => {
    expect(() =>
      validateShift(make("2026-11-09T17:00", "2026-11-09T09:00")),
    ).toThrow();
    expect(() =>
      validateShift(make("2026-11-09T09:00", "2026-11-09T09:00")),
    ).toThrow();
  });
  it("rechaza descansos negativos, completos y NaN", () => {
    for (const rest of [-1, 480, NaN])
      expect(() => validateShift(make(undefined, undefined, rest))).toThrow();
  });
  it("rechaza superposiciones y acepta horarios contiguos", () => {
    expect(() =>
      validateShift(make("2026-11-09T16:00", "2026-11-09T18:00", 0, "b"), [
        make(),
      ]),
    ).toThrow();
    expect(() =>
      validateShift(make("2026-11-09T17:00", "2026-11-09T18:00", 0, "b"), [
        make(),
      ]),
    ).not.toThrow();
  });
  it("permite editar el mismo registro", () =>
    expect(() => validateShift(make(), [make()])).not.toThrow());
  it("protege la jornada activa", () =>
    expect(() =>
      validateShift(make(), [], {
        id: "active",
        start: parseLocal("2026-11-09T16:00"),
      }),
    ).toThrow());
  it("rechaza fechas inexistentes y texto inválido", () => {
    expect(() => parseLocal("2026-02-30T08:00")).toThrow();
    expect(() => parseLocal("texto")).toThrow();
  });
});
describe("Sueldos", () => {
  const base = {
    mode: "hourly" as const,
    rate: 2500,
    normalHours: 8,
    extraHours: 2,
    multiplier: 1.5,
    salary: 800000,
    agreedHours: 160,
    adjustment: 0,
  };
  it("separa normales y extras con recargo configurable", () =>
    expect(calculatePay(base)).toEqual({
      base: 20000,
      extra: 7500,
      adjustment: 0,
      total: 27500,
    }));
  it("no deduce ni prorratea el sueldo fijo", () =>
    expect(
      calculatePay({ ...base, mode: "monthly", normalHours: 0, extraHours: 0 })
        .total,
    ).toBe(800000));
  it("suma extras y ajustes al sueldo fijo", () =>
    expect(
      calculatePay({ ...base, mode: "monthly", adjustment: -1000 }).total,
    ).toBe(814000));
  it("sin extras no exige horas pactadas", () =>
    expect(
      calculatePay({ ...base, mode: "monthly", agreedHours: 0, extraHours: 0 })
        .total,
    ).toBe(800000));
  it("con extras exige horas pactadas", () =>
    expect(() =>
      calculatePay({ ...base, mode: "monthly", agreedHours: 0 }),
    ).toThrow());
  it("redondea dinero a centavos al final de cada concepto", () =>
    expect(
      calculatePay({ ...base, rate: 0.1, normalHours: 3, extraHours: 0 }).total,
    ).toBe(0.3));
  it("rechaza valores no finitos o negativos", () => {
    expect(() => calculatePay({ ...base, rate: NaN })).toThrow();
    expect(() => calculatePay({ ...base, extraHours: -1 })).toThrow();
  });
});
describe("Copias de seguridad", () => {
  it("exporta e importa jornadas, ajustes y jornada activa", () => {
    const d = initialData();
    d.shifts = [make()];
    d.active = { id: "active", start: parseLocal("2026-11-10T09:00") };
    d.settings.theme = "dark";
    expect(importBackup(exportBackup(d))).toEqual(d);
  });
  it("rechaza JSON y versión inválidos", () => {
    expect(() => importBackup("{")).toThrow();
    expect(() => importBackup('{"version":2}')).toThrow();
  });
  it("rechaza IDs duplicados y superposiciones", () => {
    const d = initialData();
    d.shifts = [make(), make()];
    expect(() => importBackup(JSON.stringify(d))).toThrow();
    d.shifts = [make(), make(undefined, undefined, 0, "b")];
    expect(() => importBackup(JSON.stringify(d))).toThrow();
  });
  it("rechaza preferencias y jornadas activas inválidas", () => {
    const d = initialData();
    d.settings.currency = "INVALID";
    expect(() => importBackup(JSON.stringify(d))).toThrow();
    d.settings.currency = "ARS";
    d.active = { id: "x", start: Date.now() + 100000 };
    expect(() => importBackup(JSON.stringify(d))).toThrow();
  });
  it("elimina propiedades externas y reinicia la revisión", () => {
    const d = { ...initialData(), revision: 999, injected: true };
    expect(importBackup(JSON.stringify(d))).toEqual(initialData());
  });
});
