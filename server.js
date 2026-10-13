// server/check-node.ts
var [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || major === 22 && minor < 13) {
  console.error(`[STARTUP] C\u1EA7n Node.js >= 22.13 (\u0111ang ch\u1EA1y ${process.versions.node}). H\xE3y n\xE2ng c\u1EA5p Node r\u1ED3i ch\u1EA1y l\u1EA1i.`);
  process.exit(1);
}

// server/index.ts
import "dotenv/config";
import path3 from "node:path";
import express2 from "express";

// server/db.ts
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
var require2 = createRequire(import.meta.url);
var { DatabaseSync } = require2("node:sqlite");
var SCHEMA_VERSION = 1;
var SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('hr', 'dept_manager', 'employee')),
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  hanet_person_id TEXT,
  face_registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_hanet_person ON users(hanet_person_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS cameras (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_key TEXT UNIQUE NOT NULL,
  place_id INTEGER,
  place_name TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  ip_address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hanet_person_id TEXT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  place_id INTEGER,
  ts INTEGER NOT NULL,
  work_date TEXT NOT NULL,
  image_url TEXT,
  source TEXT NOT NULL CHECK (source IN ('webhook', 'reconcile', 'simulator')),
  UNIQUE (user_id, device_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_detections_user_date ON detections(user_id, work_date);

CREATE TABLE IF NOT EXISTS attendance_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  first_in INTEGER NOT NULL,
  last_out INTEGER,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'late_and_early', 'missing_out')),
  late_excused INTEGER NOT NULL DEFAULT 0,
  manual_in INTEGER,
  manual_out INTEGER,
  detection_count INTEGER NOT NULL,
  PRIMARY KEY (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('missed_punch', 'late_explanation', 'leave_request')),
  reason TEXT NOT NULL,
  suggested_in TEXT,
  suggested_out TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'ignored', 'duplicate', 'rejected', 'error')),
  person_name TEXT,
  device_name TEXT,
  message TEXT,
  raw_payload TEXT
);
`;
function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  if (!db.prepare("SELECT version FROM schema_version").get()) {
    db.prepare("INSERT INTO schema_version(version) VALUES (?)").run(SCHEMA_VERSION);
  }
  return db;
}
function tx(db, fn) {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
function newId(prefix) {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

// server/app.ts
import express from "express";

// server/errors.ts
var HttpError = class extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
};
function errorHandler(production2) {
  return (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...err.code ? { code: err.code } : {} });
      return;
    }
    if (err && typeof err === "object" && err.type === "entity.parse.failed") {
      res.status(400).json({ error: "D\u1EEF li\u1EC7u g\u1EEDi l\xEAn kh\xF4ng h\u1EE3p l\u1EC7" });
      return;
    }
    console.error("[ERROR]", err);
    res.status(500).json({
      error: "L\u1ED7i h\u1EC7 th\u1ED1ng",
      ...production2 ? {} : { detail: String(err?.stack ?? err) }
    });
  };
}
function ah(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

// server/auth.ts
import { randomBytes as randomBytes2, scryptSync, timingSafeEqual, createHash } from "node:crypto";
var SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
var SALT_BYTES = 16;
var KEY_BYTES = 64;
function hashPassword(password) {
  const salt = randomBytes2(SALT_BYTES);
  const hash = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}
function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
  const actual = scryptSync(password, salt, KEY_BYTES, SCRYPT_PARAMS);
  return timingSafeEqual(actual, expected);
}
var TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTempPassword(length = 10) {
  let s = "";
  for (const b of randomBytes2(length)) s += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
  return s;
}
function validateNewPassword(newPassword, currentPassword) {
  if (typeof newPassword !== "string" || newPassword.length < 8) return "M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i c\xF3 \xEDt nh\u1EA5t 8 k\xFD t\u1EF1";
  if (newPassword === currentPassword) return "M\u1EADt kh\u1EA9u m\u1EDBi ph\u1EA3i kh\xE1c m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i";
  return null;
}
function sha256(s) {
  return createHash("sha256").update(s).digest("hex");
}
function safeEqualStrings(a, b) {
  return timingSafeEqual(Buffer.from(sha256(a), "hex"), Buffer.from(sha256(b), "hex"));
}
var SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
function createSession(db, userId, now) {
  const token = randomBytes2(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    now,
    now + SESSION_TTL_MS
  );
  return token;
}
function findSessionUser(db, token, now) {
  const row = db.prepare(
    `SELECT u.id, u.code, u.name, u.role, u.department_id, u.must_change_password, u.status
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(sha256(token), now);
  if (!row || row.status !== "active") return null;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? null,
    mustChangePassword: row.must_change_password === 1
  };
}
function deleteSession(db, token) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}
function deleteUserSessions(db, userId, exceptToken) {
  if (exceptToken) {
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, sha256(exceptToken));
  } else {
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }
}
function purgeExpiredSessions(db, now) {
  return Number(db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes);
}
var LoginLimiter = class {
  constructor(max = 5, windowMs = 15 * 60 * 1e3) {
    this.max = max;
    this.windowMs = windowMs;
    this.failures = /* @__PURE__ */ new Map();
  }
  recent(key, now) {
    const list = (this.failures.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }
  isBlocked(key, now) {
    return this.recent(key, now).length >= this.max;
  }
  recordFailure(key, now) {
    this.failures.set(key, [...this.recent(key, now), now]);
  }
  reset(key) {
    this.failures.delete(key);
  }
};
function scopeFor(user) {
  if (user.role === "hr") return { kind: "all" };
  if (user.role === "dept_manager") return { kind: "department", departmentId: user.departmentId };
  return { kind: "self", userId: user.id };
}
function scopeWhere(scope, userIdCol, deptCol) {
  switch (scope.kind) {
    case "all":
      return { sql: "1=1", params: [] };
    case "department":
      return scope.departmentId ? { sql: `${deptCol} = ?`, params: [scope.departmentId] } : { sql: "0=1", params: [] };
    case "self":
      return { sql: `${userIdCol} = ?`, params: [scope.userId] };
  }
}

// server/vntime.ts
var VN_OFFSET_MS = 7 * 60 * 60 * 1e3;
var DAY_MS = 24 * 60 * 60 * 1e3;
function toVnDate(ts) {
  return new Date(ts + VN_OFFSET_MS).toISOString().slice(0, 10);
}
function vnMinutesOfDay(ts) {
  const d = new Date(ts + VN_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function parseHHmm(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (!m) throw new Error(`Gi\u1EDD kh\xF4ng h\u1EE3p l\u1EC7: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}
function isValidDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}
function vnDateTimeToTs(date, hhmm2) {
  const [y, mo, d] = date.split("-").map(Number);
  return Date.UTC(y, mo - 1, d, 0, parseHHmm(hhmm2)) - VN_OFFSET_MS;
}
function vnDayStart(date) {
  return vnDateTimeToTs(date, "00:00");
}
function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// server/bootstrap.ts
var DEFAULT_ADMIN_PASSWORD = "Admin@123";
var SYSTEM_ADMIN_CODE = "ADMIN";
var NOT_SYSTEM_ADMIN = `u.code != '${SYSTEM_ADMIN_CODE}'`;
function ensureAdminAccess(db, envPassword) {
  const usable = db.prepare("SELECT 1 FROM users WHERE role = 'hr' AND status = 'active' AND password_hash IS NOT NULL LIMIT 1").get();
  if (usable) return null;
  const fromEnv = typeof envPassword === "string" && envPassword.length >= 8;
  const password = fromEnv ? envPassword : DEFAULT_ADMIN_PASSWORD;
  let hr = db.prepare("SELECT id, code FROM users WHERE role = 'hr' ORDER BY created_at, id LIMIT 1").get();
  if (!hr) {
    db.prepare(
      `INSERT INTO users(id, code, name, role, status, must_change_password, created_at)
       VALUES (?, ?, 'Qu\u1EA3n tr\u1ECB vi\xEAn H\u1EC7 th\u1ED1ng (HR)', 'hr', 'active', 1, ?)
       ON CONFLICT(code) DO UPDATE SET role = 'hr', status = 'active'`
    ).run(newId("usr"), SYSTEM_ADMIN_CODE, toVnDate(Date.now()));
    hr = db.prepare("SELECT id, code FROM users WHERE code = ?").get(SYSTEM_ADMIN_CODE);
  }
  db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1, status = 'active' WHERE id = ?").run(hashPassword(password), hr.id);
  return { code: hr.code, password, fromEnv };
}

// server/middleware.ts
var SESSION_COOKIE = "sid";
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return void 0;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return void 0;
}
function setSessionCookie(res, token, ctx) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: ctx.config.production,
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}
function clearSessionCookie(res, ctx) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", secure: ctx.config.production, path: "/" });
}
function requireAuth(ctx) {
  return (req, _res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? findSessionUser(ctx.db, token, ctx.now()) : null;
    if (!user) return next(new HttpError(401, "Vui l\xF2ng \u0111\u0103ng nh\u1EADp"));
    req.user = user;
    req.sessionToken = token;
    next();
  };
}
var ALLOWED_WHEN_MUST_CHANGE = /* @__PURE__ */ new Set(["GET /auth/me", "POST /auth/change-password", "POST /auth/logout"]);
var mustChangeGate = (req, _res, next) => {
  if (req.user?.mustChangePassword && !ALLOWED_WHEN_MUST_CHANGE.has(`${req.method} ${req.path}`)) {
    return next(new HttpError(403, "B\u1EA1n c\u1EA7n \u0111\u1ED5i m\u1EADt kh\u1EA9u tr\u01B0\u1EDBc khi ti\u1EBFp t\u1EE5c", "MUST_CHANGE_PASSWORD"));
  }
  next();
};
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y"));
    }
    next();
  };
}
var requireSystemAdmin = (req, _res, next) => {
  if (!req.user || req.user.code !== SYSTEM_ADMIN_CODE) {
    return next(new HttpError(403, "Ch\u1EC9 t\xE0i kho\u1EA3n ADMIN \u0111\u01B0\u1EE3c th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y"));
  }
  next();
};
var WRITE_METHODS = /* @__PURE__ */ new Set(["POST", "PUT", "PATCH", "DELETE"]);
var jsonOnly = (req, _res, next) => {
  if (WRITE_METHODS.has(req.method)) {
    const ct = req.headers["content-type"];
    const cl = req.headers["content-length"];
    const hasBody = cl !== void 0 && cl !== "0" || req.headers["transfer-encoding"] !== void 0;
    if (ct && req.is("application/json") === false) {
      return next(new HttpError(415, "Ch\u1EC9 ch\u1EA5p nh\u1EADn d\u1EEF li\u1EC7u JSON"));
    }
    if (hasBody && !ct) {
      return next(new HttpError(415, "Ch\u1EC9 ch\u1EA5p nh\u1EADn d\u1EEF li\u1EC7u JSON"));
    }
  }
  next();
};
function currentUser(req) {
  if (!req.user) throw new HttpError(401, "Vui l\xF2ng \u0111\u0103ng nh\u1EADp");
  return req.user;
}

// server/routes/auth.ts
import { Router } from "express";

// server/repo.ts
var USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id`;
function mapUser(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    role: r.role,
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    position: r.position ?? "",
    avatarUrl: r.avatar_url ?? "",
    hanetPersonId: r.hanet_person_id ?? null,
    faceRegistered: r.face_registered === 1,
    status: r.status,
    createdAt: r.created_at
  };
}
function getUser(db, id) {
  const row = db.prepare(`${USER_SELECT} WHERE u.id = ?`).get(id);
  return row ? mapUser(row) : null;
}
function canSeeUser(viewer, target) {
  const scope = scopeFor(viewer);
  if (scope.kind === "all") return true;
  if (scope.kind === "self") return target.id === scope.userId;
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}

// server/routes/auth.ts
function authPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.post("/auth/login", jsonOnly, (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const key = `${code}|${req.ip}`;
    const now = ctx.now();
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked code=${code} ip=${req.ip}`);
      throw new HttpError(429, "B\u1EA1n \u0111\xE3 nh\u1EADp sai qu\xE1 nhi\u1EC1u l\u1EA7n. Vui l\xF2ng th\u1EED l\u1EA1i sau 15 ph\xFAt");
    }
    const row = db.prepare("SELECT id, password_hash, status FROM users WHERE code = ?").get(code);
    if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed code=${code} ip=${req.ip}`);
      throw new HttpError(401, "M\xE3 nh\xE2n vi\xEAn ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng");
    }
    ctx.limiter.reset(key);
    setSessionCookie(res, createSession(db, row.id, now), ctx);
    res.json({ success: true });
  });
  return r;
}
function authRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.get("/auth/me", (req, res) => {
    const auth = currentUser(req);
    const user = getUser(db, auth.id);
    if (!user) throw new HttpError(401, "Vui l\xF2ng \u0111\u0103ng nh\u1EADp");
    const body = { user, mustChangePassword: auth.mustChangePassword, simulatorEnabled: ctx.config.simulatorEnabled };
    res.json(body);
  });
  r.post("/auth/logout", (req, res) => {
    if (req.sessionToken) deleteSession(db, req.sessionToken);
    clearSessionCookie(res, ctx);
    res.json({ success: true });
  });
  r.post("/auth/change-password", (req, res) => {
    const auth = currentUser(req);
    const { currentPassword, newPassword } = req.body ?? {};
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(auth.id);
    if (typeof currentPassword !== "string" || !verifyPassword(currentPassword, row?.password_hash)) {
      throw new HttpError(400, "M\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i kh\xF4ng \u0111\xFAng");
    }
    const error = validateNewPassword(newPassword, currentPassword);
    if (error) throw new HttpError(400, error);
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(newPassword), auth.id);
    deleteUserSessions(db, auth.id, req.sessionToken);
    res.json({ success: true });
  });
  return r;
}

