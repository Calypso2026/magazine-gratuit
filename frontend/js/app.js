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
/* Affiches génériques (couvertures générées, pas de vraies images)  */
/* ---------------------------------------------------------------- */

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function seededRand(seed) {
  let s = (seed % 2147483647) || 1;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function CoverArt({ id, color, context = "c", imageUrl }) {
  if (imageUrl) {
    return <img className="cover-art" src={imageUrl} alt="" loading="lazy" />;
  }
  const rand = seededRand(hashStr(id + context));
  const shapes = Array.from({ length: 3 }).map((_, i) => ({
    cx: 20 + rand() * 160,
    cy: 15 + rand() * 90,
    r: 18 + rand() * 42,
    opacity: 0.12 + rand() * 0.22,
  }));
  const gid = `cover-${context}-${id}`;
  return (
    <svg className="cover-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor="#0A1128" />
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill={`url(#${gid})`} />
      {shapes.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#fff" opacity={s.opacity} />
      ))}
      <rect x="0" y="0" width="200" height="120" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    </svg>
  );
}



function LogoMark() {
  return (
    <svg width="34" height="34" viewBox="0 0 44 44" aria-hidden="true">
      <defs>
        <linearGradient id="logoGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F7E7B4" />
          <stop offset="50%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#9C7A22" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="20" fill="none" stroke="url(#logoGold)" strokeWidth="1.4" />
      <circle cx="22" cy="22" r="16.5" fill="none" stroke="url(#logoGold)" strokeWidth="0.7" opacity="0.7" />
      <text
        x="22" y="29"
        textAnchor="middle"
        fontFamily="'Playfair Display', serif"
        fontWeight="700"
        fontSize="19"
        fill="url(#logoGold)"
      >M</text>
      <circle cx="22" cy="6.5" r="1.1" fill="url(#logoGold)" />
      <circle cx="22" cy="37.5" r="1.1" fill="url(#logoGold)" />
    </svg>
  );
}

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
          <LogoMark />
          <span className="brand-text">
            <span className="brand-main">MAGAZINE GRATUIT</span>
            <span className="brand-sub mono">.com</span>
          </span>
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

