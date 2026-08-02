const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { load, save } = require("./lib/db");
const {
  hashPassword,
  verifyPassword,
  escapeHtml,
  isValidEmail,
  cleanText,
  rateLimit,
  verifyRecaptcha,
  RECAPTCHA_SITE_KEY,
} = require("./lib/security");
const { createSession, getUserFromSession, destroySession } = require("./lib/auth");

const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const IS_PROD = process.env.NODE_ENV === "production";

/* ---------------------------------------------------------------- */
/* Utilitaires HTTP                                                   */
/* ---------------------------------------------------------------- */

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  parts.push(`Max-Age=${opts.maxAge ?? 7 * 24 * 60 * 60}`);
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (IS_PROD) parts.push("Secure");
  const existing = res.getHeader("Set-Cookie");
  const cookieStr = parts.join("; ");
  if (existing) {
    res.setHeader("Set-Cookie", Array.isArray(existing) ? [...existing, cookieStr] : [existing, cookieStr]);
  } else {
    res.setHeader("Set-Cookie", cookieStr);
  }
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAge: 0 });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error("Corps de requête trop volumineux"));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("JSON invalide"));
      }
    });
    req.on("error", reject);
  });
}

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

/* ---------------------------------------------------------------- */
/* En-têtes de sécurité (appliqués à toutes les réponses)             */
/* ---------------------------------------------------------------- */

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'https://cdnjs.cloudflare.com https://www.google.com https://www.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "frame-src https://www.google.com",
      "connect-src 'self'",
    ].join("; ")
  );
  if (IS_PROD) res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}

/* ---------------------------------------------------------------- */
/* Authentification / CSRF                                            */
/* ---------------------------------------------------------------- */

function getAuth(req) {
  const cookies = parseCookies(req);
  return getUserFromSession(cookies.session);
}

function requireCsrf(req, cookies) {
  const header = req.headers["x-csrf-token"];
  return !!header && !!cookies.xsrf && header === cookies.xsrf;
}

function publicUser(u) {
  return { id: u.id, username: u.username, email: u.email, role: u.role, createdAt: u.createdAt };
}

/* ---------------------------------------------------------------- */
/* Routes API                                                        */
/* ---------------------------------------------------------------- */

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pattern.split("/").filter(Boolean);
    const actual = pathname.split("/").filter(Boolean);
    if (parts.length !== actual.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (parts[i] !== actual[i]) ok = false;
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

/* --- csrf token --- */
route("GET", "/api/csrf", async (req, res, params, cookies) => {
  let token = cookies.xsrf;
  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
    setCookie(res, "xsrf", token, { httpOnly: false });
  }
  sendJson(res, 200, { csrfToken: token, recaptchaSiteKey: RECAPTCHA_SITE_KEY });
});

/* --- catégories --- */
route("GET", "/api/categories", async (req, res) => {
  const db = load();
  sendJson(res, 200, db.categories);
});

/* --- livres --- */
route("GET", "/api/books", async (req, res, params, cookies, query) => {
  const db = load();
  let books = db.books;
  if (query.category) books = books.filter((b) => b.category === query.category);
  if (query.q) {
    const q = query.q.toLowerCase();
    books = books.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }
  sendJson(res, 200, books);
});

route("GET", "/api/books/:id", async (req, res, params) => {
  const db = load();
  const book = db.books.find((b) => b.id === params.id);
  if (!book) return sendJson(res, 404, { error: "Livre introuvable" });
  sendJson(res, 200, book);
});

