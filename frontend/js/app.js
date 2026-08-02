const { useState, useEffect, useCallback, useRef } = React;

/* ---------------------------------------------------------------- */
/* Petit client API                                                   */
/* ---------------------------------------------------------------- */

let csrfToken = null;

async function api(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

/* ---------------------------------------------------------------- */
/* Routeur minimal basé sur le hash                                   */
/* ---------------------------------------------------------------- */

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function navigate(path) {
  window.location.hash = path;
}

/* ---------------------------------------------------------------- */
/* Contexte utilisateur                                               */
/* ---------------------------------------------------------------- */

function useCurrentUser() {
  const [user, setUser] = useState(undefined); // undefined = chargement
  const refresh = useCallback(() => {
    api("/api/me").then((d) => {
      setUser(d.user);
      if (d.csrfToken) csrfToken = d.csrfToken;
    }).catch(() => setUser(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return [user, refresh];
}

/* ---------------------------------------------------------------- */
/* reCAPTCHA (rendu manuel, un widget à la fois)                      */
/* ---------------------------------------------------------------- */

function Recaptcha({ siteKey, onToken }) {
  const ref = useRef(null);
  const widgetId = useRef(null);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    function render() {
      if (cancelled || !window.grecaptcha || !window.grecaptcha.render || !ref.current) {
        return setTimeout(render, 200);
      }
      if (widgetId.current === null) {
        widgetId.current = window.grecaptcha.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(null),
        });
      }
    }
    render();
    return () => { cancelled = true; };
  }, [siteKey]);

  return <div className="g-recaptcha" ref={ref}></div>;
}

/* ---------------------------------------------------------------- */
/* En-tête / navigation                                               */
/* ---------------------------------------------------------------- */

function TopBar({ user, onLogout }) {
  const [q, setQ] = useState("");
  function submitSearch(e) {
    e.preventDefault();
    navigate(`#/livres?q=${encodeURIComponent(q)}`);
  }
  return (
    <div className="top-bar">
      <div className="top-bar-inner">
        <div className="brand" onClick={() => navigate("#/")}>
          Le Fichier <small>domaine public</small>
        </div>
        <form className="search-box" onSubmit={submitSearch}>
          <input
            type="search"
            placeholder="Titre, auteur…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Rechercher un livre"
          />
          <button type="submit">Chercher</button>
        </form>
        <nav className="main-nav">
          <a href="#/livres" onClick={(e) => { e.preventDefault(); navigate("#/livres"); }}>Catalogue</a>
          <a href="#/contact" onClick={(e) => { e.preventDefault(); navigate("#/contact"); }}>Contact</a>
          {user === undefined ? null : user ? (
            <>
              {user.role === "admin" && (
                <a href="#/admin" onClick={(e) => { e.preventDefault(); navigate("#/admin"); }}>Admin</a>
              )}
              <span className="mono">{user.username}</span>
              <button className="linklike" onClick={onLogout}>Déconnexion</button>
            </>
          ) : (
            <>
              <a href="#/connexion" onClick={(e) => { e.preventDefault(); navigate("#/connexion"); }}>Connexion</a>
              <a href="#/inscription" onClick={(e) => { e.preventDefault(); navigate("#/inscription"); }}>Inscription</a>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Accueil                                                            */
/* ---------------------------------------------------------------- */

function Home() {
  return (
    <div className="app-shell">
      <div className="hero">
        <div className="eyebrow">Catalogue N° 1 — mis à jour aujourd'hui</div>
        <h1>Un vieux fichier de bibliothèque, ouvert à tous.</h1>
        <p className="lede">
          Romans, contes, essais et magazines tombés dans le domaine public, rangés comme
          au temps des fiches cartonnées — et téléchargeables librement, sans compte requis
          pour lire les fiches.
        </p>
        <div style={{ marginTop: "1.2rem" }}>
          <button className="btn" onClick={() => navigate("#/livres")}>Parcourir le catalogue</button>
        </div>
      </div>
      <CategoryPreview />
    </div>
  );
}

function PosterStack({ color }) {
  // Empile quelques rectangles décalés pour évoquer une pile d'affiches
  const layers = [
    { rotate: -8, offset: 10, opacity: 0.35 },
    { rotate: 6, offset: 6, opacity: 0.55 },
    { rotate: -3, offset: 3, opacity: 0.8 },
    { rotate: 0, offset: 0, opacity: 1 },
  ];
  return (
    <div className="stack-visual">
      {layers.map((l, i) => (
        <div
          key={i}
          className="poster"
          style={{
            background: color,
            transform: `translateY(${l.offset}px) rotate(${l.rotate}deg)`,
            opacity: l.opacity,
          }}
        />
      ))}
    </div>
  );
}

function CategoryPreview() {
  const [categories, setCategories] = useState([]);
  useEffect(() => { api("/api/categories").then(setCategories).catch(() => {}); }, []);
  return (
    <div className="category-stacks">
      {categories.map((c) => (
        <button
          key={c.id}
          className="stack-tile"
          onClick={() => navigate(`#/livres?category=${c.id}`)}
        >
          <PosterStack color={c.color} />
          <span className="tile-label">{c.label}</span>
          <span className="tile-code mono">{c.code}</span>
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Catalogue                                                          */
/* ---------------------------------------------------------------- */

function useQueryParams(hash) {
  const idx = hash.indexOf("?");
  return idx === -1 ? {} : Object.fromEntries(new URLSearchParams(hash.slice(idx + 1)));
}

function Catalog({ hash }) {
  const params = useQueryParams(hash);
  const [categories, setCategories] = useState([]);
  const [books, setBooks] = useState(null);
  const [active, setActive] = useState(params.category || "");

  useEffect(() => { api("/api/categories").then(setCategories).catch(() => {}); }, []);
  useEffect(() => { setActive(params.category || ""); }, [params.category]);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q) qs.set("q", params.q);
    setBooks(null);
    api(`/api/books?${qs.toString()}`).then(setBooks).catch(() => setBooks([]));
  }, [params.category, params.q]);

  return (
    <div className="app-shell">
      <h1 style={{ margin: "2rem 0 0.4rem" }}>Catalogue</h1>
      {params.q && <p className="mono">Résultats pour « {params.q} »</p>}

      <div className="drawer-tabs" role="tablist" aria-label="Catégories">
        <button
          className="drawer-tab"
          aria-selected={!active}
          onClick={() => navigate("#/livres")}
        >
          Tous
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className="drawer-tab"
            aria-selected={active === c.id}
            style={{ "--tab-color": c.color }}
            onClick={() => navigate(`#/livres?category=${c.id}`)}
          >
            {c.code} · {c.label}
          </button>
        ))}
      </div>

      {books === null ? (
        <p className="empty-state">Ouverture du tiroir…</p>
      ) : books.length === 0 ? (
        <p className="empty-state">Aucune fiche ne correspond à cette recherche.</p>
      ) : (
        <div className="book-grid">
          {books.map((b, i) => {
            const cat = categories.find((c) => c.id === b.category);
            const tilt = i % 2 === 0 ? "-1.2deg" : "1.4deg";
            return (
              <div
                key={b.id}
                className="index-card"
                style={{ "--card-color": cat ? cat.color : "#FF5A36", "--tilt": tilt }}
                tabIndex={0}
                role="link"
                onClick={() => navigate(`#/livre/${b.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`#/livre/${b.id}`)}
              >
                <span className="stamp">{b.year}</span>
                <h3>{b.title}</h3>
                <div className="author">{b.author}</div>
                <p className="summary">{b.summary}</p>
                <div className="meta">{b.sourceLabel}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Fiche livre + commentaires                                         */
/* ---------------------------------------------------------------- */

function BookDetail({ id, user }) {
  const [book, setBook] = useState(null);
  const [categories, setCategories] = useState([]);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const loadComments = useCallback(() => {
    api(`/api/books/${id}/comments`).then(setComments).catch(() => {});
  }, [id]);

  useEffect(() => { api("/api/categories").then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    setBook(null);
    setNotFound(false);
    api(`/api/books/${id}`).then(setBook).catch(() => setNotFound(true));
    loadComments();
  }, [id, loadComments]);

  const cat = book ? categories.find((c) => c.id === book.category) : null;

  async function submitComment(e) {
    e.preventDefault();
    setError("");
    if (text.trim().length < 2) return setError("Écris un commentaire un peu plus long.");
    try {
      await api(`/api/books/${id}/comments`, { method: "POST", body: { text } });
      setText("");
      loadComments();
    } catch (err) {
      setError(err.message);
    }
  }

  if (notFound) return <div className="app-shell"><p className="empty-state">Cette fiche n'existe pas.</p></div>;
  if (!book) return <div className="app-shell"><p className="empty-state">Ouverture du tiroir…</p></div>;

  return (
    <div className="app-shell">
      <div className="book-detail" style={{ "--detail-color": cat ? cat.color : "#FF5A36" }}>
        <span className="stamp" style={{ background: cat ? cat.color : "#FF5A36", color: "#fff" }}>{book.year}</span>
        <h1 style={{ marginTop: "0.6rem" }}>{book.title}</h1>
        <p className="author" style={{ color: "var(--forest)" }}>{book.author}</p>
        <p>{book.summary}</p>
        <div className="meta-row">
          <a className="btn" href={book.source} target="_blank" rel="noopener noreferrer">
            Lire / télécharger sur {book.sourceLabel}
          </a>
          <button className="btn secondary" onClick={() => navigate("#/livres")}>Retour au catalogue</button>
        </div>
      </div>

      <div className="comments">
        <h2>Commentaires</h2>

        {user ? (
          <form className="comment-form" onSubmit={submitComment}>
            {error && <div className="form-error">{error}</div>}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Qu'as-tu pensé de cette lecture ?"
              maxLength={1000}
            />
            <div style={{ marginTop: "0.6rem" }}>
              <button className="btn" type="submit">Publier</button>
            </div>
          </form>
        ) : (
          <p className="empty-state">
            <a href="#/connexion" onClick={(e) => { e.preventDefault(); navigate("#/connexion"); }}>Connecte-toi</a> pour laisser un commentaire.
          </p>
        )}

        {comments.length === 0 ? (
          <p className="empty-state">Pas encore de commentaire sur cette fiche.</p>
        ) : (
          comments.map((c) => (
            <div className="comment" key={c.id}>
              <div className="who">{c.username} · {new Date(c.createdAt).toLocaleDateString("fr-FR")}</div>
              <p>{c.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Auth : inscription / connexion                                     */
/* ---------------------------------------------------------------- */

function AuthForm({ mode, onAuth }) {
  const isRegister = mode === "register";
  const [siteKey, setSiteKey] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/api/csrf").then((d) => { csrfToken = d.csrfToken; setSiteKey(d.recaptchaSiteKey); });
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!captchaToken) return setError("Merci de valider le reCAPTCHA.");
    setLoading(true);
    try {
      const path = isRegister ? "/api/register" : "/api/login";
      const body = isRegister
        ? { username: form.username, email: form.email, password: form.password, recaptchaToken: captchaToken }
        : { email: form.email, password: form.password, recaptchaToken: captchaToken };
      const data = await api(path, { method: "POST", body });
      csrfToken = data.csrfToken;
      onAuth(data.user);
      navigate("#/");
    } catch (err) {
      setError(err.message);
      if (window.grecaptcha) window.grecaptcha.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="form-card">
        <h1>{isRegister ? "Créer un compte" : "Connexion"}</h1>
        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          {isRegister && (
            <div className="field">
              <label htmlFor="username">Pseudo</label>
              <input id="username" required minLength={3} maxLength={40} value={form.username} onChange={update("username")} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={form.email} onChange={update("email")} />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input id="password" type="password" required minLength={8} value={form.password} onChange={update("password")} />
          </div>
          {siteKey && <Recaptcha siteKey={siteKey} onToken={setCaptchaToken} />}
          <button className="btn" type="submit" disabled={loading}>
            {isRegister ? "S'inscrire" : "Se connecter"}
          </button>
        </form>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
          {isRegister ? (
            <>Déjà un compte ? <a href="#/connexion" onClick={(e) => { e.preventDefault(); navigate("#/connexion"); }}>Se connecter</a></>
          ) : (
            <>Pas encore de compte ? <a href="#/inscription" onClick={(e) => { e.preventDefault(); navigate("#/inscription"); }}>S'inscrire</a></>
          )}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Contact                                                            */
/* ---------------------------------------------------------------- */

function Contact() {
  const [siteKey, setSiteKey] = useState(null);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api("/api/csrf").then((d) => { csrfToken = d.csrfToken; setSiteKey(d.recaptchaSiteKey); });
  }, []);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!captchaToken) return setError("Merci de valider le reCAPTCHA.");
    setLoading(true);
    try {
      await api("/api/contact", { method: "POST", body: { ...form, recaptchaToken: captchaToken } });
      setSuccess(true);
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setError(err.message);
      if (window.grecaptcha) window.grecaptcha.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="form-card">
        <h1>Contact</h1>
        <form onSubmit={submit}>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="form-success">Message envoyé, merci !</div>}
          <div className="field">
            <label htmlFor="name">Nom</label>
            <input id="name" required value={form.name} onChange={update("name")} />
          </div>
          <div className="field">
            <label htmlFor="cemail">E-mail</label>
            <input id="cemail" type="email" required value={form.email} onChange={update("email")} />
          </div>
          <div className="field">
            <label htmlFor="subject">Sujet</label>
            <input id="subject" required value={form.subject} onChange={update("subject")} />
          </div>
          <div className="field">
            <label htmlFor="message">Message</label>
            <textarea id="message" required minLength={10} rows={5} value={form.message} onChange={update("message")} />
          </div>
          {siteKey && <Recaptcha siteKey={siteKey} onToken={setCaptchaToken} />}
          <button className="btn" type="submit" disabled={loading}>Envoyer</button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Admin : messages reçus                                             */
/* ---------------------------------------------------------------- */

function Admin({ user }) {
  const [messages, setMessages] = useState(null);
  useEffect(() => {
    if (user && user.role === "admin") {
      api("/api/admin/messages").then(setMessages).catch(() => setMessages([]));
    }
  }, [user]);

  if (user === undefined) return null;
  if (!user || user.role !== "admin") {
    return <div className="app-shell"><p className="empty-state">Accès réservé à l'administrateur.</p></div>;
  }
  return (
    <div className="app-shell">
      <h1 style={{ margin: "2rem 0 1rem" }}>Messages reçus</h1>
      {messages === null ? (
        <p className="empty-state">Chargement…</p>
      ) : messages.length === 0 ? (
        <p className="empty-state">Aucun message pour le moment.</p>
      ) : (
        messages.map((m) => (
          <div className="comment" key={m.id}>
            <div className="who">{m.name} ({m.email}) · {new Date(m.createdAt).toLocaleString("fr-FR")}</div>
            <strong>{m.subject}</strong>
            <p>{m.message}</p>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* App racine + routage                                               */
/* ---------------------------------------------------------------- */

function App() {
  const hash = useHashRoute();
  const [user, refreshUser] = useCurrentUser();

  async function handleLogout() {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    csrfToken = null;
    refreshUser();
    navigate("#/");
  }

  const path = hash.split("?")[0];
  let page;
  if (path === "#/" || path === "" || path === "#") page = <Home />;
  else if (path === "#/livres") page = <Catalog hash={hash} />;
  else if (path.startsWith("#/livre/")) page = <BookDetail id={path.replace("#/livre/", "")} user={user} />;
  else if (path === "#/connexion") page = <AuthForm mode="login" onAuth={refreshUser} />;
  else if (path === "#/inscription") page = <AuthForm mode="register" onAuth={refreshUser} />;
  else if (path === "#/contact") page = <Contact />;
  else if (path === "#/admin") page = <Admin user={user} />;
  else page = <div className="app-shell"><p className="empty-state">Page introuvable.</p></div>;

  return (
    <>
      <TopBar user={user} onLogout={handleLogout} />
      {page}
      <footer>
        <div className="app-shell">
          <span>Le Fichier — catalogue d'œuvres du domaine public, à but non lucratif.</span>
          <span>Sources : Projet Gutenberg, Gallica (BnF)</span>
        </div>
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
