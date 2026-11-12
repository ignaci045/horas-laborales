import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { initialData } from "./domain";
import { readData, saveData } from "./storage";
it("persiste, recupera y evita pérdidas por escrituras simultáneas", async () => {
  const initial = await readData();
  expect(initial.revision).toBe(0);
  const started = await saveData(
    { ...initial, active: { id: "active", start: 12345 } },
    0,
  );
  expect((await readData()).active?.start).toBe(12345);
  const results = await Promise.allSettled([
    saveData(
      { ...started, settings: { ...started.settings, theme: "dark" } },
      1,
    ),
    saveData(
      { ...started, settings: { ...started.settings, currency: "USD" } },
      1,
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await readData()).revision).toBe(2);
  await expect(saveData(initialData(), 0)).rejects.toThrow("otra pestaña");
  expect((await readData()).active?.id).toBe("active");
});