// server/routes/users.ts
import { Router as Router2 } from "express";

// server/backup.ts
import fs2 from "node:fs";
import path2 from "node:path";
var BACKUP_KEEP = 30;
var BACKUP_RE = /^attendance-.*\.db$/;
var DAILY_RE = /^attendance-\d{4}-\d{2}-\d{2}\.db$/;
function stamp(now) {
  const iso = new Date(now + VN_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19).replace(/:/g, "") };
}
function backupNow(db, dir, reason, now) {
  fs2.mkdirSync(dir, { recursive: true });
  const { date, time } = stamp(now);
  let name;
  if (reason === "daily") {
    name = `attendance-${date}.db`;
    if (fs2.existsSync(path2.join(dir, name))) return null;
  } else {
    name = `attendance-${date}-${time}-${reason}.db`;
    for (let i = 2; fs2.existsSync(path2.join(dir, name)); i++) name = `attendance-${date}-${time}-${reason}-${i}.db`;
  }
  db.prepare("VACUUM INTO ?").run(path2.join(dir, name));
  pruneBackups(dir);
  return name;
}
function listBackups(dir) {
  if (!fs2.existsSync(dir)) return [];
  return fs2.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).map((name) => {
    const st = fs2.statSync(path2.join(dir, name));
    return { name, size: st.size, createdAt: st.mtime.toISOString() };
  }).sort((a, b) => a.createdAt === b.createdAt ? b.name.localeCompare(a.name) : b.createdAt.localeCompare(a.createdAt));
}
function pruneBackups(dir) {
  if (!fs2.existsSync(dir)) return;
  const names = fs2.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).sort().reverse();
  const daily = names.filter((n) => DAILY_RE.test(n));
  const others = names.filter((n) => !DAILY_RE.test(n));
  for (const n of [...daily.slice(BACKUP_KEEP), ...others.slice(BACKUP_KEEP)]) fs2.rmSync(path2.join(dir, n), { force: true });
}
function latestBackup(dir) {
  const [first] = listBackups(dir);
  return first ? path2.join(dir, first.name) : null;
}

