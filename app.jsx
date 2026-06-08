/* global React, ReactDOM */
const { useState, useEffect, useCallback } = React;

/* ---------- Validación ---------- */
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ id, label, type = "text", value, onChange, error, placeholder, autoComplete }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={error ? "invalid" : ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className="field__err">{error}</span> : null}
    </div>
  );
}

const pole = (
  <div className="barberpole modal__pole"></div>
);

/* ---------- Login ---------- */
function LoginForm({ onSwitch, onDone }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [errs, setErrs] = useState({});

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (!emailRe.test(email)) next.email = "Introduce un correo válido.";
    if (pass.length < 6) next.pass = "Mínimo 6 caracteres.";
    setErrs(next);
    if (Object.keys(next).length === 0) onDone("login", email);
  }

  return (
    <form className="modal__body" onSubmit={submit} noValidate>
      <Field id="li-email" label="Correo electrónico" type="email" value={email}
        onChange={setEmail} error={errs.email} placeholder="tu@correo.com" autoComplete="email" />
      <Field id="li-pass" label="Contraseña" type="password" value={pass}
        onChange={setPass} error={errs.pass} placeholder="••••••••" autoComplete="current-password" />
      <div className="checkrow">
        <input id="remember" type="checkbox" defaultChecked />
        <label htmlFor="remember">Recordarme en este dispositivo</label>
      </div>
      <button type="submit" className="btn btn--gold btn--block btn--lg">Entrar a mi cuenta</button>
      <p className="modal__foot">
        ¿No tienes cuenta?{" "}
        <button type="button" className="linklike" onClick={() => onSwitch("register")}>Regístrate aquí</button>
      </p>
    </form>
  );
}

/* ---------- Registro ---------- */
function RegisterForm({ onSwitch, onDone }) {
  const [f, setF] = useState({ nombre: "", tel: "", email: "", pass: "" });
  const [accept, setAccept] = useState(false);
  const [errs, setErrs] = useState({});
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  function submit(e) {
    e.preventDefault();
    const next = {};
    if (f.nombre.trim().length < 2) next.nombre = "Dinos tu nombre.";
    if (!/^[\d +()-]{7,}$/.test(f.tel)) next.tel = "Teléfono no válido.";
    if (!emailRe.test(f.email)) next.email = "Introduce un correo válido.";
    if (f.pass.length < 6) next.pass = "Mínimo 6 caracteres.";
    if (!accept) next.accept = "Debes aceptar para continuar.";
    setErrs(next);
    if (Object.keys(next).length === 0) onDone("register", f.nombre.split(" ")[0]);
  }

  return (
    <form className="modal__body" onSubmit={submit} noValidate>
      <Field id="rg-nombre" label="Nombre completo" value={f.nombre}
        onChange={set("nombre")} error={errs.nombre} placeholder="Juan Pérez" autoComplete="name" />
      <Field id="rg-tel" label="Teléfono" type="tel" value={f.tel}
        onChange={set("tel")} error={errs.tel} placeholder="+57 300 000 0000" autoComplete="tel" />
      <Field id="rg-email" label="Correo electrónico" type="email" value={f.email}
        onChange={set("email")} error={errs.email} placeholder="tu@correo.com" autoComplete="email" />
      <Field id="rg-pass" label="Contraseña" type="password" value={f.pass}
        onChange={set("pass")} error={errs.pass} placeholder="Mínimo 6 caracteres" autoComplete="new-password" />
      <div className="checkrow">
        <input id="accept" type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
        <label htmlFor="accept">Acepto recibir recordatorios de mis citas</label>
      </div>
      {errs.accept ? <span className="field__err" style={{ marginTop: "-10px", display: "block", marginBottom: "12px" }}>{errs.accept}</span> : null}
      <button type="submit" className="btn btn--gold btn--block btn--lg">Crear mi cuenta</button>
      <p className="modal__foot">
        ¿Ya eres cliente?{" "}
        <button type="button" className="linklike" onClick={() => onSwitch("login")}>Inicia sesión</button>
      </p>
    </form>
  );
}

/* ---------- Modal contenedor ---------- */
function AuthModal() {
  const [view, setView] = useState(null); // 'login' | 'register' | null
  const [done, setDone] = useState(null); // { kind, name }

  const open = useCallback((v) => { setDone(null); setView(v); }, []);
  const close = useCallback(() => { setView(null); setDone(null); }, []);

  useEffect(() => {
    const handler = (e) => {
      const btn = e.target.closest("[data-auth]");
      if (btn) { e.preventDefault(); open(btn.getAttribute("data-auth")); }
    };
    document.addEventListener("click", handler);
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", handler); document.removeEventListener("keydown", esc); };
  }, [open, close]);

  useEffect(() => {
    document.body.style.overflow = view ? "hidden" : "";
  }, [view]);

  if (!view) return null;

  const isLogin = view === "login";
  const titleText = done ? (done.kind === "register" ? "¡Listo!" : "Bienvenido") : (isLogin ? "Iniciar sesión" : "Registrarse");
  const subText = done ? "" : (isLogin ? "Reserva y gestiona tus citas en Barbertime." : "Únete y agenda tu próximo corte en segundos.");

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target.classList.contains("overlay")) close(); }}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal__top">
          <button className="modal__close" aria-label="Cerrar" onClick={close}>×</button>
          {pole}
          <h2 className="modal__title">{titleText}</h2>
          {subText ? <p className="modal__sub">{subText}</p> : null}
        </div>

        {done ? (
          <div className="modal__body">
            <div className="success">
              <div className="success__check">✓</div>
              <h3>{done.kind === "register" ? `Cuenta creada, ${done.name}` : `Hola de nuevo`}</h3>
              <p>
                {done.kind === "register"
                  ? "Ya puedes reservar tu cita y recibir recordatorios. Te esperamos en la silla."
                  : "Sesión iniciada correctamente. Reserva tu próximo corte cuando quieras."}
              </p>
              <button className="btn btn--solid-ink btn--block btn--lg" onClick={close}>Continuar</button>
            </div>
          </div>
        ) : isLogin ? (
          <LoginForm onSwitch={open} onDone={(kind, name) => setDone({ kind, name })} />
        ) : (
          <RegisterForm onSwitch={open} onDone={(kind, name) => setDone({ kind, name })} />
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("modal-root")).render(<AuthModal />);
