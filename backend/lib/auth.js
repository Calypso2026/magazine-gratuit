const { load, save } = require("./db");
const { randomToken } = require("./security");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function createSession(userId) {
  const db = load();
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const expires = Date.now() + SESSION_TTL_MS;
  db.sessions.push({ token, userId, csrfToken, expires });
  save();
  return { token, csrfToken, expires };
}

function getSession(token) {
  if (!token) return null;
  const db = load();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (session.expires < Date.now()) {
    destroySession(token);
    return null;
  }
  return session;
}

function getUserFromSession(token) {
  const session = getSession(token);
  if (!session) return null;
  const db = load();
  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { user, session };
}

function destroySession(token) {
  const db = load();
  db.sessions = db.sessions.filter((s) => s.token !== token);
  save();
}

module.exports = { createSession, getSession, getUserFromSession, destroySession };