// server/routes/users.ts
var ROLES = ["hr", "dept_manager", "employee"];
var CODE_RE = /^[A-Z0-9._-]{1,32}$/;
var CODE_ERROR = "M\xE3 ch\u1EC9 g\u1ED3m ch\u1EEF kh\xF4ng d\u1EA5u, s\u1ED1, d\u1EA5u ch\u1EA5m, g\u1EA1ch ngang, g\u1EA1ch d\u01B0\u1EDBi (t\u1ED1i \u0111a 32 k\xFD t\u1EF1)";
var str = (v) => typeof v === "string" ? v.trim() : void 0;
function resolveDepartment(db, departmentId) {
  if (departmentId === void 0 || departmentId === null || departmentId === "") return null;
  if (typeof departmentId !== "string" || !db.prepare("SELECT 1 FROM departments WHERE id = ?").get(departmentId)) {
    throw new HttpError(400, "Ph\xF2ng ban kh\xF4ng t\u1ED3n t\u1EA1i");
  }
  return departmentId;
}
function userRoutes(ctx) {
  const { db } = ctx;
  const r = Router2();
  r.get("/users", (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), "u.id", "u.department_id");
    const rows = db.prepare(`${USER_SELECT} WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} ORDER BY u.code`).all(...w.params);
    res.json({ users: rows.map(mapUser) });
  });
  r.post("/users", requireRole("hr"), (req, res) => {
    const b = req.body ?? {};
    const code = (str(b.code) ?? "").toUpperCase();
    const name = str(b.name) ?? "";
    if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
    if (code === SYSTEM_ADMIN_CODE) throw new HttpError(400, "M\xE3 ADMIN d\xE0nh ri\xEAng cho t\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng");
    if (!name) throw new HttpError(400, "H\u1ECD t\xEAn l\xE0 b\u1EAFt bu\u1ED9c");
    const role = b.role === void 0 ? "employee" : b.role;
    if (!ROLES.includes(role)) throw new HttpError(400, "Vai tr\xF2 kh\xF4ng h\u1EE3p l\u1EC7");
    const departmentId = resolveDepartment(db, b.departmentId);
    if (db.prepare("SELECT 1 FROM users WHERE code = ?").get(code)) throw new HttpError(409, "M\xE3 nh\xE2n vi\xEAn \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("usr");
    const tempPassword = generateTempPassword();
    db.prepare(
      `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
         face_registered, status, password_hash, must_change_password, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 1, ?)`
    ).run(
      id,
      code,
      name,
      str(b.email) ?? "",
      str(b.phone) ?? "",
      role,
      departmentId,
      str(b.position) ?? "",
      str(b.avatarUrl) ?? "",
      str(b.hanetPersonId) || null,
      b.faceRegistered ? 1 : 0,
      hashPassword(tempPassword),
      toVnDate(ctx.now())
    );
    res.json({ user: getUser(db, id), tempPassword });
  });
  r.put("/users/:id", requireRole("hr"), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1");
    const b = req.body ?? {};
    const changesRole = b.role !== void 0 && b.role !== target.role;
    const changesStatus = b.status !== void 0 && b.status !== target.status;
    if (target.id === actor.id && (changesRole || changesStatus)) {
      throw new HttpError(400, "Kh\xF4ng th\u1EC3 t\u1EF1 \u0111\u1ED5i vai tr\xF2 ho\u1EB7c tr\u1EA1ng th\xE1i c\u1EE7a ch\xEDnh m\xECnh");
    }
    const sets = [];
    const params = [];
    const set = (col, val) => {
      sets.push(`${col} = ?`);
      params.push(val);
    };
    if (b.name !== void 0) {
      const name = str(b.name);
      if (!name) throw new HttpError(400, "H\u1ECD t\xEAn l\xE0 b\u1EAFt bu\u1ED9c");
      set("name", name);
    }
    for (const [key, col] of [["email", "email"], ["phone", "phone"], ["position", "position"], ["avatarUrl", "avatar_url"]]) {
      if (b[key] !== void 0) set(col, str(b[key]) ?? "");
    }
    if (b.hanetPersonId !== void 0) set("hanet_person_id", str(b.hanetPersonId) || null);
    if (b.faceRegistered !== void 0) set("face_registered", b.faceRegistered ? 1 : 0);
    if (b.role !== void 0) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, "Vai tr\xF2 kh\xF4ng h\u1EE3p l\u1EC7");
      set("role", b.role);
    }
    if (b.status !== void 0) {
      if (b.status !== "active" && b.status !== "inactive") throw new HttpError(400, "Tr\u1EA1ng th\xE1i kh\xF4ng h\u1EE3p l\u1EC7");
      set("status", b.status);
    }
    if (b.departmentId !== void 0) set("department_id", resolveDepartment(db, b.departmentId));
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params, target.id);
    if (b.status === "inactive" && target.status !== "inactive") deleteUserSessions(db, target.id);
    res.json({ user: getUser(db, target.id) });
  });
  r.post("/users/:id/reset-password", requireRole("hr"), (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1");
    const tempPassword = generateTempPassword();
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(hashPassword(tempPassword), target.id);
    deleteUserSessions(db, target.id);
    console.warn(`[SECURITY] password_reset by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ tempPassword });
  });
  r.delete("/users/:id", requireSystemAdmin, (req, res) => {
    const actor = currentUser(req);
    const target = getUser(db, req.params.id);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1");
    if (target.id === actor.id) throw new HttpError(400, "Kh\xF4ng th\u1EC3 t\u1EF1 x\xF3a t\xE0i kho\u1EA3n \u0111ang \u0111\u0103ng nh\u1EADp");
    const backup = backupNow(db, ctx.config.backupDir, "pre-delete", ctx.now());
    db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
    console.warn(`[SECURITY] user_deleted by=${actor.code} target=${target.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });
  return r;
}

// server/routes/departments.ts
import { Router as Router3 } from "express";
var DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.created_at,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id`;
function mapDept(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? "",
    managerId: r.manager_id ?? null,
    managerName: r.manager_name ?? null,
    memberCount: Number(r.member_count),
    createdAt: r.created_at
  };
}
function getDept(db, id) {
  const row = db.prepare(`${DEPT_SELECT} WHERE d.id = ?`).get(id);
  return row ? mapDept(row) : null;
}
function resolveManager(db, managerId) {
  if (managerId === void 0 || managerId === null || managerId === "") return null;
  if (typeof managerId !== "string" || !db.prepare("SELECT 1 FROM users WHERE id = ?").get(managerId)) {
    throw new HttpError(400, "Tr\u01B0\u1EDFng ph\xF2ng \u0111\u01B0\u1EE3c ch\u1ECDn kh\xF4ng t\u1ED3n t\u1EA1i");
  }
  return managerId;
}
function nextDepartmentCode(db) {
  const codes = db.prepare("SELECT code FROM departments WHERE code GLOB 'PB[0-9]*'").all();
  const max = codes.reduce((m, { code }) => /^PB\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m, 0);
  return `PB${String(max + 1).padStart(3, "0")}`;
}
function departmentRoutes(ctx) {
  const { db } = ctx;
  const r = Router3();
  r.get("/departments", (_req, res) => {
    const rows = db.prepare(`${DEPT_SELECT} ORDER BY d.code`).all();
    res.json({ departments: rows.map(mapDept) });
  });
  r.post("/departments", requireRole("hr"), (req, res) => {
    const b = req.body ?? {};
    const given = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
    const code = given || nextDepartmentCode(db);
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!CODE_RE.test(code)) throw new HttpError(400, "M\xE3 ph\xF2ng ban kh\xF4ng h\u1EE3p l\u1EC7");
    if (!name) throw new HttpError(400, "T\xEAn ph\xF2ng ban l\xE0 b\u1EAFt bu\u1ED9c");
    const managerId = resolveManager(db, b.managerId);
    if (db.prepare("SELECT 1 FROM departments WHERE code = ?").get(code)) throw new HttpError(409, "M\xE3 ph\xF2ng ban \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("dep");
    db.prepare("INSERT INTO departments(id, code, name, description, manager_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
      id,
      code,
      name,
      typeof b.description === "string" ? b.description.trim() : "",
      managerId,
      toVnDate(ctx.now())
    );
    res.json({ department: getDept(db, id) });
  });
  r.put("/departments/:id", requireRole("hr"), (req, res) => {
    const dept = getDept(db, req.params.id);
    if (!dept) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y ph\xF2ng ban");
    const b = req.body ?? {};
    if (b.name !== void 0) {
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name) throw new HttpError(400, "T\xEAn ph\xF2ng ban l\xE0 b\u1EAFt bu\u1ED9c");
      db.prepare("UPDATE departments SET name = ? WHERE id = ?").run(name, dept.id);
    }
    if (b.description !== void 0) {
      db.prepare("UPDATE departments SET description = ? WHERE id = ?").run(typeof b.description === "string" ? b.description.trim() : "", dept.id);
    }
    if (b.managerId !== void 0) {
      db.prepare("UPDATE departments SET manager_id = ? WHERE id = ?").run(resolveManager(db, b.managerId), dept.id);
    }
    res.json({ department: getDept(db, dept.id) });
  });
  r.delete("/departments/:id", requireSystemAdmin, (req, res) => {
    const actor = currentUser(req);
    const dept = getDept(db, req.params.id);
    if (!dept) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y ph\xF2ng ban");
    const backup = backupNow(db, ctx.config.backupDir, "pre-delete", ctx.now());
    db.prepare("DELETE FROM departments WHERE id = ?").run(dept.id);
    console.warn(`[SECURITY] department_deleted by=${actor.code} target=${dept.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });
  return r;
}

