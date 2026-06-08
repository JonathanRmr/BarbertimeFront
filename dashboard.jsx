/* global React, ReactDOM */
const { useState, useEffect, useCallback, useRef } = React;

/* ============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║            CONFIGURACIÓN DE ENDPOINTS                   ║
   ║  Cambia las URLs base aquí cuando lo necesites.         ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================ */

const API = {
  /* Módulo Usuarios — puerto 5000
     Usado para: obtener datos del usuario logueado */
  USUARIOS: "http://localhost:5000",

  /* Módulo Servicios — puerto 4002
     Usado para: listar servicios del catálogo */
  SERVICIOS: "http://localhost:4002",

  /* Módulo Citas — puerto 4003
     Usado para: crear citas, listar mis citas, cancelar */
  CITAS: "http://localhost:4003",

  /* Módulo Admin — puerto 4004
     Usado para: obtener horarios de barberos (lista pública de barberos) */
  ADMIN: "http://localhost:4004",
};

/* ────────────────────────────────────────────────────────────
   HELPERS DE FETCH
   ──────────────────────────────────────────────────────────── */

/**
 * Leer el token guardado en localStorage tras el login.
 * La clave "bt_token" debe coincidir con la que uses al guardar en login.
 * El objeto "bt_user" debe tener al menos { _id, nombres, tipoUsuario }.
 */
function getToken() {
  return localStorage.getItem("bt_token") || "";
}
function getUser() {
  try { return JSON.parse(localStorage.getItem("bt_user") || "{}"); }
  catch { return {}; }
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.mensaje || data.error || `Error ${res.status}`);
  return data;
}

/* ────────────────────────────────────────────────────────────
   FORMATTERS
   ──────────────────────────────────────────────────────────── */