function CategoryPreview() {
  const [categories, setCategories] = useState([]);
  const [books, setBooks] = useState([]);
  useEffect(() => { api("/api/categories").then(setCategories).catch(() => {}); }, []);
  useEffect(() => { api("/api/books").then(setBooks).catch(() => {}); }, []);

  return (
    <div className="category-column">
      {categories.map((c) => {
        const preview = books.filter((b) => b.category === c.id).slice(0, 6);
        return (
          <div
            key={c.id}
            className="category-row"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`#/livres?category=${c.id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`#/livres?category=${c.id}`)}
          >
            <div
              className="category-band"
              style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}99)` }}
            >
              <div>
                <span className="tile-label">{c.label}</span>
                <span className="tile-code mono">{c.code}</span>
              </div>
            </div>
            {preview.length > 0 && (
              <div className="mini-posters">
                {preview.map((b) => (
                  <div key={b.id} className="mini-poster">
                    <CoverArt id={b.id} color={c.color} context="mini" imageUrl={b.coverImage} />
                    <div className="mp-body">
                      <span className="mp-title">{b.title}</span>
                      {b.year && <span className="mp-year mono">{b.year}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
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
          {books.map((b) => {
            const cat = categories.find((c) => c.id === b.category);
            return (
              <div
                key={b.id}
                className="index-card"
                style={{ "--card-color": cat ? cat.color : "#5B6CFF" }}
                tabIndex={0}
                role="link"
                onClick={() => navigate(`#/livre/${b.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`#/livre/${b.id}`)}
              >
                <CoverArt id={b.id} color={cat ? cat.color : "#5B6CFF"} context="grid" imageUrl={b.coverImage} />
                {b.source && (
                  <a
                    href={b.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-download"
                    title={`Télécharger : ${b.title}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
                      <path fill="currentColor" d="M10 2a1 1 0 0 1 1 1v7.6l2.3-2.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L9 10.6V3a1 1 0 0 1 1-1Z M4 15a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z" />
                    </svg>
                  </a>
                )}
                <div className="card-body">
                  {b.year && <span className="stamp">{b.year}</span>}
                  <h3>{b.title}</h3>
                  {b.author && <div className="author">{b.author}</div>}
                  <p className="summary">{b.summary}</p>
                  <div className="meta">{b.sourceLabel}</div>
                </div>
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
  const [related, setRelated] = useState([]);
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
    setRelated([]);
    api(`/api/books/${id}`)
      .then((b) => {
        setBook(b);
        api(`/api/books?category=${b.category}`).then((list) => {
          const sameCategory = list.filter((x) => x.id !== id);
          if (sameCategory.length > 0) {
            setRelated(sameCategory.slice(0, 4));
          } else {
            api("/api/books").then((all) => {
              setRelated(all.filter((x) => x.id !== id).slice(0, 4));
            }).catch(() => {});
          }
        }).catch(() => {});
      })
      .catch(() => setNotFound(true));
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
      <div className="book-detail" style={{ "--detail-color": cat ? cat.color : "#5B6CFF" }}>
        <CoverArt id={book.id} color={cat ? cat.color : "#5B6CFF"} context="detail" imageUrl={book.coverImage} />
        <div className="detail-body">
        {book.year && <span className="stamp" style={{ background: cat ? cat.color : "#5B6CFF", color: "#fff" }}>{book.year}</span>}
        <h1 style={{ marginTop: "0.6rem" }}>{book.title}</h1>
        {book.author && <p className="author" style={{ color: "var(--text-dim)" }}>{book.author}</p>}
        <p>{book.summary}</p>
        <div className="meta-row">
          {book.source && (
            <a className="btn" href={book.source} target="_blank" rel="noopener noreferrer">
              Télécharger
            </a>
          )}
          <button className="btn secondary" onClick={() => navigate("#/livres")}>Retour au catalogue</button>
        </div>
        </div>
      </div>

      {related.length > 0 && (
        <div className="related-section">
          <h2 style={{ marginBottom: "1rem" }}>Fiches similaires</h2>
          <div className="book-grid related-grid">
            {related.map((r) => (
              <div
                key={r.id}
                className="index-card"
                style={{ "--card-color": cat ? cat.color : "#5B6CFF" }}
                tabIndex={0}
                role="link"
                onClick={() => navigate(`#/livre/${r.id}`)}
                onKeyDown={(e) => e.key === "Enter" && navigate(`#/livre/${r.id}`)}
              >
                <CoverArt id={r.id} color={cat ? cat.color : "#5B6CFF"} context="related" imageUrl={r.coverImage} />
                <div className="card-body">
                  {r.year && <span className="stamp">{r.year}</span>}
                  <h3>{r.title}</h3>
                  {r.author && <div className="author">{r.author}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

const EMPTY_BOOK_FORM = { title: "", author: "", year: "", category: "", summary: "", source: "", sourceLabel: "", coverImage: "" };

function AdminBooks({ categories }) {
  const [books, setBooks] = useState(null);
  const [form, setForm] = useState(EMPTY_BOOK_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => { api("/api/books").then(setBooks).catch(() => setBooks([])); }, []);
  useEffect(() => { load(); }, [load]);

  function update(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }

  function startEdit(b) {
    setEditingId(b.id);
    setForm({ title: b.title, author: b.author, year: b.year, category: b.category, summary: b.summary, source: b.source, sourceLabel: b.sourceLabel, coverImage: b.coverImage || "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingId(null); setForm(EMPTY_BOOK_FORM); setError(""); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editingId) {
        await api(`/api/admin/books/${editingId}`, { method: "PUT", body: form });
      } else {
        await api("/api/admin/books", { method: "POST", body: form });
      }
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Supprimer définitivement cette fiche et ses commentaires ?")) return;
    try {
      await api(`/api/admin/books/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>{editingId ? "Modifier la fiche" : "Ajouter une fiche"}</h2>
      <form onSubmit={submit} className="admin-form">
        {error && <div className="form-error">{error}</div>}
        <div className="admin-form-grid">
          <div className="field">
            <label>Titre</label>
            <input required value={form.title} onChange={update("title")} placeholder="Le titre du livre / magazine" />
          </div>
          <div className="field">
            <label>Catégorie</label>
            <select required value={form.category} onChange={update("category")}>
              <option value="">— choisir —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Description</label>
            <textarea rows={2} value={form.summary} onChange={update("summary")} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Image (URL)</label>
            <input
              value={form.coverImage}
              onChange={update("coverImage")}
              placeholder="https://exemple.com/couverture.jpg"
            />
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Colle ici le lien direct d'une image (ex. une photo hébergée sur imgur.com — dépose ton image dessus,
              clic droit sur l'image affichée → « Copier l'adresse de l'image »). Laisse vide pour garder l'affiche générée automatiquement.
            </span>
            {form.coverImage && (
              <img src={form.coverImage} alt="Aperçu" className="admin-cover-preview" />
            )}
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Lien de téléchargement</label>
            <input value={form.source} onChange={update("source")} placeholder="https://..." />
            <span style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
              Le lien vers lequel pointera le bouton « Télécharger » sur la fiche.
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.7rem", marginTop: "1rem" }}>
          <button className="btn" type="submit" disabled={saving}>{editingId ? "Enregistrer" : "Ajouter"}</button>
          {editingId && <button type="button" className="btn secondary" onClick={cancelEdit}>Annuler</button>}
        </div>
      </form>

      <h2 style={{ margin: "2.2rem 0 1rem" }}>Fiches existantes ({books ? books.length : "…"})</h2>
      {books === null ? (
        <p className="empty-state">Chargement…</p>
      ) : books.length === 0 ? (
        <p className="empty-state">Aucune fiche pour le moment — ajoute la première ci-dessus.</p>
      ) : (
        <div className="admin-list">
          {books.map((b) => {
            const cat = categories.find((c) => c.id === b.category);
            return (
              <div className="admin-row" key={b.id}>
                <div className="admin-row-thumb">
                  <CoverArt id={b.id} color={cat ? cat.color : "#5B6CFF"} context="admin" imageUrl={b.coverImage} />
                </div>
                <span className="stamp" style={{ background: cat ? cat.color : "#5B6CFF" }}>{cat ? cat.label : b.category}</span>
                <div className="admin-row-main">
                  <strong>{b.title}</strong>
                </div>
                <div className="admin-row-actions">
                  <button className="btn secondary" onClick={() => startEdit(b)}>Modifier</button>
                  <button className="btn secondary danger" onClick={() => remove(b.id)}>Supprimer</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminComments() {
  const [comments, setComments] = useState(null);
  const load = useCallback(() => { api("/api/admin/comments").then(setComments).catch(() => setComments([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    await api(`/api/admin/comments/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Commentaires ({comments ? comments.length : "…"})</h2>
      {comments === null ? (
        <p className="empty-state">Chargement…</p>
      ) : comments.length === 0 ? (
        <p className="empty-state">Aucun commentaire pour le moment.</p>
      ) : (
        comments.map((c) => (
          <div className="comment" key={c.id}>
            <div className="who">{c.username} · {c.bookTitle} · {new Date(c.createdAt).toLocaleString("fr-FR")}</div>
            <p>{c.text}</p>
            <button className="btn secondary danger" onClick={() => remove(c.id)}>Supprimer</button>
          </div>
        ))
      )}
    </div>
  );
}

function AdminMessages() {
  const [messages, setMessages] = useState(null);
  const load = useCallback(() => { api("/api/admin/messages").then(setMessages).catch(() => setMessages([])); }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    await api(`/api/admin/messages/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Messages de contact ({messages ? messages.length : "…"})</h2>
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
            <button className="btn secondary danger" onClick={() => remove(m.id)}>Supprimer</button>
          </div>
        ))
      )}
    </div>
  );
}

function AdminOverview({ categories, onNavigate }) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    Promise.all([
      api("/api/books"),
      api("/api/admin/comments").catch(() => []),
      api("/api/admin/messages").catch(() => []),
    ]).then(([books, comments, messages]) => {
      setCounts({ books: books.length, comments: comments.length, messages: messages.length });
    });
  }, []);

  const cards = [
    { key: "fiches", label: "Fiches au catalogue", value: counts ? counts.books : "…", color: "#5B6CFF" },
    { key: "categories", label: "Catégories", value: categories.length, color: "#FF3DA6" },
    { key: "commentaires", label: "Commentaires", value: counts ? counts.comments : "…", color: "#33E0A1" },
    { key: "messages", label: "Messages de contact", value: counts ? counts.messages : "…", color: "#FFA23D" },
  ];

  return (
    <div>
      <div className="overview-grid">
        {cards.map((c) => (
          <button key={c.key} className="overview-card" style={{ "--oc-color": c.color }} onClick={() => onNavigate(c.key)}>
            <span className="overview-value">{c.value}</span>
            <span className="overview-label">{c.label}</span>
          </button>
        ))}
      </div>
      <p style={{ color: "var(--text-dim)", marginTop: "1.4rem", fontSize: "0.9rem" }}>
        Clique sur une carte pour aller directement à la section correspondante.
      </p>
    </div>
  );
}

const EMPTY_CATEGORY_FORM = { label: "", code: "", color: "#5B6CFF" };

function AdminCategories({ categories, onChanged }) {
  const [form, setForm] = useState(EMPTY_CATEGORY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field) { return (e) => setForm((f) => ({ ...f, [field]: e.target.value })); }

  function startEdit(c) {
    setEditingId(c.id);
    setForm({ label: c.label, code: c.code, color: c.color });
  }
  function cancelEdit() { setEditingId(null); setForm(EMPTY_CATEGORY_FORM); setError(""); }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (editingId) {
        await api(`/api/admin/categories/${editingId}`, { method: "PUT", body: form });
      } else {
        await api("/api/admin/categories", { method: "POST", body: form });
      }
      cancelEdit();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Supprimer cette catégorie ?")) return;
    try {
      await api(`/api/admin/categories/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>{editingId ? "Modifier la catégorie" : "Ajouter une catégorie"}</h2>
      <form onSubmit={submit} className="admin-form">
        {error && <div className="form-error">{error}</div>}
        <div className="admin-form-grid">
          <div className="field">
            <label>Nom</label>
            <input required value={form.label} onChange={update("label")} placeholder="Bandes dessinées" />
          </div>
          <div className="field">
            <label>Code (repère court)</label>
            <input value={form.code} onChange={update("code")} placeholder="090" />
          </div>
          <div className="field">
            <label>Couleur</label>
            <input type="color" value={form.color} onChange={update("color")} style={{ height: "42px", padding: "0.2rem" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.7rem", marginTop: "0.8rem" }}>
          <button className="btn" type="submit" disabled={saving}>{editingId ? "Enregistrer" : "Ajouter"}</button>
          {editingId && <button type="button" className="btn secondary" onClick={cancelEdit}>Annuler</button>}
        </div>
      </form>

      <h2 style={{ margin: "2.2rem 0 1rem" }}>Catégories existantes ({categories.length})</h2>
      <div className="admin-list">
        {categories.map((c) => (
          <div className="admin-row" key={c.id}>
            <span className="stamp" style={{ background: c.color }}>{c.code}</span>
            <div className="admin-row-main"><strong>{c.label}</strong></div>
            <div className="admin-row-actions">
              <button className="btn secondary" onClick={() => startEdit(c)}>Modifier</button>
              <button className="btn secondary danger" onClick={() => remove(c.id)}>Supprimer</button>
            </div>
          </div>
        ))}
      </div>
      <p style={{ color: "var(--text-dim)", marginTop: "0.8rem", fontSize: "0.85rem" }}>
        Une catégorie encore utilisée par des fiches ne peut pas être supprimée — modifie d'abord ces fiches.
      </p>
    </div>
  );
}

function Admin({ user }) {
  const [tab, setTab] = useState("vue");
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (user && user.role === "admin") {
      api("/api/csrf").then((d) => { csrfToken = d.csrfToken; });
      api("/api/categories").then(setCategories).catch(() => {});
    }
  }, [user]);

  if (user === undefined) return null;
  if (!user || user.role !== "admin") {
    return <div className="app-shell"><p className="empty-state">Accès réservé à l'administrateur.</p></div>;
  }

  return (
    <div className="app-shell">
      <h1 style={{ margin: "2rem 0 0.3rem" }}>Administration</h1>
      <p style={{ color: "var(--text-dim)", marginBottom: "1.2rem" }}>Gère les fiches, les catégories, les commentaires et les messages du site.</p>
      <div className="drawer-tabs">
        <button className="drawer-tab" aria-selected={tab === "vue"} onClick={() => setTab("vue")}>Vue d'ensemble</button>
        <button className="drawer-tab" aria-selected={tab === "fiches"} onClick={() => setTab("fiches")}>Fiches</button>
        <button className="drawer-tab" aria-selected={tab === "categories"} onClick={() => setTab("categories")}>Catégories</button>
        <button className="drawer-tab" aria-selected={tab === "commentaires"} onClick={() => setTab("commentaires")}>Commentaires</button>
        <button className="drawer-tab" aria-selected={tab === "messages"} onClick={() => setTab("messages")}>Messages</button>
      </div>
      <div style={{ marginTop: "1.4rem" }}>
        {tab === "vue" && <AdminOverview categories={categories} onNavigate={setTab} />}
        {tab === "fiches" && <AdminBooks categories={categories} />}
        {tab === "categories" && <AdminCategories categories={categories} onChanged={() => api("/api/categories").then(setCategories)} />}
        {tab === "commentaires" && <AdminComments />}
        {tab === "messages" && <AdminMessages />}
      </div>
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