// server/routes/cameras.ts
import { Router as Router4 } from "express";
function mapCamera(r) {
  return {
    id: r.id,
    name: r.name,
    deviceKey: r.device_key,
    placeId: r.place_id ?? null,
    placeName: r.place_name ?? "",
    location: r.location ?? "",
    ipAddress: r.ip_address ?? "",
    createdAt: r.created_at
  };
}
function cameraRoutes(ctx) {
  const { db } = ctx;
  const r = Router4();
  r.get("/cameras", (_req, res) => {
    res.json({ cameras: db.prepare("SELECT * FROM cameras ORDER BY name").all().map(mapCamera) });
  });
  r.post("/cameras", requireRole("hr"), (req, res) => {
    const b = req.body ?? {};
    const text = (v) => typeof v === "string" ? v.trim() : "";
    const name = text(b.name);
    const deviceKey = text(b.deviceKey);
    if (!name || !deviceKey) throw new HttpError(400, "T\xEAn camera v\xE0 m\xE3 thi\u1EBFt b\u1ECB l\xE0 b\u1EAFt bu\u1ED9c");
    const placeId = b.placeId === void 0 || b.placeId === "" || b.placeId === null ? null : Number(b.placeId);
    if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) throw new HttpError(400, "Place ID kh\xF4ng h\u1EE3p l\u1EC7");
    if (db.prepare("SELECT 1 FROM cameras WHERE device_key = ?").get(deviceKey)) throw new HttpError(409, "M\xE3 thi\u1EBFt b\u1ECB \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("cam");
    db.prepare(
      "INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, deviceKey, placeId, text(b.placeName), text(b.location), text(b.ipAddress), new Date(ctx.now()).toISOString());
    res.json({ camera: mapCamera(db.prepare("SELECT * FROM cameras WHERE id = ?").get(id)) });
  });
  r.delete("/cameras/:id", requireRole("hr"), (req, res) => {
    const result = db.prepare("DELETE FROM cameras WHERE id = ?").run(req.params.id);
    if (Number(result.changes) === 0) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y camera");
    res.json({ success: true });
  });
  return r;
}

// server/routes/attendance.ts
import { Router as Router5 } from "express";

// server/settings.ts
function getSetting(db, key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row?.value;
}
function setSetting(db, key, value) {
  db.prepare("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
function deleteSetting(db, key) {
  db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}
var DEFAULT_WORK_SETTINGS = {
  workStart: "08:00",
  lateGraceMinutes: 15,
  workEnd: "17:00",
  minOutGapMinutes: 30
};
function getWorkSettings(db) {
  return {
    workStart: getSetting(db, "work_start") ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, "late_grace_minutes") ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, "work_end") ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, "min_out_gap_minutes") ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes)
  };
}
function intInRange(v, min, max, label) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn t\u1EEB ${min} \u0111\u1EBFn ${max}`);
  }
  return n;
}
function hhmm(v, label) {
  if (typeof v !== "string") throw new HttpError(400, `${label} kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng HH:mm)`);
  try {
    parseHHmm(v);
  } catch {
    throw new HttpError(400, `${label} kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng HH:mm)`);
  }
  return v;
}
function validateWorkSettings(input) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Thi\u1EBFu c\u1EA5u h\xECnh gi\u1EDD l\xE0m vi\u1EC7c");
  const b = input;
  const ws = {
    workStart: hhmm(b.workStart, "Gi\u1EDD v\xE0o"),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, "S\u1ED1 ph\xFAt cho ph\xE9p mu\u1ED9n"),
    workEnd: hhmm(b.workEnd, "Gi\u1EDD ra"),
    minOutGapMinutes: intInRange(b.minOutGapMinutes, 1, 720, "Ng\u01B0\u1EE1ng gi\u1EDD ra")
  };
  if (parseHHmm(ws.workEnd) <= parseHHmm(ws.workStart)) throw new HttpError(400, "Gi\u1EDD ra ph\u1EA3i sau gi\u1EDD v\xE0o");
  return ws;
}
function saveWorkSettings(db, ws) {
  setSetting(db, "work_start", ws.workStart);
  setSetting(db, "late_grace_minutes", String(ws.lateGraceMinutes));
  setSetting(db, "work_end", ws.workEnd);
  setSetting(db, "min_out_gap_minutes", String(ws.minOutGapMinutes));
}

// server/attendance.ts
function toDaySettings(ws) {
  return {
    workStart: parseHHmm(ws.workStart),
    graceMinutes: ws.lateGraceMinutes,
    workEnd: parseHHmm(ws.workEnd),
    minOutGapMinutes: ws.minOutGapMinutes
  };
}
function computeDay(input) {
  const { detectionTs, settings, lateExcused, manualIn, manualOut } = input;
  const minDet = detectionTs.length ? Math.min(...detectionTs) : null;
  const maxDet = detectionTs.length ? Math.max(...detectionTs) : null;
  const firstIn = manualIn ?? minDet;
  if (firstIn === null) return null;
  let lastOut = null;
  if (manualOut !== null) lastOut = manualOut;
  else if (maxDet !== null && maxDet - firstIn >= settings.minOutGapMinutes * 6e4) lastOut = maxDet;
  const inMin = vnMinutesOfDay(firstIn);
  const isLate = !lateExcused && inMin > settings.workStart + settings.graceMinutes;
  const lateMinutes = isLate ? inMin - settings.workStart : 0;
  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = outMin !== null && outMin < settings.workEnd;
  const earlyMinutes = isEarly ? settings.workEnd - outMin : 0;
  let status;
  if (lastOut === null) status = "missing_out";
  else if (isLate && isEarly) status = "late_and_early";
  else if (isLate) status = "late";
  else if (isEarly) status = "early_leave";
  else status = "on_time";
  return { firstIn, lastOut, lateMinutes, earlyMinutes, status, detectionCount: detectionTs.length };
}
function simulatorFilter() {
  return process.env.NODE_ENV === "production" ? " AND source != 'simulator'" : "";
}
function readAdjustment(db, userId, workDate) {
  const row = db.prepare("SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?").get(userId, workDate);
  return {
    lateExcused: row?.late_excused === 1,
    manualIn: row?.manual_in ?? null,
    manualOut: row?.manual_out ?? null
  };
}
function writeDay(db, userId, workDate, adj, settings) {
  const detections = db.prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`).all(userId, workDate);
  const result = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut
  });
  if (!result) {
    db.prepare("DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?").run(userId, workDate);
    return;
  }
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, status,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, status = excluded.status, late_excused = excluded.late_excused,
       manual_in = excluded.manual_in, manual_out = excluded.manual_out, detection_count = excluded.detection_count`
  ).run(
    userId,
    workDate,
    result.firstIn,
    result.lastOut,
    result.lateMinutes,
    result.earlyMinutes,
    result.status,
    adj.lateExcused ? 1 : 0,
    adj.manualIn,
    adj.manualOut,
    result.detectionCount
  );
}
function recomputeDay(db, userId, workDate, settings) {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), settings ?? toDaySettings(getWorkSettings(db)));
}
function applyDayAdjustment(db, userId, workDate, patch) {
  const adj = { ...readAdjustment(db, userId, workDate), ...patch };
  writeDay(db, userId, workDate, adj, toDaySettings(getWorkSettings(db)));
}
function recomputeRange(db, from, to) {
  const settings = toDaySettings(getWorkSettings(db));
  const pairs = db.prepare(
    `SELECT user_id, work_date FROM detections WHERE work_date BETWEEN ? AND ?
       UNION
       SELECT user_id, work_date FROM attendance_days WHERE work_date BETWEEN ? AND ?`
  ).all(from, to, from, to);
  tx(db, () => {
    for (const p of pairs) recomputeDay(db, p.user_id, p.work_date, settings);
  });
  return pairs.length;
}

// server/routes/attendance.ts
var DAY_SELECT = `SELECT a.*, u.code AS employee_code, u.name AS employee_name, u.avatar_url, u.department_id,
  d.name AS department_name
  FROM attendance_days a JOIN users u ON u.id = a.user_id LEFT JOIN departments d ON d.id = u.department_id`;
function mapDay(r) {
  return {
    userId: r.user_id,
    employeeCode: r.employee_code,
    employeeName: r.employee_name,
    avatarUrl: r.avatar_url ?? "",
    departmentId: r.department_id ?? null,
    departmentName: r.department_name ?? null,
    workDate: r.work_date,
    firstIn: r.first_in,
    lastOut: r.last_out ?? null,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    status: r.status,
    lateExcused: r.late_excused === 1,
    manualIn: r.manual_in ?? null,
    manualOut: r.manual_out ?? null,
    detectionCount: r.detection_count
  };
}
var MAX_RECOMPUTE_DAYS = 92;
var DETAIL_FILTER = {
  total: "1 = 1",
  present: "a.user_id IS NOT NULL",
  on_time: "a.late_minutes = 0",
  late: "a.late_minutes > 0",
  missing_out: "a.status = 'missing_out'",
  not_checked_in: "a.user_id IS NULL"
};
function attendanceRoutes(ctx) {
  const { db } = ctx;
  const r = Router5();
  r.get("/attendance", (req, res) => {
    const user = currentUser(req);
    const date = req.query.date === void 0 || req.query.date === "" ? toVnDate(ctx.now()) : req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const w = scopeWhere(scopeFor(user), "u.id", "u.department_id");
    let sql = `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql}`;
    const params = [date, ...w.params];
    const departmentId = req.query.departmentId;
    if (user.role === "hr" && typeof departmentId === "string" && departmentId) {
      sql += " AND u.department_id = ?";
      params.push(departmentId);
    }
    let records = db.prepare(`${sql} ORDER BY a.first_in`).all(...params).map(mapDay);
    const q = typeof req.query.search === "string" ? req.query.search.trim().toLocaleLowerCase("vi") : "";
    if (q) {
      records = records.filter(
        (x) => x.employeeName.toLocaleLowerCase("vi").includes(q) || x.employeeCode.toLocaleLowerCase("vi").includes(q)
      );
    }
    res.json({ date, records });
  });
  r.get("/attendance/:userId/:date/detections", (req, res) => {
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1");
    if (!canSeeUser(currentUser(req), target)) throw new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem d\u1EEF li\u1EC7u n\xE0y");
    if (!isValidDate(req.params.date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const rows = db.prepare("SELECT id, device_id, device_name, place_id, ts, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts").all(target.id, req.params.date);
    const detections = rows.map((x) => ({
      id: x.id,
      deviceId: x.device_id,
      deviceName: x.device_name ?? null,
      placeId: x.place_id ?? null,
      ts: x.ts,
      imageUrl: x.image_url ?? null,
      source: x.source
    }));
    res.json({ detections });
  });
  r.post("/attendance/recompute", requireRole("hr"), (req, res) => {
    const { from, to } = req.body ?? {};
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const span = daysBetween(from, to);
    if (span < 0) throw new HttpError(400, "Ng\xE0y b\u1EAFt \u0111\u1EA7u ph\u1EA3i tr\u01B0\u1EDBc ng\xE0y k\u1EBFt th\xFAc");
    if (span >= MAX_RECOMPUTE_DAYS) throw new HttpError(400, `M\u1ED7i l\u1EA7n ch\u1EC9 t\xEDnh l\u1EA1i t\u1ED1i \u0111a ${MAX_RECOMPUTE_DAYS} ng\xE0y`);
    res.json({ updated: recomputeRange(db, from, to) });
  });
  r.get("/stats", (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), "u.id", "u.department_id");
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql}`).get(...w.params);
    const day = db.prepare(
      `SELECT COUNT(*) AS present,
           SUM(CASE WHEN a.late_minutes = 0 THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql}`
    ).get(date, ...w.params);
    const pending = db.prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${w.sql}`).get(...w.params);
    const cameras = db.prepare("SELECT COUNT(*) AS c FROM cameras").get();
    const body = {
      date,
      totalEmployees: total.c,
      presentCount: day.present,
      onTimeCount: day.on_time ?? 0,
      lateCount: day.late ?? 0,
      missingOutCount: day.missing_out ?? 0,
      notCheckedInCount: Math.max(0, total.c - day.present),
      pendingRequests: pending.c,
      totalCameras: cameras.c
    };
    res.json(body);
  });
  r.get("/stats/details", (req, res) => {
    const type = req.query.type;
    if (typeof type !== "string" || !Object.hasOwn(DETAIL_FILTER, type)) throw new HttpError(400, "Lo\u1EA1i th\u1ED1ng k\xEA kh\xF4ng h\u1EE3p l\u1EC7");
    const w = scopeWhere(scopeFor(currentUser(req)), "u.id", "u.department_id");
    const date = toVnDate(ctx.now());
    const rows = db.prepare(
      `SELECT u.id, u.code, u.name, d.name AS department_name, a.first_in, a.last_out, a.late_minutes, a.status
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
         WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${DETAIL_FILTER[type]}
         ORDER BY a.first_in IS NULL, a.first_in, u.code`
    ).all(date, ...w.params);
    const out = rows.map((x) => ({
      userId: x.id,
      employeeCode: x.code,
      employeeName: x.name,
      departmentName: x.department_name ?? null,
      firstIn: x.first_in ?? null,
      lastOut: x.last_out ?? null,
      lateMinutes: x.late_minutes ?? 0,
      status: x.status ?? null
    }));
    res.json({ date, type, rows: out });
  });
  return r;
}

// server/routes/settings.ts
import { Router as Router6 } from "express";
function settingsRoutes(ctx) {
  const { db } = ctx;
  const r = Router6();
  r.get("/settings/work", requireRole("hr"), (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });
  r.put("/settings/work", requireRole("hr"), (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    res.json({ settings: getWorkSettings(db) });
  });
  return r;
}

// server/routes/requests.ts
import { Router as Router7 } from "express";
var TYPES = ["missed_punch", "late_explanation", "leave_request"];
var REQUEST_SELECT = `SELECT r.*, u.name AS employee_name, u.code AS employee_code, u.department_id, rv.name AS reviewer_name
  FROM requests r JOIN users u ON u.id = r.user_id LEFT JOIN users rv ON rv.id = r.reviewed_by`;
function mapRequest(r) {
  return {
    id: r.id,
    userId: r.user_id,
    employeeName: r.employee_name,
    employeeCode: r.employee_code,
    departmentId: r.department_id ?? null,
    workDate: r.work_date,
    type: r.type,
    reason: r.reason,
    suggestedIn: r.suggested_in ?? null,
    suggestedOut: r.suggested_out ?? null,
    status: r.status,
    reviewedBy: r.reviewed_by ?? null,
    reviewerName: r.reviewer_name ?? null,
    reviewedAt: r.reviewed_at ?? null,
    comment: r.comment ?? null,
    createdAt: r.created_at
  };
}
function getRequest(db, id) {
  const row = db.prepare(`${REQUEST_SELECT} WHERE r.id = ?`).get(id);
  return row ? mapRequest(row) : null;
}
function optionalTime(v, label) {
  if (v === void 0 || v === null || v === "") return null;
  try {
    parseHHmm(String(v));
  } catch {
    throw new HttpError(400, `${label} kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng HH:mm)`);
  }
  return String(v);
}
function requestRoutes(ctx) {
  const { db } = ctx;
  const r = Router7();
  r.get("/requests", (req, res) => {
    const w = scopeWhere(scopeFor(currentUser(req)), "u.id", "u.department_id");
    const rows = db.prepare(`${REQUEST_SELECT} WHERE ${w.sql} ORDER BY r.created_at DESC`).all(...w.params);
    res.json({ requests: rows.map(mapRequest) });
  });
  r.post("/requests", (req, res) => {
    const user = currentUser(req);
    const b = req.body ?? {};
    if (!isValidDate(b.workDate)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    if (b.workDate > toVnDate(ctx.now())) throw new HttpError(400, "Kh\xF4ng th\u1EC3 g\u1EEDi \u0111\u01A1n cho ng\xE0y trong t\u01B0\u01A1ng lai");
    if (!TYPES.includes(b.type)) throw new HttpError(400, "Lo\u1EA1i \u0111\u01A1n kh\xF4ng h\u1EE3p l\u1EC7");
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!reason) throw new HttpError(400, "Vui l\xF2ng nh\u1EADp l\xFD do");
    let suggestedIn = null;
    let suggestedOut = null;
    if (b.type === "missed_punch") {
      suggestedIn = optionalTime(b.suggestedIn, "Gi\u1EDD v\xE0o \u0111\u1EC1 xu\u1EA5t");
      suggestedOut = optionalTime(b.suggestedOut, "Gi\u1EDD ra \u0111\u1EC1 xu\u1EA5t");
      if (!suggestedIn && !suggestedOut) throw new HttpError(400, "\u0110\u01A1n qu\xEAn qu\u1EB9t c\u1EA7n \xEDt nh\u1EA5t gi\u1EDD v\xE0o ho\u1EB7c gi\u1EDD ra \u0111\u1EC1 xu\u1EA5t");
    }
    const id = newId("req");
    db.prepare(
      `INSERT INTO requests(id, user_id, work_date, type, reason, suggested_in, suggested_out, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, user.id, b.workDate, b.type, reason, suggestedIn, suggestedOut, new Date(ctx.now()).toISOString());
    res.json({ request: getRequest(db, id) });
  });
  r.put("/requests/:id", requireRole("hr", "dept_manager"), (req, res) => {
    const reviewer = currentUser(req);
    const target = getRequest(db, req.params.id);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n");
    if (target.userId === reviewer.id) throw new HttpError(403, "Kh\xF4ng th\u1EC3 t\u1EF1 duy\u1EC7t \u0111\u01A1n c\u1EE7a m\xECnh");
    if (reviewer.role === "dept_manager" && (!reviewer.departmentId || target.departmentId !== reviewer.departmentId)) {
      throw new HttpError(403, "Tr\u01B0\u1EDFng ph\xF2ng ch\u1EC9 \u0111\u01B0\u1EE3c duy\u1EC7t \u0111\u01A1n c\u1EE7a ph\xF2ng m\xECnh");
    }
    const { status, comment } = req.body ?? {};
    if (status !== "approved" && status !== "rejected") throw new HttpError(400, "Tr\u1EA1ng th\xE1i duy\u1EC7t kh\xF4ng h\u1EE3p l\u1EC7");
    if (target.status !== "pending") throw new HttpError(409, "\u0110\u01A1n \u0111\xE3 \u0111\u01B0\u1EE3c x\u1EED l\xFD");
    tx(db, () => {
      db.prepare("UPDATE requests SET status = ?, comment = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(
        status,
        typeof comment === "string" ? comment.trim() : "",
        reviewer.id,
        new Date(ctx.now()).toISOString(),
        target.id
      );
      if (status !== "approved") return;
      if (target.type === "late_explanation") {
        applyDayAdjustment(db, target.userId, target.workDate, { lateExcused: true });
      } else if (target.type === "missed_punch") {
        const hasDetection = db.prepare("SELECT 1 FROM detections WHERE user_id = ? AND work_date = ? LIMIT 1").get(target.userId, target.workDate);
        if (!target.suggestedIn && !hasDetection) {
          throw new HttpError(400, "Ng\xE0y n\xE0y ch\u01B0a c\xF3 l\u01B0\u1EE3t nh\u1EADn di\u1EC7n, \u0111\u01A1n qu\xEAn qu\u1EB9t c\u1EA7n c\xF3 gi\u1EDD v\xE0o \u0111\u1EC1 xu\u1EA5t");
        }
        const patch = {};
        if (target.suggestedIn) patch.manualIn = vnDateTimeToTs(target.workDate, target.suggestedIn);
        if (target.suggestedOut) patch.manualOut = vnDateTimeToTs(target.workDate, target.suggestedOut);
        applyDayAdjustment(db, target.userId, target.workDate, patch);
      }
    });
    res.json({ request: getRequest(db, target.id) });
  });
  return r;
}

