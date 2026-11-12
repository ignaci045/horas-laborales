import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Clock3,
  House,
  CalendarDays,
  Calculator,
  Settings as SettingsIcon,
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Play,
  Square,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Download,
  Upload,
  ShieldCheck,
  X,
  Pencil,
  Trash2,
  Check,
  Coffee,
  ArrowRight,
  CheckCircle2,
  WifiOff,
  MonitorDown,
} from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  calculatePay,
  dateKey,
  duration,
  exportBackup,
  hours,
  importBackup,
  localInput,
  parseLocal,
  periodRange,
  timeLabel,
  timerLabel,
  totalMs,
  validateShift,
  type Data,
  type Settings,
  type Shift,
} from "./domain";
import { readData, saveData } from "./storage";

type Tab = "home" | "history" | "calculator" | "settings";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const tabs = [
  { id: "home", label: "Inicio", icon: House },
  { id: "history", label: "Historial", icon: CalendarDays },
  { id: "calculator", label: "Calculadora", icon: Calculator },
  { id: "settings", label: "Configuración", icon: SettingsIcon },
] as const;
const clock = (n: number) =>
  new Date(n).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
const day = (n: number) =>
  new Date(n).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "Ocurrió un error. Intentá nuevamente.";
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Numeric({
  label,
  value,
  onChange,
  step = "0.01",
  min = 0,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: string;
  min?: number;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        type="number"
        required
        min={min}
        step={step}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </Field>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const el = ref.current;
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <div className="section-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<Tab>("home"),
    [now, setNow] = useState(Date.now()),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Shift | "manual" | "finish" | null>(
      null,
    ),
    [deleting, setDeleting] = useState<Shift | null>(null),
    [incoming, setIncoming] = useState<Data | null>(null),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent | null>(null);
  const saving = useRef(false),
    channel = useRef<BroadcastChannel | null>(null);
  const [cached, setCached] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.ready.then(() => setCached(true)).catch(() => {});
  }, []);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () =>
      setError(
        "No se pudo preparar el modo sin conexión. Volvé a abrir la aplicación con internet.",
      ),
  });
  useEffect(() => {
    readData()
      .then(setData)
      .catch((e) => setError(errorText(e)));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => {
      if (document.visibilityState === "visible")
        readData()
          .then(setData)
          .catch((e) => setError(errorText(e)));
    };
    document.addEventListener("visibilitychange", refresh);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel("horas-laborales");
      channel.current.onmessage = () =>
        readData()
          .then(setData)
          .catch((e) => setError(errorText(e)));
    }
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    const installer = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", installer);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      channel.current?.close();
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("beforeinstallprompt", installer);
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data?.settings.theme ?? "light";
  }, [data?.settings.theme]);
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(t);
    }
  }, [notice]);
  async function commit(next: Data, message: string) {
    if (!data || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await saveData(next, data.revision);
      setData(saved);
      channel.current?.postMessage("updated");
      setNotice(message);
      return true;
    } catch (e) {
      setError(errorText(e));
      try {
        setData(await readData());
      } catch {
        /* Keep the last known data on screen. */
      }
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function prefs(patch: Partial<Settings>) {
    if (data)
      await commit(
        { ...data, settings: { ...data.settings, ...patch } },
        "Preferencias guardadas",
      );
  }
  async function start() {
    if (!data || data.active) return;
    const start = Date.now();
    if (data.shifts.some((s) => s.end > start)) {
      setError(
        "Hay un registro que termina en el futuro. Corregilo antes de iniciar.",
      );
      return;
    }
    await commit(
      { ...data, active: { id: crypto.randomUUID(), start } },
      "Jornada iniciada. Podés cerrar la aplicación.",
    );
  }
  async function saveShift(shift: Shift) {
    if (!data) return;
    try {
      validateShift(
        shift,
        data.shifts,
        editor === "finish" ? null : data.active,
      );
      if (shift.end > Date.now())
        throw new Error("No se pueden registrar horas futuras.");
      if (
        await commit(
          {
            ...data,
            shifts: [...data.shifts.filter((s) => s.id !== shift.id), shift],
            active: editor === "finish" ? null : data.active,
          },
          "Jornada guardada",
        )
      )
        setEditor(null);
    } catch (e) {
      setError(errorText(e));
      throw e;
    }
  }
  function backup() {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([exportBackup(data)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `horas-laborales-${dateKey(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Copia de seguridad exportada");
  }
  async function loadBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("El archivo supera los 20 MB.");
      setIncoming(importBackup(await file.text()));
    } catch (e) {
      setError(errorText(e));
    }
  }
  if (!data)
    return (
      <main className="loading">
        <Clock3 size={44} />
        <h1>Horas Laborales</h1>
        <p>{error || "Preparando tu espacio…"}</p>
        {error && <button onClick={() => location.reload()}>Reintentar</button>}
      </main>
    );
  const s = data.settings;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setTab("home");
          }}
        >
          <span className="brand-mark">
            <Clock3 />
          </span>
          <span>
            Horas<span className="brand-sub">LABORALES</span>
          </span>
        </a>
        <div className="sidebar-caption">TU ESPACIO DE TRABAJO</div>
        <nav aria-label="Navegación principal">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-label={t.label}
              aria-current={tab === t.id ? "page" : undefined}
              className={tab === t.id ? "nav-link selected" : "nav-link"}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={21} />
              <span>{t.label}</span>
              {tab === t.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-symbol">
            <ShieldCheck size={22} />
          </div>
          <strong>Tu tiempo. Tus datos.</strong>
          <p>
            Solo en tu dispositivo.
            <br />
            Sin cuentas, sin anuncios.
          </p>
          <span className="version">VERSIÓN 1.0</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <Clock3 size={20} />
            Horas Laborales
          </span>
          <span className="breadcrumb">
            Mi espacio <span>/</span>{" "}
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </span>
          <div className="top-actions">
            <span className="connection">
              <i className={online ? "" : "offline"} />
              {online ? "Almacenamiento local" : "Sin conexión"}
            </span>
            <button
              className="icon-button theme-button"
              aria-label={
                s.theme === "light"
                  ? "Activar modo oscuro"
                  : "Activar modo claro"
              }
              onClick={() =>
                prefs({ theme: s.theme === "light" ? "dark" : "light" })
              }
            >
              {s.theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <span className="avatar">HL</span>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="banner error" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Cerrar error"
              >
                <X size={18} />
              </button>
            </div>
          )}
          {needRefresh && (
            <div className="banner">
              <span>
                Hay una nueva versión. Tus registros guardados se conservan.
              </span>
              <button
                disabled={busy || editor !== null || incoming !== null}
                onClick={() => updateServiceWorker(true)}
              >
                Actualizar
              </button>
            </div>
          )}
          {!online && (
            <div className="offline-note">
              <WifiOff size={15} /> Podés seguir registrando jornadas sin
              conexión.
            </div>
          )}
          {tab === "home" && (
            <Home
              data={data}
              now={now}
              busy={busy}
              onStart={start}
              onFinish={() => setEditor("finish")}
              onManual={() => setEditor("manual")}
              onHistory={() => setTab("history")}
            />
          )}
          {tab === "history" && (
            <History
              data={data}
              onManual={() => setEditor("manual")}
              onEdit={setEditor}
              onDelete={setDeleting}
            />
          )}
          {tab === "calculator" && (
            <PayCalculator data={data} onSave={prefs} busy={busy} />
          )}
          {tab === "settings" && (
            <>
              <PageTitle
                eyebrow="A TU MANERA"
                title="Configuración"
                subtitle="Un espacio que se adapta a vos."
              />
              <div className="settings-grid">
                <section className="card">
                  <SectionTitle icon={<Sun size={20} />} title="Apariencia" />
                  <p className="muted">Elegí cómo querés ver tu espacio.</p>
                  <div className="theme-options">
                    {(["light", "dark"] as const).map((theme) => (
                      <button
                        className={`theme-option ${s.theme === theme ? "chosen" : ""}`}
                        key={theme}
                        onClick={() => prefs({ theme })}
                      >
                        <div className={`theme-preview ${theme}`}>
                          <span />
                          <div>
                            <i />
                            <i />
                          </div>
                        </div>
                        <span>
                          {theme === "light" ? (
                            <Sun size={17} />
                          ) : (
                            <Moon size={17} />
                          )}{" "}
                          {theme === "light" ? "Claro" : "Oscuro"}
                          {s.theme === theme && <Check size={17} />}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="card">
                  <SectionTitle
                    icon={<Clock3 size={20} />}
                    title="Registro horario"
                  />
                  <SettingsForm settings={s} onSave={prefs} busy={busy} />
                </section>
                <section className="card">
                  <SectionTitle
                    icon={<ShieldCheck size={20} />}
                    title="Tus datos, a salvo"
                  />
                  <p className="muted">
                    Guardá una copia con tus jornadas, la jornada activa y tus
                    preferencias.
                  </p>
                  <div className="backup-actions">
                    <button className="secondary" onClick={backup}>
                      <Download size={18} />
                      Exportar JSON
                    </button>
                    <label className="secondary import-button">
                      <Upload size={18} />
                      Importar copia
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={(e) => {
                          loadBackup(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                  <p className="info-note">
                    Desinstalar la app o borrar los datos del navegador puede
                    eliminar tus registros. Exportá copias periódicamente. No
                    hay sincronización entre dispositivos.
                  </p>
                  <button
                    className="text-button"
                    onClick={async () => {
                      const granted = await navigator.storage?.persist?.();
                      setNotice(
                        granted
                          ? "Almacenamiento persistente habilitado."
                          : "El navegador gestiona la conservación. Mantené copias de seguridad.",
                      );
                    }}
                  >
                    Solicitar conservación del almacenamiento{" "}
                    <ArrowUpRight size={16} />
                  </button>
                </section>
                <section className="card">
                  <SectionTitle
                    icon={<MonitorDown size={20} />}
                    title="Siempre a mano"
                  />
                  <p className="muted">
                    Instalá Horas Laborales y abrila como cualquier otra app.
                  </p>
                  {install ? (
                    <button
                      className="primary"
                      onClick={async () => {
                        await install.prompt();
                        await install.userChoice;
                        setInstall(null);
                      }}
                    >
                      Instalar aplicación <Download size={18} />
                    </button>
                  ) : (
                    <p className="info-note">
                      En Android: menú del navegador → Instalar aplicación. En
                      iPhone: Safari → Compartir → Agregar a inicio. La opción
                      depende del navegador.
                    </p>
                  )}
                  <p className="status-line">
                    <CheckCircle2 size={16} />
                    {offlineReady || cached
                      ? "Lista para usar sin conexión"
                      : "El modo sin conexión se prepara al cargar la versión publicada."}
                  </p>
                  <div className="about">
                    <span className="brand-mark small">
                      <Clock3 size={20} />
                    </span>
                    <div>
                      <strong>Horas Laborales</strong>
                      <small>Versión 1.0.0 · Hecha para tu día a día</small>
                    </div>
                  </div>
                </section>
                <section className="card full">
                  <SectionTitle
                    icon={<Calculator size={20} />}
                    title="Preferencias de sueldo"
                  />
                  <p className="muted">
                    La tarifa, el sueldo base, las horas pactadas y el recargo
                    se guardan desde la calculadora.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setTab("calculator")}
                  >
                    Abrir calculadora <ArrowRight size={17} />
                  </button>
                </section>
              </div>
            </>
          )}
          <footer className="page-footer">
            <ShieldCheck size={14} /> Hecha para tu día a día. Sin anuncios, sin
            distracciones.
          </footer>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Navegación móvil">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "selected" : ""}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {editor && (
        <ShiftEditor
          shift={typeof editor === "object" ? editor : null}
          activeStart={editor === "finish" ? data.active?.start : undefined}
          activeId={editor === "finish" ? data.active?.id : undefined}
          defaultBreak={s.defaultBreak}
          onSave={saveShift}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
          busy={busy}
        />
      )}
      {deleting && (
        <Modal
          title="¿Eliminar esta jornada?"
          onClose={() => setDeleting(null)}
        >
          <p>
            Se eliminará el registro del {day(deleting.start)} de{" "}
            {timeLabel(duration(deleting))}. Esta acción no se puede deshacer.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await commit(
                    {
                      ...data,
                      shifts: data.shifts.filter((s) => s.id !== deleting.id),
                    },
                    "Jornada eliminada",
                  )
                )
                  setDeleting(null);
              }}
            >
              Eliminar jornada
            </button>
          </div>
        </Modal>
      )}
      {incoming && (
        <Modal title="¿Reemplazar tus datos?" onClose={() => setIncoming(null)}>
          <p>
            La copia contiene <strong>{incoming.shifts.length} jornadas</strong>
            {incoming.active ? " y una jornada activa" : ""}. Reemplazará tus{" "}
            {data.shifts.length} jornadas actuales, la jornada activa y las
            preferencias.
          </p>
          <p className="info-note">
            Exportá tus datos actuales antes de continuar si querés
            conservarlos.
          </p>
          <button className="text-button" onClick={backup}>
            <Download size={16} />
            Exportar datos actuales
          </button>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setIncoming(null)}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                if (await commit(incoming, "Copia importada correctamente"))
                  setIncoming(null);
              }}
            >
              Reemplazar datos
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <h2 className="section-title">
      <span>{icon}</span>
      {title}
    </h2>
  );
}
function Home({
  data,
  now,
  busy,
  onStart,
  onFinish,
  onManual,
  onHistory,
}: {
  data: Data;
  now: number;
  busy: boolean;
  onStart: () => void;
  onFinish: () => void;
  onManual: () => void;
  onHistory: () => void;
}) {
  const [dayStart, dayEnd] = periodRange("day", new Date(now)),
    [weekStart, weekEnd] = periodRange("week", new Date(now));
  const recent = [...data.shifts].sort((a, b) => b.start - a.start).slice(0, 3),
    active = data.active;
  const weekCount = data.shifts.filter(
    (s) => s.start < weekEnd && s.end > weekStart,
  ).length;
  const h = new Date(now).getHours();
  return (
    <>
      <PageTitle
        eyebrow="CADA HORA CUENTA"
        title={
          h < 12 ? "Buen día." : h < 19 ? "Buenas tardes." : "Buenas noches."
        }
        subtitle="Tu tiempo merece estar en orden."
        action={
          <button className="secondary manual-top" onClick={onManual}>
            <Plus size={18} />
            Cargar jornada
          </button>
        }
      />
      <div className="home-grid">
        <section className={`clock-card ${active ? "is-active" : ""}`}>
          <div className="clock-top">
            <span className="date-pill">
              <CalendarDays size={16} />
              {new Date(now).toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <span className="live-label">
              <i /> EN VIVO
            </span>
          </div>
          <div className="clock-center">
            <div className="clock-ring">
              <div className="clock-ring-inner">
                <span className="clock-caption">
                  {active ? "TIEMPO EN JORNADA" : "HORA ACTUAL"}
                </span>
                <div className="big-clock">
                  {active ? timerLabel(now - active.start) : clock(now)}
                </div>
                <span className="clock-seconds">
                  {active
                    ? `Entrada a las ${clock(active.start)}`
                    : "Un nuevo momento para avanzar"}
                </span>
                <span className="work-status">
                  <i />
                  {active ? "Trabajando" : "Fuera de jornada"}
                </span>
              </div>
            </div>
          </div>
          <button
            className="start-button"
            disabled={busy}
            onClick={active ? onFinish : onStart}
          >
            {active ? (
              <Square size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
            {active ? "Finalizar jornada" : "Iniciar jornada"}
            <ArrowRight size={20} />
          </button>
          <p className="clock-foot">
            {active
              ? "Tu jornada sigue aunque cierres la aplicación."
              : "Cuando estés listo, tu jornada empieza acá."}
          </p>
        </section>
        <div className="home-side">
          <section className="card summary-card">
            <div className="summary-icon">
              <Clock3 size={22} />
            </div>
            <span className="eyebrow">HOY</span>
            <div className="metric">
              {timeLabel(totalMs(data.shifts, dayStart, dayEnd))}
            </div>
            <p>Horas de jornadas finalizadas</p>
            <div className="summary-divider" />
            <span className="summary-bottom">
              <span className="little-dot" />
              {active
                ? "Tenés una jornada en curso"
                : "Todo listo para tu próxima jornada"}
            </span>
          </section>
          <section className="card summary-card">
            <div className="summary-icon mint">
              <CalendarDays size={22} />
            </div>
            <span className="eyebrow">ESTA SEMANA</span>
            <div className="metric">
              {timeLabel(totalMs(data.shifts, weekStart, weekEnd))}
            </div>
            <p>
              {day(weekStart)} — {day(weekEnd - 1)}
            </p>
            <div className="week-days">
              {Array.from({ length: 7 }, (_, i) => {
                const start = new Date(weekStart);
                start.setDate(start.getDate() + i);
                const end = new Date(start);
                end.setDate(end.getDate() + 1);
                const worked = totalMs(data.shifts, +start, +end) > 0;
                return (
                  <div
                    key={i}
                    className={`${dateKey(start) === dateKey(now) ? "today" : ""} ${worked ? "worked" : ""}`}
                  >
                    <span>{["L", "M", "M", "J", "V", "S", "D"][i]}</span>
                    <i>{worked ? <Check size={12} /> : ""}</i>
                  </div>
                );
              })}
            </div>
            <span className="summary-bottom">
              {weekCount}{" "}
              {weekCount === 1 ? "jornada registrada" : "jornadas registradas"}
            </span>
          </section>
        </div>
      </div>
      <section className="card recent">
        <div className="section-heading">
          <h2>Últimas jornadas</h2>
          <button className="text-button" onClick={onHistory}>
            Ver historial <ArrowUpRight size={16} />
          </button>
        </div>
        {recent.length ? (
          recent.map((s) => <ShiftRow key={s.id} shift={s} />)
        ) : (
          <div className="empty-inline">
            <span className="empty-icon">
              <CalendarDays size={27} />
            </span>
            <div>
              <h3>Tu historia empieza con una jornada</h3>
              <p>Registrá tu entrada o cargá un horario anterior.</p>
            </div>
            <button className="text-button" onClick={onManual}>
              Cargar jornada <Plus size={16} />
            </button>
          </div>
        )}
      </section>
      <div className="home-tip">
        <span>
          <ShieldCheck size={20} />
        </span>
        <p>
          <strong>Un espacio solo tuyo.</strong> Tus jornadas se guardan en este
          dispositivo, incluso sin conexión.
        </p>
      </div>
    </>
  );
}
function ShiftRow({
  shift,
  onEdit,
  onDelete,
}: {
  shift: Shift;
  onEdit?: (s: Shift) => void;
  onDelete?: (s: Shift) => void;
}) {
  const d = new Date(shift.start);
  return (
    <article className="shift-row">
      <div className="date-tile">
        <strong>{d.getDate()}</strong>
        <span>{d.toLocaleDateString("es-AR", { month: "short" })}</span>
      </div>
      <div className="shift-description">
        <h3>
          {d.toLocaleDateString("es-AR", { weekday: "long" })}
          <span className="year"> · {d.getFullYear()}</span>
        </h3>
        <div className="shift-times">
          <span>
            <ArrowDownLeft size={14} />
            {clock(shift.start)}
          </span>
          <span className="dash">—</span>
          <span>
            <ArrowUpRight size={14} />
            {clock(shift.end)}
            {dateKey(shift.start) !== dateKey(shift.end) &&
              ` (${day(shift.end)})`}
          </span>
          {shift.breakMinutes > 0 && (
            <span className="break-label">
              <Coffee size={14} />
              {shift.breakMinutes} min
            </span>
          )}
        </div>
        {shift.note && <p className="shift-note">{shift.note}</p>}
      </div>
      <strong className="duration-pill">{timeLabel(duration(shift))}</strong>
      {onEdit && (
        <div className="row-actions">
          <button
            className="icon-button"
            aria-label={`Editar jornada del ${day(shift.start)}`}
            onClick={() => onEdit(shift)}
          >
            <Pencil size={17} />
          </button>
          <button
            className="icon-button delete"
            aria-label={`Eliminar jornada del ${day(shift.start)}`}
            onClick={() => onDelete?.(shift)}
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}
    </article>
  );
}
function History({
  data,
  onManual,
  onEdit,
  onDelete,
}: {
  data: Data;
  onManual: () => void;
  onEdit: (s: Shift) => void;
  onDelete: (s: Shift) => void;
}) {
  const [kind, setKind] = useState<"week" | "month">("month"),
    [anchor, setAnchor] = useState(new Date());
  const [from, to] = periodRange(kind, anchor),
    shifts = data.shifts
      .filter((s) => s.start < to && s.end > from)
      .sort((a, b) => b.start - a.start);
  function move(direction: number) {
    const d = new Date(from);
    if (kind === "month") d.setMonth(d.getMonth() + direction);
    else d.setDate(d.getDate() + direction * 7);
    setAnchor(d);
  }
  return (
    <>
      <PageTitle
        eyebrow="CADA JORNADA, EN SU LUGAR"
        title="Tu historial"
        subtitle="Revisá tus horas y mirá todo lo que avanzaste."
        action={
          <button className="primary" onClick={onManual}>
            <Plus size={18} />
            Cargar jornada
          </button>
        }
      />
      <div className="history-toolbar">
        <div className="segmented">
          <button
            className={kind === "week" ? "selected" : ""}
            onClick={() => setKind("week")}
          >
            Semana
          </button>
          <button
            className={kind === "month" ? "selected" : ""}
            onClick={() => setKind("month")}
          >
            Mes
          </button>
        </div>
        <div className="period-control">
          <button
            className="icon-button"
            aria-label="Período anterior"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <strong>
            {kind === "month"
              ? new Date(from).toLocaleDateString("es-AR", {
                  month: "long",
                  year: "numeric",
                })
              : `${day(from)} — ${day(to - 1)}, ${new Date(from).getFullYear()}`}
          </strong>
          <button
            className="icon-button"
            aria-label="Período siguiente"
            onClick={() => move(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <button className="text-button" onClick={() => setAnchor(new Date())}>
          Hoy
        </button>
      </div>
      <div className="history-stats">
        <div className="card">
          <span className="eyebrow">HORAS DEL PERÍODO</span>
          <strong>{timeLabel(totalMs(shifts, from, to))}</strong>
        </div>
        <div className="card">
          <span className="eyebrow">JORNADAS</span>
          <strong>{shifts.length.toString().padStart(2, "0")}</strong>
        </div>
      </div>
      <section className="card">
        <div className="section-heading">
          <h2>Jornadas registradas</h2>
          <span className="subtle-tag">
            {kind === "week" ? "Vista semanal" : "Vista mensual"}
          </span>
        </div>
        {shifts.length ? (
          shifts.map((s) => (
            <ShiftRow
              key={s.id}
              shift={s}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <CalendarDays size={32} />
            </span>
            <h3>Un período por completar</h3>
            <p>No hay jornadas registradas en estas fechas.</p>
            <button className="secondary" onClick={onManual}>
              <Plus size={17} />
              Agregar una jornada
            </button>
          </div>
        )}
      </section>
      <p className="footnote">
        Los totales incluyen solo las horas dentro del período. Las tarjetas
        muestran la jornada completa. Si cruza un límite, su descanso se reparte
        proporcionalmente.
      </p>
    </>
  );
}
function ShiftEditor({
  shift,
  activeStart,
  activeId,
  defaultBreak,
  onSave,
  onClose,
  busy,
}: {
  shift: Shift | null;
  activeStart?: number;
  activeId?: string;
  defaultBreak: number;
  onSave: (s: Shift) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const [start, setStart] = useState(
      localInput(shift?.start ?? activeStart ?? Date.now()),
    ),
    [end, setEnd] = useState(localInput(shift?.end ?? Date.now())),
    [rest, setRest] = useState(shift?.breakMinutes ?? defaultBreak),
    [note, setNote] = useState(shift?.note ?? ""),
    [error, setError] = useState("");
  const finishing = activeStart !== undefined;
  // Preserve timestamp seconds for existing/automatic records unless the user edits that input.
  const initialStart = localInput(shift?.start ?? activeStart ?? Date.now());
  const initialEnd = useRef(end);
  const finishTime = useRef(Date.now());
  function values(): Shift {
    return {
      id: shift?.id ?? activeId ?? crypto.randomUUID(),
      start: finishing
        ? activeStart!
        : shift && start === initialStart
          ? shift.start
          : parseLocal(start),
      end:
        end === initialEnd.current
          ? (shift?.end ?? (finishing ? finishTime.current : parseLocal(end)))
          : parseLocal(end),
      breakMinutes: rest,
      note: note.trim(),
    };
  }
  let preview = "Completá un horario válido";
  try {
    const v = values();
    validateShift(v);
    preview = timeLabel(duration(v));
  } catch {
    /* Show the validation on submit. */
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const s = values();
      validateShift(s);
      await onSave(s);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <Modal
      title={
        finishing
          ? "Finalizar jornada"
          : shift
            ? "Editar jornada"
            : "Cargar jornada"
      }
      onClose={onClose}
    >
      <p className="muted">
        {finishing
          ? "Revisá tu salida y agregá el descanso, si lo hubo."
          : "Tu tiempo también cuenta cuando lo cargás después."}
      </p>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Entrada">
            <input
              type="datetime-local"
              required
              value={start}
              disabled={finishing}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Salida">
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <p className="footnote">
          Si terminaste después de medianoche, seleccioná el día siguiente en
          Salida.
        </p>
        <Numeric
          label="Descanso no trabajado (minutos)"
          value={rest}
          onChange={setRest}
          step="1"
        />
        <Field label="Nota (opcional)">
          <textarea
            maxLength={500}
            placeholder="Algo que quieras recordar de esta jornada…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div className="duration-preview">
          <span>Tiempo neto trabajado</span>
          <strong>{preview}</strong>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            <Check size={18} />
            {busy ? "Guardando…" : "Guardar jornada"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SettingsForm({
  settings,
  onSave,
  busy,
}: {
  settings: Settings;
  onSave: (s: Partial<Settings>) => Promise<void>;
  busy: boolean;
}) {
  const [rest, setRest] = useState(settings.defaultBreak),
    [currency, setCurrency] = useState(settings.currency);
  useEffect(() => {
    setRest(settings.defaultBreak);
    setCurrency(settings.currency);
  }, [settings.defaultBreak, settings.currency]);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ defaultBreak: rest, currency });
      }}
    >
      <Numeric
        label="Descanso sugerido (minutos)"
        value={rest}
        onChange={setRest}
        step="1"
        hint="Podés modificarlo al guardar cada jornada."
      />
      <Field label="Moneda">
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {["ARS", "USD", "EUR", "UYU", "CLP"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <button className="secondary" disabled={busy}>
        <Check size={16} />
        Guardar preferencias
      </button>
    </form>
  );
}
function PayCalculator({
  data,
  onSave,
  busy,
}: {
  data: Data;
  onSave: (s: Partial<Settings>) => Promise<void>;
  busy: boolean;
}) {
  const [form, setForm] = useState(data.settings),
    [manual, setManual] = useState(0),
    [extras, setExtras] = useState(0),
    [adjustment, setAdjustment] = useState(0),
    [from, setFrom] = useState(dateKey(periodRange("month", new Date())[0])),
    [to, setTo] = useState(dateKey(Date.now()));
  const change = (patch: Partial<Settings>) =>
    setForm((f) => ({ ...f, ...patch }));
  let calcError = "",
    recorded = 0;
  try {
    const start = parseLocal(`${from}T00:00`),
      end = new Date(parseLocal(`${to}T00:00`));
    end.setDate(end.getDate() + 1);
    if (+end <= start)
      throw new Error(
        "La fecha final debe ser igual o posterior a la inicial.",
      );
    recorded = hours(totalMs(data.shifts, start, +end));
  } catch (e) {
    calcError = errorText(e);
  }
  const totalHours = form.useRecords ? recorded : manual,
    normal = form.useRecords ? Math.max(0, totalHours - extras) : totalHours;
  let pay = { base: 0, extra: 0, adjustment: 0, total: 0 };
  try {
    pay = calculatePay({
      mode: form.payMode,
      rate: form.rate,
      normalHours: normal,
      extraHours: extras,
      multiplier: form.multiplier,
      salary: form.salary,
      agreedHours: form.agreedHours,
      adjustment: form.payMode === "monthly" ? adjustment : 0,
    });
    if (form.payMode === "hourly" && form.useRecords && extras > recorded)
      throw new Error(
        "Las horas extras no pueden superar las horas registradas.",
      );
  } catch (e) {
    calcError = errorText(e);
  }
  const money = (n: number) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: form.currency,
        maximumFractionDigits: 2,
      }).format(n),
    number = (n: number) =>
      new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n);
  return (
    <>
      <PageTitle
        eyebrow="CLARIDAD PARA TUS NÚMEROS"
        title="Calculadora de sueldo"
        subtitle="Tus horas, convertidas en una estimación clara."
      />
      <div className="calculator-layout">
        <section className="card calculator-form">
          <div className="segmented wide">
            <button
              className={form.payMode === "hourly" ? "selected" : ""}
              onClick={() => change({ payMode: "hourly" })}
            >
              Pago por hora
            </button>
            <button
              className={form.payMode === "monthly" ? "selected" : ""}
              onClick={() => change({ payMode: "monthly" })}
            >
              Sueldo fijo
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!calcError) onSave(form);
            }}
          >
            <div className="form-section">
              <h3>
                01 <span>Período de referencia</span>
              </h3>
              <div className="form-grid">
                <Field label="Desde">
                  <input
                    type="date"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </Field>
                <Field label="Hasta">
                  <input
                    type="date"
                    required
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </Field>
              </div>
              {form.payMode === "hourly" ? (
                <>
                  <label className="toggle-row">
                    <span>
                      <strong>Usar horas registradas</strong>
                      <small>Tomar las jornadas de este período</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.useRecords}
                      onChange={(e) => change({ useRecords: e.target.checked })}
                    />
                  </label>
                  {form.useRecords ? (
                    <div className="recorded-hours">
                      <Clock3 size={17} />
                      <strong>{number(recorded)} h</strong> registradas en este
                      período
                    </div>
                  ) : (
                    <Numeric
                      label="Horas normales"
                      value={manual}
                      onChange={setManual}
                    />
                  )}
                </>
              ) : (
                <p className="info-note">
                  El sueldo base se mantiene completo: el período es una
                  referencia, no prorratea el sueldo ni lo modifica según tus
                  registros.
                </p>
              )}
            </div>
            <div className="form-section">
              <h3>
                02{" "}
                <span>
                  {form.payMode === "hourly"
                    ? "Valor de tu trabajo"
                    : "Tu sueldo base"}
                </span>
              </h3>
              <div className="form-grid">
                {form.payMode === "hourly" ? (
                  <Numeric
                    label="Valor por hora"
                    value={form.rate}
                    onChange={(rate) => change({ rate })}
                  />
                ) : (
                  <Numeric
                    label="Sueldo mensual"
                    value={form.salary}
                    onChange={(salary) => change({ salary })}
                  />
                )}
                <Field label="Moneda">
                  <select
                    value={form.currency}
                    onChange={(e) => change({ currency: e.target.value })}
                  >
                    {["ARS", "USD", "EUR", "UYU", "CLP"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {form.payMode === "monthly" && (
                <Numeric
                  label="Horas mensuales pactadas"
                  value={form.agreedHours}
                  onChange={(agreedHours) => change({ agreedHours })}
                  hint="Solo se usan para estimar el valor de las horas extras; no reducen el sueldo base."
                />
              )}
            </div>
            <div className="form-section">
              <h3>
                03 <span>Extras y ajustes</span>
              </h3>
              <div className="form-grid">
                <Numeric
                  label="Horas extras"
                  value={extras}
                  onChange={setExtras}
                />
                <Numeric
                  label="Multiplicador de extras"
                  value={form.multiplier}
                  onChange={(multiplier) => change({ multiplier })}
                  hint="1 = sin recargo · 1,5 = +50 %"
                />
              </div>
              {form.payMode === "hourly" && form.useRecords && (
                <p className="footnote">
                  Las extras se separan del total registrado: {number(normal)} h
                  normales + {number(extras)} h extras. No se suman dos veces.
                </p>
              )}
              {form.payMode === "monthly" && (
                <Numeric
                  label="Ajuste / descuento"
                  value={adjustment}
                  onChange={setAdjustment}
                  min={-1000000000000}
                  hint="Importe positivo para adicionales; negativo para descuentos."
                />
              )}
            </div>
            <button className="secondary" disabled={busy || !!calcError}>
              <Check size={17} />
              Guardar parámetros
            </button>
          </form>
        </section>
        <aside className="pay-summary">
          <div className="pay-result">
            <span className="result-icon">
              <Calculator size={24} />
            </span>
            <span className="eyebrow">TU ESTIMACIÓN</span>
            <p className="estimate-label">Importe bruto estimado</p>
            <strong className="pay-total">
              {calcError ? "—" : money(pay.total)}
            </strong>
            <span className="currency-tag">
              {form.currency} ·{" "}
              {form.payMode === "hourly" ? "Pago por hora" : "Sueldo mensual"}
            </span>
            <div className="pay-breakdown">
              <div>
                <span>
                  {form.payMode === "hourly"
                    ? `Horas normales · ${number(normal)} h`
                    : "Sueldo base"}
                </span>
                <strong>{calcError ? "—" : money(pay.base)}</strong>
              </div>
              <div>
                <span>Extras · {number(extras)} h</span>
                <strong>{calcError ? "—" : money(pay.extra)}</strong>
              </div>
              {form.payMode === "monthly" && (
                <div>
                  <span>Ajustes</span>
                  <strong>{calcError ? "—" : money(pay.adjustment)}</strong>
                </div>
              )}
            </div>
            <span className="estimate-period">
              {from.split("-").reverse().join("/")} —{" "}
              {to.split("-").reverse().join("/")}
            </span>
          </div>
          {calcError && (
            <p className="form-error" role="alert">
              {calcError}
            </p>
          )}
          <div className="estimate-note">
            <ShieldCheck size={21} />
            <p>
              Una guía para organizarte.
              <br />
              <span>
                Es una estimación, no una liquidación salarial oficial. El
                recargo lo definís vos; no se aplican porcentajes legales
                automáticamente.
              </span>
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
