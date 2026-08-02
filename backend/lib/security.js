const crypto = require("crypto");

/* ---------- Mots de passe ---------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/* ---------- Jetons ---------- */

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

/* ---------- Échappement / validation ---------- */

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function cleanText(str = "", maxLen = 2000) {
  return String(str).trim().slice(0, maxLen);
}

/* ---------- Rate limiting (mémoire, fenêtre glissante simplifiée) ---------- */

const buckets = new Map();

function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const entry = buckets.get(key) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  buckets.set(key, entry);
  return entry.count <= max;
}

// nettoyage périodique pour ne pas faire grossir la Map indéfiniment
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.start > 10 * 60 * 1000) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

/* ---------- reCAPTCHA v2 ---------- */

// Clés de TEST publiques fournies officiellement par Google (valident toujours,
// à utiliser uniquement en développement local). Remplace-les par tes propres
// clés (https://www.google.com/recaptcha/admin) avant toute mise en production.
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI";
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || "6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe";

async function verifyRecaptcha(token, remoteIp) {
  if (!token) return false;
  try {
    const params = new URLSearchParams({
      secret: RECAPTCHA_SECRET_KEY,
      response: token,
      remoteip: remoteIp || "",
    });
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const data = await res.json();
    return !!data.success;
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  randomToken,
  escapeHtml,
  isValidEmail,
  cleanText,
  rateLimit,
  verifyRecaptcha,
  RECAPTCHA_SITE_KEY,
};