// server/routes/hanet.ts
import { Router as Router8 } from "express";

// server/hanet.ts
import { randomBytes as randomBytes3 } from "node:crypto";
var str2 = (v) => v === void 0 || v === null || String(v).trim() === "" ? null : String(v).trim();
var num = (v) => {
  const s = str2(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
function normalizeTs(raw, now) {
  if (raw === null || raw <= 0) return { ts: now, fromServer: true };
  return { ts: raw < 1e12 ? Math.round(raw * 1e3) : raw, fromServer: false };
}
function parseCheckin(body, now) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const d = b.data && typeof b.data === "object" ? b.data : b;
  const deviceId = str2(d.deviceID);
  const aliasId = str2(d.aliasID);
  const personId = str2(d.personID);
  if (!deviceId || !aliasId && !personId) return null;
  const { ts, fromServer } = normalizeTs(num(d.time ?? d.checkinTime), now);
  return {
    input: {
      personId,
      aliasId,
      personName: str2(d.personName),
      personType: num(d.personType ?? d.type),
      deviceId,
      deviceName: str2(d.deviceName),
      placeId: num(d.placeID),
      ts,
      imageUrl: str2(d.detected_image_url ?? d.avatar)
    },
    note: fromServer ? "Thi\u1EBFu th\u1EDDi gian t\u1EEB Hanet, d\xF9ng gi\u1EDD nh\u1EADn" : null
  };
}
var UNMATCHED_MESSAGE = "Kh\xF4ng kh\u1EDBp nh\xE2n vi\xEAn n\xE0o";
var RECENT_FACES_WINDOW_MS = 10 * 6e4;
var RECENT_FACES_LIMIT = 20;
function recentUnmatchedFaces(db, now) {
  const since = new Date(now - RECENT_FACES_WINDOW_MS).toISOString();
  const rows = db.prepare("SELECT raw_payload FROM webhook_logs WHERE status = 'ignored' AND message LIKE ? AND received_at >= ? ORDER BY id DESC").all(`${UNMATCHED_MESSAGE}%`, since);
  const known = db.prepare("SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)");
  const seen = /* @__PURE__ */ new Set();
  const faces = [];
  for (const row of rows) {
    let body;
    try {
      body = row.raw_payload ? JSON.parse(row.raw_payload) : null;
    } catch {
      continue;
    }
    const parsed = parseCheckin(body, now);
    if (!parsed) continue;
    const { personId, aliasId, personName, deviceName, ts, imageUrl } = parsed.input;
    const key = personId ?? `alias:${aliasId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (known.get(aliasId?.toUpperCase() ?? "", personId ?? "")) continue;
    faces.push({ personId, aliasId, personName, deviceName, ts, imageUrl });
    if (faces.length >= RECENT_FACES_LIMIT) break;
  }
  return faces;
}
function ingestCheckin(db, input, source) {
  if (input.personType !== null && input.personType !== 0) return { status: "ignored", message: "Kh\xF4ng ph\u1EA3i nh\xE2n vi\xEAn" };
  let user;
  if (input.aliasId) user = db.prepare("SELECT id, status FROM users WHERE code = ?").get(input.aliasId.toUpperCase());
  if (!user && input.personId) user = db.prepare("SELECT id, status FROM users WHERE hanet_person_id = ?").get(input.personId);
  if (!user) return { status: "ignored", message: UNMATCHED_MESSAGE };
  if (user.status !== "active") return { status: "ignored", message: "Nh\xE2n vi\xEAn \u0111\xE3 ng\u1EEBng ho\u1EA1t \u0111\u1ED9ng", userId: user.id };
  const userId = user.id;
  const workDate = toVnDate(input.ts);
  return tx(db, () => {
    const r = db.prepare(
      `INSERT INTO detections(user_id, hanet_person_id, device_id, device_name, place_id, ts, work_date, image_url, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, device_id, ts) DO NOTHING`
    ).run(userId, input.personId, input.deviceId, input.deviceName, input.placeId, input.ts, workDate, input.imageUrl, source);
    if (Number(r.changes) === 0) return { status: "duplicate", message: "L\u01B0\u1EE3t nh\u1EADn di\u1EC7n \u0111\xE3 c\xF3", userId };
    recomputeDay(db, userId, workDate);
    return { status: "success", message: `\u0110\xE3 ghi nh\u1EADn ng\xE0y ${workDate}`, userId };
  });
}
var WEBHOOK_LOG_LIMIT = 500;
function logWebhook(db, e, now) {
  db.prepare("INSERT INTO webhook_logs(received_at, status, person_name, device_name, message, raw_payload) VALUES (?, ?, ?, ?, ?, ?)").run(
    new Date(now).toISOString(),
    e.status,
    e.personName ?? null,
    e.deviceName ?? null,
    e.message ?? null,
    e.rawPayload === void 0 ? null : JSON.stringify(e.rawPayload)
  );
  db.prepare("DELETE FROM webhook_logs WHERE id <= (SELECT id FROM webhook_logs ORDER BY id DESC LIMIT 1 OFFSET ?)").run(WEBHOOK_LOG_LIMIT);
}
var WEBHOOK_TOKEN_KEY = "hanet.webhook_token";
function getWebhookToken(db) {
  return getSetting(db, WEBHOOK_TOKEN_KEY) ?? rotateWebhookToken(db);
}
function rotateWebhookToken(db) {
  const token = randomBytes3(24).toString("base64url");
  setSetting(db, WEBHOOK_TOKEN_KEY, token);
  return token;
}
function mask(v) {
  return v ? `\u2022\u2022\u2022\u2022${v.slice(-4)}` : "";
}
var HANET_DEFAULT_API_BASE = "https://partner.hanet.ai";
function getPlaceIds(db) {
  try {
    const v = JSON.parse(getSetting(db, "hanet.place_ids") ?? "[]");
    return Array.isArray(v) ? v.filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}
function reconcileEnabled(db) {
  return Boolean(getSetting(db, "hanet.client_id")) && Boolean(getSetting(db, "hanet.refresh_token") || getSetting(db, "hanet.access_token")) && getPlaceIds(db).length > 0;
}
function getHanetConfigView(db) {
  return {
    clientId: getSetting(db, "hanet.client_id") ?? "",
    clientSecret: mask(getSetting(db, "hanet.client_secret")),
    accessToken: mask(getSetting(db, "hanet.access_token")),
    refreshToken: mask(getSetting(db, "hanet.refresh_token")),
    apiBase: getSetting(db, "hanet.api_base") ?? HANET_DEFAULT_API_BASE,
    placeIds: getPlaceIds(db),
    webhookPath: `/api/hanet/webhook/${getWebhookToken(db)}`,
    lastReconcileAt: getSetting(db, "hanet.last_reconcile_at") ?? null,
    lastReconcileError: getSetting(db, "hanet.last_reconcile_error") ?? null,
    reconcileEnabled: reconcileEnabled(db)
  };
}
var TEXT_FIELDS = [
  ["clientId", "hanet.client_id"],
  ["clientSecret", "hanet.client_secret"],
  ["accessToken", "hanet.access_token"],
  ["refreshToken", "hanet.refresh_token"],
  ["apiBase", "hanet.api_base"]
];
function updateHanetConfig(db, body) {
  const b = body ?? {};
  for (const [field, key] of TEXT_FIELDS) {
    const v = b[field];
    if (typeof v === "string" && v.trim() !== "" && !v.startsWith("\u2022\u2022\u2022\u2022")) setSetting(db, key, v.trim());
  }
  if (Array.isArray(b.placeIds)) {
    const ids = b.placeIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    setSetting(db, "hanet.place_ids", JSON.stringify(ids));
  }
}

// server/hanet-api.ts
var HanetApiError = class extends Error {
  constructor(returnCode, message) {
    super(message);
    this.returnCode = returnCode;
  }
};
var OAUTH_TOKEN_URL = "https://oauth.hanet.com/token";
var PAGE_SIZE = 500;
var TOKEN_EXPIRED = -103;
var MAX_PAGES = 200;
async function postForm(deps, url, params) {
  const res = await deps.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString()
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} t\u1EEB ${url}`);
  return res.json();
}
async function refreshAccessToken(deps) {
  const { db } = deps;
  const refreshToken = getSetting(db, "hanet.refresh_token");
  const clientId = getSetting(db, "hanet.client_id");
  const clientSecret = getSetting(db, "hanet.client_secret");
  if (!refreshToken || !clientId || !clientSecret) {
    throw new HanetApiError(0, "L\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i: thi\u1EBFu Client ID, Client Secret ho\u1EB7c Refresh Token");
  }
  const body = await postForm(deps, OAUTH_TOKEN_URL, {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  });
  const token = body?.access_token;
  if (typeof token !== "string" || !token) {
    throw new HanetApiError(Number(body?.returnCode ?? 0), `L\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i: ${body?.returnMessage ?? body?.error ?? "kh\xF4ng r\xF5 l\xFD do"}`);
  }
  setSetting(db, "hanet.access_token", token);
  if (typeof body.refresh_token === "string" && body.refresh_token) setSetting(db, "hanet.refresh_token", body.refresh_token);
  return token;
}
async function callApi(deps, apiPath, params, retried = false) {
  const token = getSetting(deps.db, "hanet.access_token") ?? await refreshAccessToken(deps);
  const base = (getSetting(deps.db, "hanet.api_base") ?? HANET_DEFAULT_API_BASE).replace(/\/+$/, "");
  const body = await postForm(deps, base + apiPath, { token, ...params });
  const code = Number(body?.returnCode);
  if (code === TOKEN_EXPIRED && !retried) {
    await refreshAccessToken(deps);
    return callApi(deps, apiPath, params, true);
  }
  if (code !== 1) throw new HanetApiError(code, `Hanet tr\u1EA3 l\u1ED7i ${code}: ${body?.returnMessage ?? ""}`);
  return body;
}
async function fetchCheckins(deps, placeId, from, to) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await callApi(deps, "/person/getCheckinByPlaceIdInTimestamp", {
      placeID: String(placeId),
      from: String(from),
      to: String(to),
      type: "0",
      page: String(page),
      size: String(PAGE_SIZE)
    });
    const data = Array.isArray(body.data) ? body.data : [];
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}
async function reconcileRange(deps, from, to) {
  const { db } = deps;
  const summary = { inserted: 0, duplicates: 0, ignored: 0 };
  try {
    for (const placeId of getPlaceIds(db)) {
      for (const item of await fetchCheckins(deps, placeId, from, to)) {
        const parsed = parseCheckin(item, deps.now());
        if (!parsed) {
          summary.ignored++;
          continue;
        }
        const r = ingestCheckin(db, parsed.input, "reconcile");
        if (r.status === "success") summary.inserted++;
        else if (r.status === "duplicate") summary.duplicates++;
        else summary.ignored++;
      }
    }
  } catch (err) {
    setSetting(db, "hanet.last_reconcile_error", err.message);
    throw err;
  }
  setSetting(db, "hanet.last_reconcile_at", new Date(deps.now()).toISOString());
  deleteSetting(db, "hanet.last_reconcile_error");
  return summary;
}
async function reconcileDate(deps, date) {
  const from = vnDayStart(date);
  const to = Math.min(vnDayStart(addDays(date, 1)) - 1, deps.now());
  return reconcileRange(deps, from, to);
}