function fmtPrice(n) {
  return `$${Number(n).toLocaleString("es-CO")}`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleString("es-CO", {
    weekday: "short", year: "numeric", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: StatusPill
   ──────────────────────────────────────────────────────────── */
const STATUS_LABEL = {
  pendiente:  "Pendiente",
  confirmada: "Confirmada",
  completada: "Completada",
  cancelada:  "Cancelada",
};
function StatusPill({ estado }) {
  return (
    <span className={`status-pill status-pill--${estado}`}>
      {STATUS_LABEL[estado] || estado}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: SkeletonCards  (loader de servicios)
   ──────────────────────────────────────────────────────────── */
function SkeletonCards({ n = 6 }) {
  return (
    <div className="services-grid">
      {Array.from({ length: n }).map((_, i) => (
        <div className="skel-card" key={i}>
          <div className="skel-line skeleton skel-title" />
          <div className="skel-line skeleton skel-price" style={{ width: "40%" }} />
          <div className="skel-line skeleton" style={{ width: "80%" }} />
          <div className="skel-line skeleton" style={{ width: "55%" }} />
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: ServiceCard
   ──────────────────────────────────────────────────────────── */
function ServiceCard({ svc, selected, onSelect }) {
  return (
    <div
      className={`svc-card anim-up${selected ? " svc-card--selected" : ""}`}
      onClick={() => onSelect(svc)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(svc)}
    >
      <div className="svc-card__check">✓</div>
      <div className="svc-card__header">
        <span className="svc-card__name">{svc.nombre}</span>
        <span className="svc-card__price">{fmtPrice(svc.precio)}</span>
      </div>
      {svc.descripcion && (
        <p className="svc-card__desc">{svc.descripcion}</p>
      )}
      <div className="svc-card__meta">
        <span className="svc-card__badge svc-card__badge--gold">
          ⏱ {svc.duracionMinutos} min
        </span>
        {svc.categoria && (
          <span className="svc-card__badge">{svc.categoria}</span>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: BookingPanel
   Columna derecha — formulario para agendar cita
   ──────────────────────────────────────────────────────────── */
function BookingPanel({ selectedSvc, onClearSvc, barbers, onBooked }) {
  const user = getUser();

  // ── Estado del formulario ──
  const [barberoId,   setBarberoId]   = useState("");
  const [fecha,       setFecha]       = useState("");  // yyyy-mm-dd
  const [hora,        setHora]        = useState("");  // HH:mm
  const [notas,       setNotas]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState(null); // { type, text }

  // Mínimo hoy para el input de fecha
  const today = new Date().toISOString().split("T")[0];

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (!selectedSvc) return setMsg({ type: "error", text: "Selecciona un servicio de la lista." });
    if (!barberoId)   return setMsg({ type: "error", text: "Elige un barbero." });
    if (!fecha)       return setMsg({ type: "error", text: "Elige una fecha." });
    if (!hora)        return setMsg({ type: "error", text: "Elige una hora." });

    /* Construir fecha ISO combinando fecha + hora */
    const fechaHora = new Date(`${fecha}T${hora}:00`).toISOString();

    /*
     * ══════════════════════════════════════════════════════
     * ENDPOINT: POST /api/citas
     * Módulo:   Citas (puerto 4003)
     * Auth:     Bearer token (cliente logueado)
     * Nota:     Se envía snapshot del servicio (nombre, precio,
     *           duracion) tal como exige la regla de negocio.
     * ══════════════════════════════════════════════════════
     */
    setLoading(true);
    try {
      await apiFetch(`${API.CITAS}/api/citas`, {
        method: "POST",
        body: JSON.stringify({
          clienteId:       user._id,
          barberoId:       barberoId,
          servicioId:      selectedSvc._id,
          nombreServicio:  selectedSvc.nombre,          // snapshot
          precioServicio:  selectedSvc.precio,           // snapshot
          duracionMinutos: selectedSvc.duracionMinutos,  // snapshot
          fechaHora:       fechaHora,
          notas:           notas.trim() || undefined,
        }),
      });

      setMsg({ type: "success", text: "¡Cita agendada! Te esperamos en la silla." });
      setBarberoId(""); setFecha(""); setHora(""); setNotas("");
      onClearSvc();
      onBooked(); // refrescar lista de mis citas
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="booking-panel">
      <div className="booking-panel__header">
        <div className="barberpole modal__pole" style={{ height: 26 }}></div>
        <p className="booking-panel__title" style={{ marginTop: 12 }}>Reservar cita</p>
        <p className="booking-panel__sub">
          {selectedSvc
            ? "Completa los datos para confirmar tu turno."
            : "Selecciona un servicio a la izquierda."}
        </p>
      </div>

      <div className="booking-panel__body">
        {/* Servicio seleccionado */}
        {selectedSvc ? (
          <div className="booking-selected-svc">
            <span className="booking-selected-svc__name">{selectedSvc.nombre}</span>
            <span className="booking-selected-svc__price">{fmtPrice(selectedSvc.precio)}</span>
            <button
              type="button"
              className="booking-selected-svc__clear"
              onClick={onClearSvc}
              title="Quitar servicio"
            >×</button>
          </div>
        ) : (
          <div className="msg msg--error" style={{ textAlign: "center" }}>
            👈 Selecciona un servicio
          </div>
        )}

        {msg && <div className={`msg msg--${msg.type}`}>{msg.text}</div>}

        <form onSubmit={handleSubmit} noValidate>
          {/*
           * ══════════════════════════════════════════════════════
           * ENDPOINT: GET /api/admin/horarios/barberos
           * Módulo:   Admin (puerto 4004)
           * Auth:     Bearer token
           * Usado para: listar barberos disponibles.
           * Los barberos se extraen de los horarios registrados;
           * cada horario tiene barberoId y nombreBarbero.
           * Alternativa si tienes endpoint propio para barberos:
           *   GET http://localhost:5000/api/usuarios?tipoUsuario=barbero
           *   (requiere token de admin)
           * ══════════════════════════════════════════════════════
           */}
          <div className="field">
            <label htmlFor="bp-barbero">Barbero</label>
            <select
              id="bp-barbero"
              value={barberoId}
              onChange={(e) => setBarberoId(e.target.value)}
            >
              <option value="">— Elige tu barbero —</option>
              {barbers.map((b) => (
                <option key={b.barberoId} value={b.barberoId}>
                  {b.nombreBarbero}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="bp-fecha">Fecha</label>
              <input
                id="bp-fecha"
                type="date"
                value={fecha}
                min={today}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="bp-hora">Hora</label>
              <input
                id="bp-hora"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="bp-notas">Notas (opcional)</label>
            <textarea
              id="bp-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej: traer foto de referencia, prefiero máquina 2…"
            />
          </div>

          <button
            type="submit"
            className="btn btn--gold btn--block btn--lg"
            disabled={loading}
          >
            {loading ? "Agendando…" : "Agendar cita"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: ServicesTab
   ──────────────────────────────────────────────────────────── */
function ServicesTab({ barbers, onBooked }) {
  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    (async () => {
      /*
       * ══════════════════════════════════════════════════════
       * ENDPOINT: GET /api/servicios
       * Módulo:   Servicios (puerto 4002)
       * Auth:     Pública (no requiere token)
       * Query params opcionales: activo=true, page, limit
       * La respuesta es: { ok: true, data: [...], paginacion: {...} }
       * ══════════════════════════════════════════════════════
       */
      try {
        const res = await apiFetch(`${API.SERVICIOS}/api/servicios?activo=true&limit=50`);
        setServices(res.data || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="dash-section-head">
        <h2>Servicios &amp; Reservas</h2>
        <p>Selecciona el servicio que deseas y completa tu reserva en el panel lateral.</p>
      </div>

      <div className="booking-layout">
        {/* Columna izquierda — catálogo */}
        <div>
          {loading && <SkeletonCards />}
          {error   && <div className="msg msg--error">No se pudieron cargar los servicios: {error}</div>}
          {!loading && !error && services.length === 0 && (
            <div className="empty-state">
              <div className="empty-state__icon">✂️</div>
              <p className="empty-state__title">Sin servicios activos</p>
              <p className="empty-state__sub">Vuelve pronto, estamos actualizando el catálogo.</p>
            </div>
          )}
          {!loading && !error && (
            <div className="services-grid">
              {services.map((svc) => (
                <ServiceCard
                  key={svc._id}
                  svc={svc}
                  selected={selected?._id === svc._id}
                  onSelect={(s) => setSelected(selected?._id === s._id ? null : s)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Columna derecha — formulario de reserva (sticky) */}
        <div className="booking-sticky">
          <BookingPanel
            selectedSvc={selected}
            onClearSvc={() => setSelected(null)}
            barbers={barbers}
            onBooked={onBooked}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: CancelModal
   ──────────────────────────────────────────────────────────── */
function CancelModal({ cita, onClose, onCancelled }) {
  const [motivo,  setMotivo]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  async function handleCancel() {
    setError(null);
    setLoading(true);
    /*
     * ══════════════════════════════════════════════════════
     * ENDPOINT: PATCH /api/citas/:id/cancelar
     * Módulo:   Citas (puerto 4003)
     * Auth:     Bearer token (cliente dueño, barbero o admin)
     * Body:     { motivoCancelacion?: string }
     * ══════════════════════════════════════════════════════
     */
    try {
      await apiFetch(`${API.CITAS}/api/citas/${cita._id}/cancelar`, {
        method: "PATCH",
        body: JSON.stringify({ motivoCancelacion: motivo.trim() || undefined }),
      });
      onCancelled();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="cancel-modal-overlay" onMouseDown={(e) => { if (e.target.classList.contains("cancel-modal-overlay")) onClose(); }}>
      <div className="cancel-modal" role="dialog" aria-modal="true">
        <div className="cancel-modal__top">
          <h3 className="cancel-modal__title">Cancelar cita</h3>
          <button
            className="modal__close"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ position: "static" }}
          >×</button>
        </div>
        <div className="cancel-modal__body">
          <p style={{ marginBottom: 16, fontSize: 15, color: "var(--ink-soft)" }}>
            ¿Seguro que quieres cancelar <strong>{cita.nombreServicio}</strong> del {fmtDate(cita.fechaHora)}?
          </p>
          {error && <div className="msg msg--error">{error}</div>}
          <label htmlFor="cm-motivo">Motivo (opcional)</label>
          <textarea
            id="cm-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Cuéntanos por qué cancelas (opcional)…"
          />
          <div className="cancel-modal__actions">
            <button
              className="btn btn--danger btn--lg"
              onClick={handleCancel}
              disabled={loading}
            >
              {loading ? "Cancelando…" : "Sí, cancelar cita"}
            </button>
            <button className="btn btn--ghost" onClick={onClose} style={{ borderColor: "var(--hair)", color: "var(--ink-soft)" }}>
              Volver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE: AppointmentsTab
   ──────────────────────────────────────────────────────────── */
function AppointmentsTab({ refreshKey }) {
  const user = getUser();
  const [citas,   setCitas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [toCancel, setToCancel] = useState(null); // cita a cancelar

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    /*
     * ══════════════════════════════════════════════════════
     * ENDPOINT: GET /api/citas
     * Módulo:   Citas (puerto 4003)
     * Auth:     Bearer token (requerido)
     * Query:    clienteId=<id del usuario logueado>
     *           (también acepta: estado, desde, hasta, page, limit)
     * La respuesta es: { ok: true, data: [...], paginacion: {...} }
     * ══════════════════════════════════════════════════════
     */
    try {
      const res = await apiFetch(
        `${API.CITAS}/api/citas?clienteId=${user._id}&limit=50`
      );
      // Ordenar por fecha descendente (más recientes primero)
      const sorted = (res.data || []).sort(
        (a, b) => new Date(b.fechaHora) - new Date(a.fechaHora)
      );
      setCitas(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user._id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (loading) return <div className="spinner" />;
  if (error)   return <div className="msg msg--error">No se pudieron cargar tus citas: {error}</div>;

  const active   = citas.filter((c) => c.estado === "pendiente" || c.estado === "confirmada");
  const historic = citas.filter((c) => c.estado === "completada" || c.estado === "cancelada");

  return (
    <div>
      <div className="dash-section-head">
        <h2>Mis citas</h2>
        <p>Aquí puedes ver y gestionar todas tus reservas.</p>
      </div>

      {citas.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">📅</div>
          <p className="empty-state__title">Sin citas aún</p>
          <p className="empty-state__sub">Ve a la pestaña «Servicios» y agenda tu primer corte.</p>
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="dash-divider">Próximas</div>
          <div className="appointments-list">
            {active.map((cita) => (
              <div className="appt-card anim-up" key={cita._id}>
                <div>
                  <p className="appt-card__service">{cita.nombreServicio}</p>
                  <div className="appt-card__meta">
                    <span>📅 {fmtDate(cita.fechaHora)}</span>
                    <span>⏱ {cita.duracionMinutos} min</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="appt-card__price">{fmtPrice(cita.precioServicio)}</p>
                  <StatusPill estado={cita.estado} />
                </div>
                {(cita.estado === "pendiente" || cita.estado === "confirmada") && (
                  <div className="appt-card__actions">
                    <button
                      className="btn btn--danger"
                      style={{ fontSize: 12 }}
                      onClick={() => setToCancel(cita)}
                    >
                      Cancelar cita
                    </button>
                    {cita.notas && (
                      <span style={{ fontSize: 13, color: "var(--ink-soft)", alignSelf: "center" }}>
                        📝 {cita.notas}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {historic.length > 0 && (
        <>
          <div className="dash-divider" style={{ marginTop: 36 }}>Historial</div>
          <div className="appointments-list">
            {historic.map((cita) => (
              <div className="appt-card" key={cita._id} style={{ opacity: 0.75 }}>
                <div>
                  <p className="appt-card__service">{cita.nombreServicio}</p>
                  <div className="appt-card__meta">
                    <span>📅 {fmtDate(cita.fechaHora)}</span>
                    <span>⏱ {cita.duracionMinutos} min</span>
                    {cita.motivoCancelacion && (
                      <span style={{ fontStyle: "italic" }}>"{cita.motivoCancelacion}"</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="appt-card__price">{fmtPrice(cita.precioServicio)}</p>
                  <StatusPill estado={cita.estado} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {toCancel && (
        <CancelModal
          cita={toCancel}
          onClose={() => setToCancel(null)}
          onCancelled={() => { setToCancel(null); load(); }}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE RAÍZ: Dashboard
   ──────────────────────────────────────────────────────────── */
function Dashboard() {
  const [tab,        setTab]        = useState("servicios"); // "servicios" | "citas"
  const [barbers,    setBarbers]    = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const user = getUser();

  /* Actualizar el saludo en el nav */
  useEffect(() => {
    const el = document.getElementById("nav-greeting");
    if (el && user.nombres) el.textContent = `Hola, ${user.nombres.split(" ")[0]}`;
  }, [user.nombres]);

  /* Cerrar sesión */
  useEffect(() => {
    const btn = document.getElementById("btn-logout");
    if (!btn) return;
    const handle = () => {
      localStorage.removeItem("bt_token");
      localStorage.removeItem("bt_user");
      window.location.href = "Barbertime.html";
    };
    btn.addEventListener("click", handle);
    return () => btn.removeEventListener("click", handle);
  }, []);

  /* Cargar lista de barberos (vía horarios admin) */
  useEffect(() => {
    (async () => {
      /*
       * ══════════════════════════════════════════════════════
       * ENDPOINT: GET /api/admin/horarios/barberos
       * Módulo:   Admin (puerto 4004)
       * Auth:     Bearer token
       * Usado para: obtener la lista de barberos disponibles
       *             a partir de sus horarios registrados.
       * Se deduplican por barberoId para mostrar cada barbero
       * solo una vez en el selector.
       *
       * ⚠️  Si prefieres un endpoint dedicado de barberos,
       *     reemplaza esta llamada por:
       *     GET http://localhost:5000/api/usuarios?tipoUsuario=barbero
       *     (requiere token de admin)
       * ══════════════════════════════════════════════════════
       */
      try {
        const res = await apiFetch(`${API.ADMIN}/api/admin/horarios/barberos?activo=true`);
        const horarios = res.data || [];
        // Deduplicar por barberoId
        const seen = new Set();
        const unique = horarios.filter((h) => {
          if (seen.has(h.barberoId)) return false;
          seen.add(h.barberoId);
          return true;
        });
        setBarbers(unique);
      } catch {
        // Si falla (p.ej. sin horarios aún), continuar sin barberos
        setBarbers([]);
      }
    })();
  }, []);

  function onBooked() {
    setRefreshKey((k) => k + 1);
    setTab("citas");
  }

  return (
    <>
      {/* Hero del dashboard */}
      <section className="dash-hero">
        <div className="wrap dash-hero__inner">
          <div className="dash-hero__copy">
            <span className="dash-hero__eyebrow">Panel de cliente</span>
            <h1 className="dash-hero__title">
              TU PRÓXIMO<br /><span>CORTE</span>
            </h1>
            <p className="dash-hero__sub">
              Elige tu servicio, tu barbero y el horario que mejor te quede.
            </p>
          </div>
          <div style={{ textAlign: "right", opacity: 0.6 }}>
            <div className="barberpole" style={{ height: 80, display: "inline-block" }}></div>
          </div>
        </div>
      </section>

      {/* Pestañas */}
      <div className="dash-tabs">
        <button
          className={`dash-tab${tab === "servicios" ? " dash-tab--active" : ""}`}
          onClick={() => setTab("servicios")}
        >
          ✂ Servicios &amp; Reserva
        </button>
        <button
          className={`dash-tab${tab === "citas" ? " dash-tab--active" : ""}`}
          onClick={() => setTab("citas")}
        >
          📅 Mis citas
        </button>
      </div>

      {/* Contenido de pestaña */}
      <main className="dash-main">
        <div className="wrap">
          {tab === "servicios" && (
            <ServicesTab barbers={barbers} onBooked={onBooked} />
          )}
          {tab === "citas" && (
            <AppointmentsTab refreshKey={refreshKey} />
          )}
        </div>
      </main>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("dash-root")).render(<Dashboard />);