/* --- commentaires --- */
route("GET", "/api/books/:id/comments", async (req, res, params) => {
  const db = load();
  const comments = db.comments
    .filter((c) => c.bookId === params.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((c) => ({ ...c, text: escapeHtml(c.text), username: escapeHtml(c.username) }));
  sendJson(res, 200, comments);
});

route("POST", "/api/books/:id/comments", async (req, res, params, cookies) => {
  const auth = getAuth(req);
  if (!auth) return sendJson(res, 401, { error: "Connecte-toi pour commenter." });
  if (!requireCsrf(req, cookies)) return sendJson(res, 403, { error: "Jeton CSRF invalide." });
  if (!rateLimit(`comment:${auth.user.id}`, { max: 8, windowMs: 60_000 }))
    return sendJson(res, 429, { error: "Trop de commentaires, réessaie dans une minute." });

  const db = load();
  const book = db.books.find((b) => b.id === params.id);
  if (!book) return sendJson(res, 404, { error: "Livre introuvable" });

  const body = await readBody(req);
  const text = cleanText(body.text, 1000);
  if (text.length < 2) return sendJson(res, 400, { error: "Commentaire trop court." });

  const comment = {
    id: crypto.randomBytes(8).toString("hex"),
    bookId: params.id,
    userId: auth.user.id,
    username: auth.user.username,
    text,
    createdAt: Date.now(),
  };
  db.comments.push(comment);
  await save();
  sendJson(res, 201, { ...comment, text: escapeHtml(comment.text), username: escapeHtml(comment.username) });
});

/* --- inscription --- */
route("POST", "/api/register", async (req, res, params, cookies, query, req0) => {
  if (!rateLimit(`register:${clientIp(req)}`, { max: 6, windowMs: 10 * 60_000 }))
    return sendJson(res, 429, { error: "Trop de tentatives, réessaie plus tard." });

  const body = await readBody(req);
  const username = cleanText(body.username, 40);
  const email = cleanText(body.email, 254).toLowerCase();
  const password = String(body.password || "");

  if (username.length < 3) return sendJson(res, 400, { error: "Pseudo trop court (3 caractères min)." });
  if (!isValidEmail(email)) return sendJson(res, 400, { error: "Adresse e-mail invalide." });
  if (password.length < 8) return sendJson(res, 400, { error: "Mot de passe trop court (8 caractères min)." });

  const okCaptcha = await verifyRecaptcha(body.recaptchaToken, clientIp(req));
  if (!okCaptcha) return sendJson(res, 400, { error: "Vérification reCAPTCHA échouée." });

  const db = load();
  if (db.users.some((u) => u.email === email)) return sendJson(res, 409, { error: "Cet e-mail est déjà utilisé." });
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
    return sendJson(res, 409, { error: "Ce pseudo est déjà pris." });

  const user = {
    id: crypto.randomBytes(8).toString("hex"),
    username,
    email,
    passwordHash: hashPassword(password),
    role: db.users.length === 0 ? "admin" : "member", // le tout premier compte devient admin
    createdAt: Date.now(),
  };
  db.users.push(user);
  await save();

  const session = createSession(user.id);
  setCookie(res, "session", session.token, {});
  setCookie(res, "xsrf", session.csrfToken, { httpOnly: false });
  sendJson(res, 201, { user: publicUser(user), csrfToken: session.csrfToken });
});

/* --- connexion --- */
route("POST", "/api/login", async (req, res, params, cookies) => {
  if (!rateLimit(`login:${clientIp(req)}`, { max: 8, windowMs: 5 * 60_000 }))
    return sendJson(res, 429, { error: "Trop de tentatives, réessaie dans quelques minutes." });

  const body = await readBody(req);
  const email = cleanText(body.email, 254).toLowerCase();
  const password = String(body.password || "");

  const okCaptcha = await verifyRecaptcha(body.recaptchaToken, clientIp(req));
  if (!okCaptcha) return sendJson(res, 400, { error: "Vérification reCAPTCHA échouée." });

  const db = load();
  const user = db.users.find((u) => u.email === email);
  // message volontairement générique pour ne pas révéler si l'e-mail existe
  if (!user || !verifyPassword(password, user.passwordHash))
    return sendJson(res, 401, { error: "Identifiants incorrects." });

  const session = createSession(user.id);
  setCookie(res, "session", session.token, {});
  setCookie(res, "xsrf", session.csrfToken, { httpOnly: false });
  sendJson(res, 200, { user: publicUser(user), csrfToken: session.csrfToken });
});

/* --- déconnexion --- */
route("POST", "/api/logout", async (req, res, params, cookies) => {
  if (cookies.session) destroySession(cookies.session);
  clearCookie(res, "session");
  clearCookie(res, "xsrf");
  sendJson(res, 200, { ok: true });
});

/* --- utilisateur courant --- */
route("GET", "/api/me", async (req, res, params, cookies) => {
  const auth = getAuth(req);
  if (!auth) return sendJson(res, 200, { user: null });
  const session = auth.session;
  sendJson(res, 200, { user: publicUser(auth.user), csrfToken: session.csrfToken });
});

/* --- contact --- */
route("POST", "/api/contact", async (req, res, params, cookies) => {
  if (!rateLimit(`contact:${clientIp(req)}`, { max: 5, windowMs: 10 * 60_000 }))
    return sendJson(res, 429, { error: "Trop de messages envoyés, réessaie plus tard." });

  const body = await readBody(req);
  const name = cleanText(body.name, 100);
  const email = cleanText(body.email, 254);
  const subject = cleanText(body.subject, 150);
  const message = cleanText(body.message, 3000);

  if (name.length < 2) return sendJson(res, 400, { error: "Nom trop court." });
  if (!isValidEmail(email)) return sendJson(res, 400, { error: "Adresse e-mail invalide." });
  if (message.length < 10) return sendJson(res, 400, { error: "Message trop court." });

  const okCaptcha = await verifyRecaptcha(body.recaptchaToken, clientIp(req));
  if (!okCaptcha) return sendJson(res, 400, { error: "Vérification reCAPTCHA échouée." });

  const db = load();
  db.messages.push({
    id: crypto.randomBytes(8).toString("hex"),
    name,
    email,
    subject,
    message,
    createdAt: Date.now(),
  });
  await save();
  sendJson(res, 201, { ok: true });
});

/* --- admin : messages de contact --- */
route("GET", "/api/admin/messages", async (req, res) => {
  const auth = getAuth(req);
  if (!auth || auth.user.role !== "admin") return sendJson(res, 403, { error: "Accès refusé." });
  const db = load();
  sendJson(
    res,
    200,
    [...db.messages].sort((a, b) => b.createdAt - a.createdAt).map((m) => ({
      ...m,
      name: escapeHtml(m.name),
      subject: escapeHtml(m.subject),
      message: escapeHtml(m.message),
    }))
  );
});

/* ---------------------------------------------------------------- */
/* Fichiers statiques (frontend)                                     */
/* ---------------------------------------------------------------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(FRONTEND_DIR, rel));
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403);
    return res.end("Interdit");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // repli sur index.html pour le routage côté client (SPA)
      fs.readFile(path.join(FRONTEND_DIR, "index.html"), (err2, indexData) => {
        if (err2) {
          res.writeHead(404);
          return res.end("Introuvable");
        }
        res.writeHead(200, { "Content-Type": MIME[".html"] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

/* ---------------------------------------------------------------- */
/* Serveur                                                            */
/* ---------------------------------------------------------------- */

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const cookies = parseCookies(req);
  const query = Object.fromEntries(url.searchParams);

  if (!rateLimit(`global:${clientIp(req)}`, { max: 300, windowMs: 60_000 })) {
    return sendJson(res, 429, { error: "Trop de requêtes." });
  }

  if (url.pathname.startsWith("/api/")) {
    const match = matchRoute(req.method, url.pathname);
    if (!match) return sendJson(res, 404, { error: "Route inconnue." });
    try {
      await match.handler(req, res, match.params, cookies, query);
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Erreur serveur." });
    }
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Bibliothèque numérique en ligne sur http://localhost:${PORT}`);
});