// server/routes/hanet.ts
function hanetPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router8();
  r.post("/hanet/webhook/:token", (req, res) => {
    const now = ctx.now();
    if (!safeEqualStrings(req.params.token, getWebhookToken(db))) {
      console.warn(`[SECURITY] webhook_bad_token ip=${req.ip}`);
      logWebhook(db, { status: "rejected", message: "Sai token webhook" }, now);
      res.status(401).json({ returnCode: -1, returnMessage: "Unauthorized" });
      return;
    }
    const parsed = parseCheckin(req.body, now);
    if (!parsed) {
      logWebhook(db, { status: "ignored", message: "Kh\xF4ng ph\u1EA3i s\u1EF1 ki\u1EC7n nh\u1EADn di\u1EC7n", rawPayload: req.body }, now);
      res.json({ returnCode: 1, returnMessage: "ignored" });
      return;
    }
    let result;
    try {
      result = ingestCheckin(db, parsed.input, "webhook");
    } catch (err) {
      console.error("[WEBHOOK] L\u1ED7i ghi l\u01B0\u1EE3t nh\u1EADn di\u1EC7n:", err);
      try {
        logWebhook(db, { status: "error", message: err.message, rawPayload: req.body }, now);
      } catch {
      }
      res.status(500).json({ returnCode: -503, returnMessage: "L\u1ED7i l\u01B0u d\u1EEF li\u1EC7u" });
      return;
    }
    logWebhook(
      db,
      {
        status: result.status,
        personName: parsed.input.personName,
        deviceName: parsed.input.deviceName,
        message: [result.message, parsed.note].filter(Boolean).join("; "),
        rawPayload: req.body
      },
      now
    );
    res.json({ returnCode: 1, returnMessage: result.status });
  });
  r.all("/hanet/webhook", (_req, res) => {
    res.status(404).json({ error: "Kh\xF4ng t\xECm th\u1EA5y" });
  });
  return r;
}
function hanetRoutes(ctx) {
  const { db } = ctx;
  const r = Router8();
  const hr = requireRole("hr");
  r.get("/hanet/config", hr, (_req, res) => {
    res.json({ config: getHanetConfigView(db) });
  });
  r.put("/hanet/config", hr, (req, res) => {
    updateHanetConfig(db, req.body);
    res.json({ config: getHanetConfigView(db) });
  });
  r.post("/hanet/webhook-token/rotate", hr, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });
  r.get("/hanet/recent-faces", hr, (_req, res) => {
    res.json({ faces: recentUnmatchedFaces(db, ctx.now()) });
  });
  r.get("/hanet/webhook-logs", hr, (_req, res) => {
    const rows = db.prepare("SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 200").all();
    const logs = rows.map((x) => {
      let rawPayload = null;
      try {
        rawPayload = x.raw_payload ? JSON.parse(x.raw_payload) : null;
      } catch {
        rawPayload = x.raw_payload;
      }
      return { id: x.id, receivedAt: x.received_at, status: x.status, personName: x.person_name ?? null, deviceName: x.device_name ?? null, message: x.message ?? null, rawPayload };
    });
    res.json({ logs });
  });
  r.post("/hanet/simulate", hr, (req, res) => {
    if (!ctx.config.simulatorEnabled) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y");
    const b = req.body ?? {};
    const target = typeof b.userId === "string" ? getUser(db, b.userId) : null;
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n vi\xEAn");
    const now = ctx.now();
    let ts = now;
    if (b.time !== void 0 && b.time !== "") {
      const date = typeof b.date === "string" && b.date ? b.date : toVnDate(now);
      if (!isValidDate(date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
      try {
        ts = vnDateTimeToTs(date, String(b.time));
      } catch {
        throw new HttpError(400, "Gi\u1EDD kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng HH:mm)");
      }
    }
    const input = {
      personId: target.hanetPersonId,
      aliasId: target.code,
      personName: target.name,
      personType: 0,
      deviceId: typeof b.deviceId === "string" && b.deviceId.trim() ? b.deviceId.trim() : "SIMULATOR",
      deviceName: "M\xF4 ph\u1ECFng",
      placeId: null,
      ts,
      imageUrl: target.avatarUrl || null
    };
    const result = ingestCheckin(db, input, "simulator");
    logWebhook(db, { status: result.status, personName: target.name, deviceName: "M\xF4 ph\u1ECFng", message: `[M\xF4 ph\u1ECFng] ${result.message}` }, now);
    res.json({ result });
  });
  r.post(
    "/hanet/reconcile",
    hr,
    ah(async (req, res) => {
      if (!reconcileEnabled(db)) throw new HttpError(400, "Ch\u01B0a c\u1EA5u h\xECnh \u0111\u1EE7 Client ID, token v\xE0 Place ID \u0111\u1EC3 \u0111\u1ED1i so\xE1t");
      const date = typeof req.body?.date === "string" && req.body.date ? req.body.date : toVnDate(ctx.now());
      if (!isValidDate(date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
      try {
        const summary = await reconcileDate({ db, fetch: ctx.fetch, now: ctx.now }, date);
        res.json({ summary, config: getHanetConfigView(db) });
      } catch (err) {
        throw new HttpError(502, `\u0110\u1ED1i so\xE1t th\u1EA5t b\u1EA1i: ${err.message}`);
      }
    })
  );
  return r;
}

// server/routes/admin.ts
import { Router as Router9 } from "express";
function adminRoutes(ctx) {
  const { db } = ctx;
  const dir = ctx.config.backupDir;
  const r = Router9();
  const hr = requireRole("hr");
  r.get("/admin/backups", hr, (_req, res) => {
    res.json({ backups: listBackups(dir) });
  });
  r.post("/admin/backups", hr, (_req, res) => {
    res.json({ backup: backupNow(db, dir, "manual", ctx.now()) });
  });
  r.get("/admin/backups/latest", hr, (_req, res) => {
    const file = latestBackup(dir);
    if (!file) throw new HttpError(404, "Ch\u01B0a c\xF3 b\u1EA3n sao l\u01B0u n\xE0o");
    res.download(file);
  });
  r.post("/admin/reset-database", hr, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(actor.id);
    const password = req.body?.password;
    if (typeof password !== "string" || !verifyPassword(password, row?.password_hash)) {
      throw new HttpError(400, "M\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng");
    }
    const backup = backupNow(db, dir, "pre-reset", ctx.now());
    tx(db, () => {
      for (const table of ["detections", "attendance_days", "requests", "webhook_logs", "cameras"]) db.exec(`DELETE FROM ${table}`);
      db.prepare("UPDATE users SET department_id = NULL WHERE id = ?").run(actor.id);
      db.exec("UPDATE departments SET manager_id = NULL");
      db.prepare("DELETE FROM users WHERE id != ?").run(actor.id);
      db.exec("DELETE FROM departments");
    });
    console.warn(`[SECURITY] database_reset by=${actor.code} backup=${backup} ip=${req.ip}`);
    res.json({ success: true, backup });
  });
  return r;
}

// server/app.ts
function createApp(ctx) {
  const app = express();
  app.disable("x-powered-by");
  if (ctx.config.trustProxy) app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.get("/api/health", (_req, res) => {
    try {
      ctx.db.prepare("SELECT 1").get();
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use("/api", authPublicRoutes(ctx));
  app.use("/api", hanetPublicRoutes(ctx));
  const api = express.Router();
  api.use(requireAuth(ctx), mustChangeGate, jsonOnly);
  api.use(authRoutes(ctx));
  api.use(userRoutes(ctx));
  api.use(departmentRoutes(ctx));
  api.use(cameraRoutes(ctx));
  api.use(attendanceRoutes(ctx));
  api.use(settingsRoutes(ctx));
  api.use(requestRoutes(ctx));
  api.use(hanetRoutes(ctx));
  api.use(adminRoutes(ctx));
  app.use("/api", api);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y")));
  app.use(errorHandler(ctx.config.production));
  return app;
}

// server/jobs.ts
function dueJobs(now) {
  const m = vnMinutesOfDay(now);
  return {
    backup: m === 2 * 60,
    reconcileToday: m % 15 === 0,
    reconcileYesterday: m === 5,
    purgeSessions: m % 60 === 0
  };
}
function startJobs(ctx) {
  const running = /* @__PURE__ */ new Set();
  const deps = { db: ctx.db, fetch: ctx.fetch, now: ctx.now };
  const run = (name, fn) => {
    if (running.has(name)) return;
    running.add(name);
    Promise.resolve().then(fn).catch((err) => console.error(`[JOB] ${name} l\u1ED7i:`, err.message)).finally(() => running.delete(name));
  };
  let lastMinute = -1;
  const tick = () => {
    const now = ctx.now();
    const minute = Math.floor(now / 6e4);
    if (minute === lastMinute) return;
    lastMinute = minute;
    const due = dueJobs(now);
    const today = toVnDate(now);
    if (due.backup) run("backup", () => backupNow(ctx.db, ctx.config.backupDir, "daily", now));
    if (due.purgeSessions) run("purge-sessions", () => purgeExpiredSessions(ctx.db, now));
    if (reconcileEnabled(ctx.db)) {
      if (due.reconcileToday) run("reconcile-today", () => reconcileDate(deps, today));
      if (due.reconcileYesterday) run("reconcile-yesterday", () => reconcileDate(deps, addDays(today, -1)));
    }
  };
  if (reconcileEnabled(ctx.db)) {
    const today = toVnDate(ctx.now());
    run("reconcile-startup", async () => {
      await reconcileDate(deps, addDays(today, -1));
      await reconcileDate(deps, today);
    });
  }
  const timer = setInterval(tick, 2e4);
  timer.unref();
  return () => clearInterval(timer);
}

// server/index.ts
var production = process.env.NODE_ENV === "production";
var PORT = Number(process.env.PORT) || 3001;
var dataDir = path3.resolve(process.cwd(), "data");
var backupDir = path3.join(dataDir, "backups");
async function main() {
  const db = openDb(path3.join(dataDir, "attendance.db"));
  const admin = ensureAdminAccess(db, process.env.ADMIN_INITIAL_PASSWORD);
  if (admin) {
    console.log(
      admin.fromEnv ? `[BOOTSTRAP] \u0110\xE3 t\u1EA1o t\xE0i kho\u1EA3n ${admin.code} v\u1EDBi m\u1EADt kh\u1EA9u ADMIN_INITIAL_PASSWORD. H\xE3y \u0111\u0103ng nh\u1EADp v\xE0 \u0111\u1ED5i m\u1EADt kh\u1EA9u ngay.` : `[BOOTSTRAP] \u0110\xE3 t\u1EA1o t\xE0i kho\u1EA3n ${admin.code} v\u1EDBi m\u1EADt kh\u1EA9u m\u1EB7c \u0111\u1ECBnh ${DEFAULT_ADMIN_PASSWORD}. H\xE3y \u0111\u0103ng nh\u1EADp v\xE0 \u0111\u1ED5i m\u1EADt kh\u1EA9u ngay.`
    );
  }
  const ctx = {
    db,
    config: {
      production,
      simulatorEnabled: !production || process.env.ENABLE_SIMULATOR === "1",
      trustProxy: process.env.TRUST_PROXY === "1",
      backupDir
    },
    limiter: new LoginLimiter(),
    fetch: globalThis.fetch,
    now: () => Date.now()
  };
  const app = createApp(ctx);
  if (!production) {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path3.resolve(process.cwd(), "dist");
    app.use(express2.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path3.join(distPath, "index.html")));
  }
  startJobs(ctx);
  app.listen(PORT, "0.0.0.0", () => console.log(`[Petrolimex Attendance] \u0110ang ch\u1EA1y t\u1EA1i http://0.0.0.0:${PORT}`));
}
main().catch((err) => {
  console.error("[STARTUP] Kh\xF4ng kh\u1EDFi \u0111\u1ED9ng \u0111\u01B0\u1EE3c:", err);
  process.exit(1);
});
