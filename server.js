var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/schema.ts
function ddlShifts(ifNotExists) {
  return `CREATE TABLE ${ine(ifNotExists)}shifts (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  work_start TEXT NOT NULL,
  work_end TEXT NOT NULL,
  work_days TEXT NOT NULL,
  late_grace_minutes INTEGER NOT NULL,
  early_arrival_minutes INTEGER NOT NULL,
  early_leave_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (area_id, name)
);`;
}
function ddlHolidays(ifNotExists) {
  return `CREATE TABLE ${ine(ifNotExists)}holidays (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL
);`;
}
function ddlRequests(name, ifNotExists) {
  return `CREATE TABLE ${ine(ifNotExists)}${name} (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  end_date TEXT,
  type TEXT NOT NULL CHECK (type IN ('missed_punch', 'late_explanation', 'leave_request', 'business_trip')),
  reason TEXT NOT NULL,
  suggested_in TEXT,
  suggested_out TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  comment TEXT,
  created_at TEXT NOT NULL
);`;
}
function ddlAttendanceDays(name, ifNotExists) {
  return `CREATE TABLE ${ine(ifNotExists)}${name} (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  first_in INTEGER,
  last_out INTEGER,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  early_minutes INTEGER NOT NULL DEFAULT 0,
  early_arrival_minutes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('on_time', 'late', 'early_leave', 'late_and_early', 'missing_out', 'absent', 'leave', 'business_trip')),
  final INTEGER NOT NULL DEFAULT 0,
  late_excused INTEGER NOT NULL DEFAULT 0,
  manual_in INTEGER,
  manual_out INTEGER,
  detection_count INTEGER NOT NULL,
  PRIMARY KEY (user_id, work_date)
);`;
}
var SCHEMA_VERSION, ine, SCHEMA;
var init_schema = __esm({
  "server/schema.ts"() {
    SCHEMA_VERSION = 4;
    ine = (b) => b ? "IF NOT EXISTS " : "";
    SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  manager_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  hanet_department_id TEXT,
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
  shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT,
  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_departments_area ON departments(area_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('hr', 'area_admin', 'dept_manager', 'employee')),
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  position TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  hanet_person_id TEXT,
  face_registered INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  hanet_sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (hanet_sync_status IN ('synced', 'pending', 'error')),
  hanet_sync_error TEXT,
  face_error TEXT,
  shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT,
  email_status TEXT NOT NULL DEFAULT 'none' CHECK (email_status IN ('none', 'pending', 'sent', 'error')),
  email_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_hanet_person ON users(hanet_person_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(lower(email)) WHERE email != '';

CREATE TABLE IF NOT EXISTS admin_areas (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id TEXT NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, area_id)
);

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
  online INTEGER,
  status_checked_at INTEGER,
  area_id TEXT REFERENCES areas(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cameras_area ON cameras(area_id);

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

${ddlAttendanceDays("attendance_days", true)}
CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date);

${ddlRequests("requests", true)}
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

CREATE TABLE IF NOT EXISTS sync_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'department', 'camera')),
  entity_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'error', 'done')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_due ON sync_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_jobs(entity_type, entity_id, id);

CREATE TABLE IF NOT EXISTS face_sightings (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('stranger', 'unlinked')),
  person_id TEXT,
  alias_id TEXT,
  person_name TEXT,
  device_id TEXT NOT NULL,
  device_name TEXT,
  ts INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sightings_created ON face_sightings(created_at);

CREATE TABLE IF NOT EXISTS email_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('welcome', 'reset_temp', 'reset_link')),
  to_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  next_run_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_email_jobs_due ON email_jobs(status, next_run_at);

CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

${ddlShifts(true)}

${ddlHolidays(true)}
`;
  }
});

// server/vntime.ts
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
var VN_OFFSET_MS, DAY_MS;
var init_vntime = __esm({
  "server/vntime.ts"() {
    VN_OFFSET_MS = 7 * 60 * 60 * 1e3;
    DAY_MS = 24 * 60 * 60 * 1e3;
  }
});

// server/backup.ts
import fs from "node:fs";
import path from "node:path";
function stamp(now) {
  const iso = new Date(now + VN_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19).replace(/:/g, "") };
}
function backupNow(db, dir, reason, now) {
  fs.mkdirSync(dir, { recursive: true });
  const { date, time } = stamp(now);
  let name;
  if (reason === "daily") {
    name = `attendance-${date}.db`;
    if (fs.existsSync(path.join(dir, name))) return null;
  } else {
    name = `attendance-${date}-${time}-${reason}.db`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `attendance-${date}-${time}-${reason}-${i}.db`;
  }
  db.prepare("VACUUM INTO ?").run(path.join(dir, name));
  pruneBackups(dir);
  return name;
}
function listBackups(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).map((name) => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, createdAt: st.mtime.toISOString() };
  }).sort((a, b) => a.createdAt === b.createdAt ? b.name.localeCompare(a.name) : b.createdAt.localeCompare(a.createdAt));
}
function pruneBackups(dir) {
  if (!fs.existsSync(dir)) return;
  const names = fs.readdirSync(dir).filter((n) => BACKUP_RE.test(n)).sort().reverse();
  const daily = names.filter((n) => DAILY_RE.test(n));
  const others = names.filter((n) => !DAILY_RE.test(n));
  for (const n of [...daily.slice(BACKUP_KEEP), ...others.slice(BACKUP_KEEP)]) fs.rmSync(path.join(dir, n), { force: true });
}
function latestBackup(dir) {
  const [first] = listBackups(dir);
  return first ? path.join(dir, first.name) : null;
}
var BACKUP_KEEP, BACKUP_RE, DAILY_RE;
var init_backup = __esm({
  "server/backup.ts"() {
    init_vntime();
    BACKUP_KEEP = 30;
    BACKUP_RE = /^attendance-.*\.db$/;
    DAILY_RE = /^attendance-\d{4}-\d{2}-\d{2}\.db$/;
  }
});

// server/migrations.ts
function migrate3to4(db, now) {
  db.exec(ddlShifts(false));
  db.exec(ddlHolidays(false));
  db.exec("ALTER TABLE departments ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT");
  db.exec("ALTER TABLE users ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT");
  db.exec(ddlRequests("requests_v4", false));
  db.exec(`INSERT INTO requests_v4(id, user_id, work_date, end_date, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at)
    SELECT id, user_id, work_date, NULL, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at FROM requests`);
  db.exec("DROP TABLE requests");
  db.exec("ALTER TABLE requests_v4 RENAME TO requests");
  db.exec("CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id)");
  db.exec(ddlAttendanceDays("attendance_days_v4", false));
  db.prepare(
    `INSERT INTO attendance_days_v4(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     SELECT user_id, work_date, first_in, last_out, late_minutes, early_minutes, 0, status, CASE WHEN work_date < ? THEN 1 ELSE 0 END,
       late_excused, manual_in, manual_out, detection_count FROM attendance_days`
  ).run(toVnDate(now));
  db.exec("DROP TABLE attendance_days");
  db.exec("ALTER TABLE attendance_days_v4 RENAME TO attendance_days");
  db.exec("CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date)");
  db.exec(`INSERT OR IGNORE INTO settings(key, value) VALUES ('work_days', '1,2,3,4,5'), ('early_arrival_minutes', '15'), ('early_leave_minutes', '10')`);
}
function runMigrations(db, file, from, opts) {
  const backup = opts.backupDir && file !== ":memory:" ? backupNow(db, opts.backupDir, "pre-migrate", opts.now) : null;
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let v = from; v < SCHEMA_VERSION; v++) {
        const step = MIGRATIONS.find((m) => m.from === v);
        if (!step) throw new Error(`thi\u1EBFu b\u01B0\u1EDBc n\xE2ng c\u1EA5p v${v} \u2192 v${v + 1}`);
        step.run(db, opts.now);
      }
      const bad = db.prepare("PRAGMA foreign_key_check").all();
      if (bad.length) throw new Error(`d\u1EEF li\u1EC7u kh\xF3a ngo\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7 (${bad.length} d\xF2ng)`);
      db.prepare("UPDATE schema_version SET version = ?").run(SCHEMA_VERSION);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    throw new MigrationError(
      `[MIGRATE] N\xE2ng c\u1EA5p v${from} \u2192 v${SCHEMA_VERSION} th\u1EA5t b\u1EA1i: ${err.message}. Database gi\u1EEF nguy\xEAn v${from}${backup ? ` (sao l\u01B0u: ${backup})` : ""}.`,
      backup
    );
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
  console.log(`[MIGRATE] v${from} \u2192 v${SCHEMA_VERSION} xong (sao l\u01B0u: ${backup ?? "kh\xF4ng"})`);
  return backup;
}
var MIN_MIGRATABLE_VERSION, MigrationError, MIGRATIONS;
var init_migrations = __esm({
  "server/migrations.ts"() {
    init_backup();
    init_schema();
    init_vntime();
    MIN_MIGRATABLE_VERSION = 3;
    MigrationError = class extends Error {
      constructor(message, backup) {
        super(message);
        this.backup = backup;
      }
    };
    MIGRATIONS = [{ from: 3, run: migrate3to4 }];
  }
});

// server/db.ts
import { createRequire } from "node:module";
import fs2 from "node:fs";
import path2 from "node:path";
import { randomBytes } from "node:crypto";
function openDb(file, opts = {}) {
  if (file !== ":memory:") fs2.mkdirSync(path2.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const hasVersionTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'").get();
  const found = hasVersionTable ? db.prepare("SELECT version FROM schema_version").get() : void 0;
  try {
    if (found && found.version > SCHEMA_VERSION) throw new SchemaTooNewError(found.version);
    if (found && found.version < MIN_MIGRATABLE_VERSION) throw new SchemaVersionError(found.version);
    if (found && found.version < SCHEMA_VERSION) {
      runMigrations(db, file, found.version, {
        backupDir: file === ":memory:" ? null : opts.backupDir ?? path2.join(path2.dirname(file), "backups"),
        now: (opts.now ?? Date.now)()
      });
    }
  } catch (err) {
    db.close();
    throw err;
  }
  db.exec(SCHEMA);
  if (!found) db.prepare("INSERT INTO schema_version(version) VALUES (?)").run(SCHEMA_VERSION);
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
var require2, DatabaseSync, SchemaVersionError, SchemaTooNewError;
var init_db = __esm({
  "server/db.ts"() {
    init_schema();
    init_migrations();
    init_schema();
    require2 = createRequire(import.meta.url);
    ({ DatabaseSync } = require2("node:sqlite"));
    SchemaVersionError = class extends Error {
      constructor(found) {
        super(`[STARTUP] Database phi\xEAn b\u1EA3n c\u0169 (v${found}). Sao l\u01B0u r\u1ED3i x\xF3a data/attendance.db \u0111\u1EC3 h\u1EC7 th\u1ED1ng t\u1EA1o m\u1EDBi.`);
        this.found = found;
      }
    };
    SchemaTooNewError = class extends Error {
      constructor(found) {
        super(`[STARTUP] Database \u0111\u01B0\u1EE3c t\u1EA1o b\u1EDFi phi\xEAn b\u1EA3n m\u1EDBi h\u01A1n (v${found}). H\xE3y c\u1EADp nh\u1EADt code.`);
        this.found = found;
      }
    };
  }
});

// server/errors.ts
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
var HttpError;
var init_errors = __esm({
  "server/errors.ts"() {
    HttpError = class extends Error {
      constructor(status, message, code) {
        super(message);
        this.status = status;
        this.code = code;
      }
    };
  }
});

// server/auth.ts
import { randomBytes as randomBytes2, scryptSync, timingSafeEqual, createHash } from "node:crypto";
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
  const areaIds = row.role === "area_admin" ? db.prepare("SELECT area_id FROM admin_areas WHERE user_id = ? ORDER BY area_id").all(row.id).map((r) => r.area_id) : [];
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    role: row.role,
    departmentId: row.department_id ?? null,
    mustChangePassword: row.must_change_password === 1,
    areaIds
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
function scopeFor(user) {
  if (user.role === "hr") return { kind: "all" };
  if (user.role === "area_admin") return { kind: "areas", areaIds: user.areaIds, userId: user.id };
  if (user.role === "dept_manager") return { kind: "department", departmentId: user.departmentId };
  return { kind: "self", userId: user.id };
}
function scopeWhere(scope, userIdCol, deptCol) {
  switch (scope.kind) {
    case "all":
      return { sql: "1=1", params: [] };
    case "areas":
      return scope.areaIds.length ? {
        sql: `(${userIdCol} = ? OR ${deptCol} IN (SELECT id FROM departments WHERE area_id IN (${scope.areaIds.map(() => "?").join(", ")})))`,
        params: [scope.userId, ...scope.areaIds]
      } : { sql: `${userIdCol} = ?`, params: [scope.userId] };
    case "department":
      return scope.departmentId ? { sql: `${deptCol} = ?`, params: [scope.departmentId] } : { sql: "0=1", params: [] };
    case "self":
      return { sql: `${userIdCol} = ?`, params: [scope.userId] };
  }
}
var SCRYPT_PARAMS, SALT_BYTES, KEY_BYTES, TEMP_ALPHABET, SESSION_TTL_MS, LoginLimiter;
var init_auth = __esm({
  "server/auth.ts"() {
    SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
    SALT_BYTES = 16;
    KEY_BYTES = 64;
    TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
    LoginLimiter = class {
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
  }
});

// server/bootstrap.ts
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
var DEFAULT_ADMIN_PASSWORD, SYSTEM_ADMIN_CODE, NOT_SYSTEM_ADMIN;
var init_bootstrap = __esm({
  "server/bootstrap.ts"() {
    init_db();
    init_auth();
    init_vntime();
    DEFAULT_ADMIN_PASSWORD = "Admin@123";
    SYSTEM_ADMIN_CODE = "ADMIN";
    NOT_SYSTEM_ADMIN = `u.code != '${SYSTEM_ADMIN_CODE}'`;
  }
});

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
function daysFrom(s) {
  return s ? s.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b) : DEFAULT_WORK_SETTINGS.workDays;
}
function getWorkSettings(db) {
  return {
    workStart: getSetting(db, "work_start") ?? DEFAULT_WORK_SETTINGS.workStart,
    lateGraceMinutes: Number(getSetting(db, "late_grace_minutes") ?? DEFAULT_WORK_SETTINGS.lateGraceMinutes),
    workEnd: getSetting(db, "work_end") ?? DEFAULT_WORK_SETTINGS.workEnd,
    minOutGapMinutes: Number(getSetting(db, "min_out_gap_minutes") ?? DEFAULT_WORK_SETTINGS.minOutGapMinutes),
    workDays: daysFrom(getSetting(db, "work_days")),
    earlyArrivalMinutes: Number(getSetting(db, "early_arrival_minutes") ?? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes),
    earlyLeaveMinutes: Number(getSetting(db, "early_leave_minutes") ?? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes)
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
function workDaysInput(v, label = "Ng\xE0y l\xE0m trong tu\u1EA7n") {
  if (!Array.isArray(v)) throw new HttpError(400, `${label} kh\xF4ng h\u1EE3p l\u1EC7`);
  const days = [...new Set(v.map(Number))].sort((a, b) => a - b);
  if (days.length === 0 || days.some((n) => !Number.isInteger(n) || n < 1 || n > 7)) throw new HttpError(400, `${label} ph\u1EA3i ch\u1ECDn \xEDt nh\u1EA5t m\u1ED9t ng\xE0y t\u1EEB th\u1EE9 2 \u0111\u1EBFn ch\u1EE7 nh\u1EADt`);
  return days;
}
function validateWorkSettings(input) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Thi\u1EBFu c\u1EA5u h\xECnh gi\u1EDD l\xE0m vi\u1EC7c");
  const b = input;
  const ws = {
    workStart: hhmm(b.workStart, "Gi\u1EDD v\xE0o"),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, "S\u1ED1 ph\xFAt cho ph\xE9p mu\u1ED9n"),
    workEnd: hhmm(b.workEnd, "Gi\u1EDD ra"),
    minOutGapMinutes: intInRange(b.minOutGapMinutes, 1, 720, "Ng\u01B0\u1EE1ng gi\u1EDD ra"),
    workDays: b.workDays === void 0 ? DEFAULT_WORK_SETTINGS.workDays : workDaysInput(b.workDays),
    earlyArrivalMinutes: b.earlyArrivalMinutes === void 0 ? DEFAULT_WORK_SETTINGS.earlyArrivalMinutes : intInRange(b.earlyArrivalMinutes, 0, 120, "Ng\u01B0\u1EE1ng \u0111i s\u1EDBm"),
    earlyLeaveMinutes: b.earlyLeaveMinutes === void 0 ? DEFAULT_WORK_SETTINGS.earlyLeaveMinutes : intInRange(b.earlyLeaveMinutes, 0, 120, "Cho ph\xE9p v\u1EC1 s\u1EDBm")
  };
  if (parseHHmm(ws.workEnd) <= parseHHmm(ws.workStart)) throw new HttpError(400, "Gi\u1EDD ra ph\u1EA3i sau gi\u1EDD v\xE0o");
  return ws;
}
function saveWorkSettings(db, ws) {
  setSetting(db, "work_start", ws.workStart);
  setSetting(db, "late_grace_minutes", String(ws.lateGraceMinutes));
  setSetting(db, "work_end", ws.workEnd);
  setSetting(db, "min_out_gap_minutes", String(ws.minOutGapMinutes));
  setSetting(db, "work_days", ws.workDays.join(","));
  setSetting(db, "early_arrival_minutes", String(ws.earlyArrivalMinutes));
  setSetting(db, "early_leave_minutes", String(ws.earlyLeaveMinutes));
}
var DEFAULT_WORK_SETTINGS;
var init_settings = __esm({
  "server/settings.ts"() {
    init_vntime();
    init_errors();
    DEFAULT_WORK_SETTINGS = {
      workStart: "08:00",
      lateGraceMinutes: 15,
      workEnd: "17:00",
      minOutGapMinutes: 30,
      workDays: [1, 2, 3, 4, 5],
      earlyArrivalMinutes: 15,
      earlyLeaveMinutes: 10
    };
  }
});

// server/shifts.ts
function parseWorkDays(s) {
  return s.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7).sort((a, b) => a - b);
}
function formatWorkDays(days) {
  return [...days].sort((a, b) => a - b).join(",");
}
function ruleFromSettings(ws) {
  return {
    shiftId: null,
    name: DEFAULT_SHIFT_NAME,
    workStart: parseHHmm(ws.workStart),
    workEnd: parseHHmm(ws.workEnd),
    workDays: ws.workDays,
    graceMinutes: ws.lateGraceMinutes,
    earlyArrivalMinutes: ws.earlyArrivalMinutes,
    earlyLeaveMinutes: ws.earlyLeaveMinutes,
    minOutGapMinutes: ws.minOutGapMinutes
  };
}
function defaultShiftRule(db) {
  return ruleFromSettings(getWorkSettings(db));
}
function ruleFromRow(r, minOutGapMinutes) {
  return {
    shiftId: r.id,
    name: r.name,
    workStart: parseHHmm(r.work_start),
    workEnd: parseHHmm(r.work_end),
    workDays: parseWorkDays(r.work_days),
    graceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    minOutGapMinutes
  };
}
function effectiveShift(db, userId) {
  const base = defaultShiftRule(db);
  const u = db.prepare("SELECT u.shift_id AS own, d.shift_id AS dept, d.area_id AS area FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?").get(userId);
  if (!u || !u.area) return base;
  const byId = db.prepare("SELECT * FROM shifts WHERE id = ? AND area_id = ?");
  for (const id of [u.own, u.dept]) {
    if (!id) continue;
    const row = byId.get(id, u.area);
    if (row) return ruleFromRow(row, base.minOutGapMinutes);
  }
  return base;
}
function isoWeekday(date) {
  const d = new Date(vnDayStart(date) + 7 * 36e5).getUTCDay();
  return d === 0 ? 7 : d;
}
function isHoliday(db, date) {
  return Boolean(db.prepare("SELECT 1 FROM holidays WHERE date = ?").get(date));
}
function isWorkday(db, rule, date) {
  return rule.workDays.includes(isoWeekday(date)) && !isHoliday(db, date);
}
function validateShiftInput(input) {
  if (!input || typeof input !== "object") throw new HttpError(400, "Thi\u1EBFu th\xF4ng tin ca");
  const b = input;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw new HttpError(400, "T\xEAn ca l\xE0 b\u1EAFt bu\u1ED9c");
  const s = {
    name,
    workStart: hhmm(b.workStart, "Gi\u1EDD v\xE0o"),
    workEnd: hhmm(b.workEnd, "Gi\u1EDD ra"),
    workDays: workDaysInput(b.workDays),
    lateGraceMinutes: intInRange(b.lateGraceMinutes, 0, 120, "Cho ph\xE9p \u0111i mu\u1ED9n"),
    earlyArrivalMinutes: intInRange(b.earlyArrivalMinutes, 0, 120, "Ng\u01B0\u1EE1ng \u0111i s\u1EDBm"),
    earlyLeaveMinutes: intInRange(b.earlyLeaveMinutes, 0, 120, "Cho ph\xE9p v\u1EC1 s\u1EDBm")
  };
  if (parseHHmm(s.workEnd) <= parseHHmm(s.workStart)) throw new HttpError(400, "Gi\u1EDD ra ph\u1EA3i sau gi\u1EDD v\xE0o");
  return s;
}
function mapShift(r) {
  return {
    id: r.id,
    areaId: r.area_id,
    areaName: r.area_name ?? null,
    name: r.name,
    workStart: r.work_start,
    workEnd: r.work_end,
    workDays: parseWorkDays(r.work_days),
    lateGraceMinutes: r.late_grace_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes,
    earlyLeaveMinutes: r.early_leave_minutes,
    departmentCount: Number(r.department_count),
    userCount: Number(r.user_count)
  };
}
function getShift(db, id) {
  const row = db.prepare(`${SHIFT_SELECT} WHERE s.id = ?`).get(id);
  return row ? mapShift(row) : null;
}
var DEFAULT_SHIFT_NAME, SHIFT_SELECT;
var init_shifts = __esm({
  "server/shifts.ts"() {
    init_errors();
    init_settings();
    init_vntime();
    DEFAULT_SHIFT_NAME = "Ca m\u1EB7c \u0111\u1ECBnh c\xF4ng ty";
    SHIFT_SELECT = `SELECT s.*, a.name AS area_name,
  (SELECT COUNT(*) FROM departments d WHERE d.shift_id = s.id) AS department_count,
  (SELECT COUNT(*) FROM users u WHERE u.shift_id = s.id) AS user_count
  FROM shifts s LEFT JOIN areas a ON a.id = s.area_id`;
  }
});

// server/attendance.ts
function computeDay(input) {
  const { detectionTs, settings, lateExcused, manualIn, manualOut, closed } = input;
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
  const earlyArrivalMinutes = inMin < settings.workStart - settings.earlyArrivalMinutes ? settings.workStart - inMin : 0;
  const outMin = lastOut === null ? null : vnMinutesOfDay(lastOut);
  const isEarly = closed && outMin !== null && outMin < settings.workEnd - settings.earlyLeaveMinutes;
  const earlyMinutes = isEarly ? settings.workEnd - outMin : 0;
  let status;
  if (lastOut === null) status = "missing_out";
  else if (isLate && isEarly) status = "late_and_early";
  else if (isLate) status = "late";
  else if (isEarly) status = "early_leave";
  else status = "on_time";
  return { firstIn, lastOut, lateMinutes, earlyMinutes, earlyArrivalMinutes, status, detectionCount: detectionTs.length, final: closed };
}
function shiftEndTs(rule, date) {
  return vnDayStart(date) + rule.workEnd * 6e4;
}
function approvedLeaveType(db, userId, date) {
  const r = db.prepare(
    `SELECT type FROM requests WHERE user_id = ? AND status = 'approved' AND type IN ('leave_request', 'business_trip')
       AND work_date <= ? AND COALESCE(end_date, work_date) >= ? ORDER BY created_at DESC LIMIT 1`
  ).get(userId, date, date);
  if (!r) return null;
  return r.type === "business_trip" ? "business_trip" : "leave";
}
function simulatorFilter() {
  return process.env.NODE_ENV === "production" ? " AND source != 'simulator'" : "";
}
function readAdjustment(db, userId, workDate) {
  const row = db.prepare("SELECT late_excused, manual_in, manual_out FROM attendance_days WHERE user_id = ? AND work_date = ?").get(userId, workDate);
  return { lateExcused: row?.late_excused === 1, manualIn: row?.manual_in ?? null, manualOut: row?.manual_out ?? null };
}
function saveDay(db, userId, workDate, adj, d) {
  db.prepare(
    `INSERT INTO attendance_days(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, work_date) DO UPDATE SET
       first_in = excluded.first_in, last_out = excluded.last_out, late_minutes = excluded.late_minutes,
       early_minutes = excluded.early_minutes, early_arrival_minutes = excluded.early_arrival_minutes, status = excluded.status,
       final = excluded.final, late_excused = excluded.late_excused, manual_in = excluded.manual_in, manual_out = excluded.manual_out,
       detection_count = excluded.detection_count`
  ).run(
    userId,
    workDate,
    d.firstIn,
    d.lastOut,
    d.lateMinutes,
    d.earlyMinutes,
    d.earlyArrivalMinutes,
    d.status,
    d.final ? 1 : 0,
    adj.lateExcused ? 1 : 0,
    adj.manualIn,
    adj.manualOut,
    d.detectionCount
  );
}
function writeDay(db, userId, workDate, adj, now) {
  const user = db.prepare("SELECT code, status, created_at FROM users WHERE id = ?").get(userId);
  if (!user) return;
  const rule = effectiveShift(db, userId);
  const closed = now >= shiftEndTs(rule, workDate);
  const eligible = user.status === "active" && user.code !== SYSTEM_ADMIN_CODE && workDate >= user.created_at.slice(0, 10);
  const workday = isWorkday(db, rule, workDate);
  const detections = db.prepare(`SELECT ts FROM detections WHERE user_id = ? AND work_date = ?${simulatorFilter()}`).all(userId, workDate);
  const computed = computeDay({
    detectionTs: detections.map((d) => d.ts),
    settings: rule,
    lateExcused: adj.lateExcused,
    manualIn: adj.manualIn,
    manualOut: adj.manualOut,
    closed
  });
  const leave = eligible && workday ? approvedLeaveType(db, userId, workDate) : null;
  if (leave) {
    saveDay(db, userId, workDate, adj, {
      firstIn: computed?.firstIn ?? null,
      lastOut: computed?.lastOut ?? null,
      lateMinutes: 0,
      earlyMinutes: 0,
      earlyArrivalMinutes: 0,
      status: leave,
      final: true,
      detectionCount: detections.length
    });
    return;
  }
  if (computed) {
    saveDay(db, userId, workDate, adj, computed);
    return;
  }
  if (eligible && workday && closed) {
    saveDay(db, userId, workDate, adj, {
      firstIn: null,
      lastOut: null,
      lateMinutes: 0,
      earlyMinutes: 0,
      earlyArrivalMinutes: 0,
      status: "absent",
      final: true,
      detectionCount: 0
    });
    return;
  }
  db.prepare("DELETE FROM attendance_days WHERE user_id = ? AND work_date = ?").run(userId, workDate);
}
function recomputeDay(db, userId, workDate, now = Date.now()) {
  writeDay(db, userId, workDate, readAdjustment(db, userId, workDate), now);
}
function applyDayAdjustment(db, userId, workDate, patch, now = Date.now()) {
  writeDay(db, userId, workDate, { ...readAdjustment(db, userId, workDate), ...patch }, now);
}
function recomputeUsers(db, userIds, from, to, now) {
  const span = daysBetween(from, to);
  if (span < 0 || userIds.length === 0) return 0;
  let n = 0;
  tx(db, () => {
    for (let i = 0; i <= span; i++) {
      const date = addDays(from, i);
      for (const id of userIds) {
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}
function recomputeRange(db, from, to, now = Date.now()) {
  const ids = db.prepare("SELECT id FROM users WHERE code != ?").all(SYSTEM_ADMIN_CODE).map((r) => r.id);
  return recomputeUsers(db, ids, from, to, now);
}
function monthToDate(now) {
  const to = toVnDate(now);
  return { from: `${to.slice(0, 8)}01`, to };
}
function closeDays(db, now) {
  const today = toVnDate(now);
  const users = db.prepare("SELECT id FROM users WHERE status = 'active' AND code != ?").all(SYSTEM_ADMIN_CODE).map((r) => r.id);
  const final = db.prepare("SELECT final FROM attendance_days WHERE user_id = ? AND work_date = ?");
  let n = 0;
  tx(db, () => {
    for (const date of [addDays(today, -1), today]) {
      for (const id of users) {
        const r = final.get(id, date);
        if (r?.final === 1) continue;
        if (now < shiftEndTs(effectiveShift(db, id), date)) continue;
        recomputeDay(db, id, date, now);
        n++;
      }
    }
  });
  return n;
}
var init_attendance = __esm({
  "server/attendance.ts"() {
    init_vntime();
    init_db();
    init_shifts();
    init_bootstrap();
  }
});

// server/hanet.ts
import { randomBytes as randomBytes4 } from "node:crypto";
function normalizeTs(raw, now) {
  if (raw === null || raw <= 0) return { ts: now, fromServer: true };
  return { ts: raw < 1e12 ? Math.round(raw * 1e3) : raw, fromServer: false };
}
function parseCheckin(body, now) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const d = b.data && typeof b.data === "object" ? b.data : b;
  const deviceId = str(d.deviceID);
  const aliasId = str(d.aliasID);
  const personId = str(d.personID);
  if (!deviceId || !aliasId && !personId) return null;
  const { ts, fromServer } = normalizeTs(num(d.time ?? d.checkinTime), now);
  return {
    input: {
      personId,
      aliasId,
      personName: str(d.personName),
      personType: num(d.personType ?? d.type),
      deviceId,
      deviceName: str(d.deviceName),
      placeId: num(d.placeID),
      ts,
      imageUrl: str(d.detected_image_url ?? d.avatar)
    },
    note: fromServer ? "Thi\u1EBFu th\u1EDDi gian t\u1EEB Camera AI, d\xF9ng gi\u1EDD nh\u1EADn" : null
  };
}
function parseStranger(body, now) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const d = b.data && typeof b.data === "object" ? b.data : b;
  const deviceId = str(d.deviceID);
  const imageUrl = str(d.detected_image_url);
  if (num(d.personType) !== 2 || !deviceId || !imageUrl) return null;
  return { deviceId, deviceName: str(d.deviceName), ts: normalizeTs(num(d.time), now).ts, imageUrl };
}
function ingestCheckin(db, input, source) {
  if (input.personType !== null && input.personType !== 0) return { status: "ignored", message: "Kh\xF4ng ph\u1EA3i nh\xE2n vi\xEAn" };
  let user;
  const alias = input.aliasId?.toUpperCase();
  if (alias && alias !== SYSTEM_ADMIN_CODE) user = db.prepare("SELECT id, status FROM users WHERE code = ?").get(alias);
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
function getWebhookToken(db) {
  return getSetting(db, WEBHOOK_TOKEN_KEY) ?? rotateWebhookToken(db);
}
function rotateWebhookToken(db) {
  const token = randomBytes4(24).toString("base64url");
  setSetting(db, WEBHOOK_TOKEN_KEY, token);
  return token;
}
function mask(v) {
  return v ? `\u2022\u2022\u2022\u2022${v.slice(-4)}` : "";
}
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
var str, num, STRANGER_MESSAGE, UNMATCHED_MESSAGE, WEBHOOK_LOG_LIMIT, WEBHOOK_TOKEN_KEY, HANET_DEFAULT_API_BASE, TEXT_FIELDS;
var init_hanet = __esm({
  "server/hanet.ts"() {
    init_db();
    init_attendance();
    init_settings();
    init_vntime();
    init_bootstrap();
    str = (v) => v === void 0 || v === null || String(v).trim() === "" ? null : String(v).trim();
    num = (v) => {
      const s = str(v);
      if (s === null) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };
    STRANGER_MESSAGE = "Ng\u01B0\u1EDDi l\u1EA1";
    UNMATCHED_MESSAGE = "Kh\xF4ng kh\u1EDBp nh\xE2n vi\xEAn n\xE0o";
    WEBHOOK_LOG_LIMIT = 500;
    WEBHOOK_TOKEN_KEY = "hanet.webhook_token";
    HANET_DEFAULT_API_BASE = "https://partner.hanet.ai";
    TEXT_FIELDS = [
      ["clientId", "hanet.client_id"],
      ["clientSecret", "hanet.client_secret"],
      ["accessToken", "hanet.access_token"],
      ["refreshToken", "hanet.refresh_token"],
      ["apiBase", "hanet.api_base"]
    ];
  }
});

// server/hanet-api.ts
function describeHanetError(code) {
  return HANET_ERROR_TEXT[code] ?? null;
}
function isTransientError(err) {
  return err instanceof HanetApiError ? err.transient : true;
}
async function postForm(deps, url, params) {
  const res = await deps.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(HANET_TIMEOUT_MS)
  });
  if (!res.ok) throw new HanetApiError(res.status, `HTTP ${res.status} t\u1EEB ${url}`, res.status >= 500 || res.status === 429);
  try {
    return await res.json();
  } catch {
    throw new HanetApiError(0, `Camera AI tr\u1EA3 d\u1EEF li\u1EC7u kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c t\u1EEB ${url}`, true);
  }
}
async function doRefresh(deps) {
  const { db } = deps;
  const refreshToken = getSetting(db, "hanet.refresh_token");
  const clientId = getSetting(db, "hanet.client_id");
  const clientSecret = getSetting(db, "hanet.client_secret");
  if (!refreshToken || !clientId || !clientSecret) throw refreshFailed("thi\u1EBFu Client ID, Client Secret ho\u1EB7c Refresh Token");
  let body;
  try {
    body = await postForm(deps, OAUTH_TOKEN_URL, {
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    });
  } catch (err) {
    throw refreshFailed(`l\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i: ${err.message}`, err instanceof HanetApiError ? err.returnCode : 0);
  }
  const token = body?.access_token;
  if (typeof token !== "string" || !token) {
    throw refreshFailed(`l\xE0m m\u1EDBi token th\u1EA5t b\u1EA1i: ${body?.returnMessage ?? body?.error ?? "kh\xF4ng r\xF5 l\xFD do"}`, Number(body?.returnCode ?? 0));
  }
  setSetting(db, "hanet.access_token", token);
  if (typeof body.refresh_token === "string" && body.refresh_token) setSetting(db, "hanet.refresh_token", body.refresh_token);
  return token;
}
function refreshAccessToken(deps) {
  const pending = refreshing.get(deps.db);
  if (pending) return pending;
  const p = doRefresh(deps).finally(() => refreshing.delete(deps.db));
  refreshing.set(deps.db, p);
  return p;
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
  if (code !== 1) {
    const text2 = describeHanetError(code);
    throw new HanetApiError(code, text2 ? `${text2} (m\xE3 ${code})` : `Camera AI tr\u1EA3 l\u1ED7i ${code}: ${body?.returnMessage ?? ""}`);
  }
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
var HANET_TIMEOUT_MS, PERMANENT_CODES, HANET_ERROR_TEXT, HanetApiError, OAUTH_TOKEN_URL, PAGE_SIZE, TOKEN_EXPIRED, MAX_PAGES, REFRESH_FAILED, refreshFailed, refreshing, arr, hanetApi;
var init_hanet_api = __esm({
  "server/hanet-api.ts"() {
    init_settings();
    init_hanet();
    init_vntime();
    HANET_TIMEOUT_MS = 15e3;
    PERMANENT_CODES = /* @__PURE__ */ new Set([-1, -2035, -1005, -101, -5011, -9005, -9006, -9007, -9008, -5010, -909, -9002]);
    HANET_ERROR_TEXT = {
      [-1]: "D\u1EEF li\u1EC7u g\u1EEDi Camera AI kh\xF4ng h\u1EE3p l\u1EC7",
      [-103]: "Token Camera AI h\u1EBFt h\u1EA1n",
      [-2035]: "T\xE0i kho\u1EA3n Camera AI kh\xF4ng c\xF3 quy\u1EC1n v\u1EDBi \u0111\u1ECBa \u0111i\u1EC3m ho\u1EB7c thi\u1EBFt b\u1ECB n\xE0y",
      [-503]: "H\u1EC7 th\u1ED1ng Camera AI \u0111ang l\u1ED7i",
      [-101]: "Kh\xF4ng t\xECm th\u1EA5y thi\u1EBFt b\u1ECB tr\xEAn Camera AI",
      [-102]: "Thi\u1EBFt b\u1ECB \u0111ang offline",
      [-1005]: "Kh\xF4ng t\xECm th\u1EA5y \u0111\u1ECBa \u0111i\u1EC3m tr\xEAn Camera AI",
      [-5011]: "Kh\xF4ng t\xECm th\u1EA5y ng\u01B0\u1EDDi n\xE0y tr\xEAn Camera AI",
      [-9005]: "Ng\u01B0\u1EDDi n\xE0y \u0111\xE3 c\xF3 tr\xEAn Camera AI",
      [-9006]: "\u1EA2nh kh\xF4ng \u0111\u1EA1t: c\u1EA7n r\xF5 m\u1EB7t, m\u1ED9t ng\u01B0\u1EDDi, nh\xECn th\u1EB3ng, kh\xF4ng m\u0169, kh\xF4ng kh\u1EA9u trang",
      [-9007]: "\u1EA2nh tr\xF9ng v\u1EDBi ng\u01B0\u1EDDi \u0111\xE3 \u0111\u0103ng k\xFD",
      [-9008]: "\u0110\u1ECBa \u0111i\u1EC3m \u0111\xE3 h\u1EBFt s\u1ED1 khu\xF4n m\u1EB7t mi\u1EC5n ph\xED, c\u1EA7n mua g\xF3i cloud Camera AI",
      [-5010]: "\u1EA2nh kh\xF4ng h\u1EE3p l\u1EC7",
      [-909]: "T\u1EA3i \u1EA3nh l\xEAn Camera AI th\u1EA5t b\u1EA1i",
      [-9002]: "\u0110\u1ECBnh d\u1EA1ng \u1EA3nh kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3"
    };
    HanetApiError = class extends Error {
      constructor(returnCode, message, transient = !PERMANENT_CODES.has(returnCode)) {
        super(message);
        this.returnCode = returnCode;
        this.transient = transient;
      }
    };
    OAUTH_TOKEN_URL = "https://oauth.hanet.com/token";
    PAGE_SIZE = 500;
    TOKEN_EXPIRED = -103;
    MAX_PAGES = 200;
    REFRESH_FAILED = "K\u1EBFt n\u1ED1i Camera AI h\u1ECFng, ki\u1EC3m tra Client ID/Secret/Refresh Token";
    refreshFailed = (detail, code = 0) => new HanetApiError(code, `${REFRESH_FAILED} (${detail})`, true);
    refreshing = /* @__PURE__ */ new WeakMap();
    arr = (v) => Array.isArray(v) ? v : [];
    hanetApi = {
      async getProfile(deps) {
        const d = (await callApi(deps, "/profile/getProfile", {})).data ?? {};
        return { name: String(d.name ?? ""), email: String(d.email ?? "") };
      },
      async getPlaces(deps) {
        return arr((await callApi(deps, "/place/getPlaces", {})).data).map((p) => ({
          id: Number(p.id),
          name: String(p.name ?? ""),
          address: String(p.address ?? "")
        }));
      },
      async listDevices(deps, placeId) {
        return arr((await callApi(deps, "/device/getListDeviceByPlace", { placeID: String(placeId) })).data);
      },
      async connectionStatus(deps, deviceIds) {
        if (deviceIds.length === 0) return {};
        const d = (await callApi(deps, "/device/getConnectionStatus", { deviceIDs: deviceIds.join(",") })).data;
        return d && typeof d === "object" && !Array.isArray(d) ? d : {};
      },
      async updateDevice(deps, deviceId, name) {
        await callApi(deps, "/device/updateDevice", { deviceID: deviceId, deviceName: name });
      },
      async listPersons(deps, placeId, page, size) {
        return arr(
          (await callApi(deps, "/person/getListByPlace", { placeID: String(placeId), type: "0", page: String(page), size: String(size) })).data
        );
      },
      async personsByAlias(deps, aliasId) {
        return arr((await callApi(deps, "/person/getUserInfoByAliasID", { aliasID: aliasId })).data);
      },
      async registerByUrl(deps, p) {
        const d = (await callApi(deps, "/person/registerByUrl", {
          name: p.name,
          aliasID: p.aliasId,
          placeID: String(p.placeId),
          url: p.url,
          title: p.title,
          type: "0"
        })).data;
        return d?.personID ? String(d.personID) : null;
      },
      async updateFaceByUrl(deps, p) {
        await callApi(deps, "/person/updateByFaceUrlByAliasID", { aliasID: p.aliasId, placeID: String(p.placeId), url: p.url });
      },
      async updateInfo(deps, p) {
        await callApi(deps, "/person/updateInfo", { aliasID: p.aliasId, placeID: String(p.placeId), name: p.name, title: p.title });
      },
      async updateAliasId(deps, personId, aliasId) {
        await callApi(deps, "/person/updateAliasID", { personID: personId, aliasID: aliasId });
      },
      async removeByPlace(deps, aliasId, placeId) {
        await callApi(deps, "/person/removeByPlace", { aliasID: aliasId, placeID: String(placeId) });
      },
      async removeById(deps, personId) {
        await callApi(deps, "/person/removePersonByID", { personID: personId });
      },
      async listDepartments(deps, placeId, keyword) {
        const d = (await callApi(deps, "/department/list", { placeID: String(placeId), keyword, page: "1", size: "50" })).data;
        return arr(d?.hits).map((h) => ({ id: Number(h.id), name: String(h.name ?? "") }));
      },
      async createDepartment(deps, placeId, name, desc) {
        const d = (await callApi(deps, "/department/create", { placeID: String(placeId), name, desc })).data;
        const id = Number(d?.id);
        if (!Number.isInteger(id) || id <= 0) throw new HanetApiError(0, "Camera AI kh\xF4ng tr\u1EA3 ID ph\xF2ng ban v\u1EEBa t\u1EA1o");
        return id;
      },
      async updateDepartment(deps, id, name, desc) {
        await callApi(deps, "/department/update", { id: String(id), name, desc });
      },
      async removeDepartment(deps, id) {
        await callApi(deps, "/department/remove", { id: String(id) });
      },
      async addPersonsToDepartment(deps, deptId, personIds) {
        await callApi(deps, "/department/add-person", { departmentID: String(deptId), personIDs: personIds.join(",") });
      },
      async removePersonFromDepartment(deps, deptId, personId) {
        await callApi(deps, "/department/remove-person", { departmentID: String(deptId), personID: personId });
      }
    };
  }
});

// server/sync-handlers.ts
var sync_handlers_exports = {};
__export(sync_handlers_exports, {
  SYNC_HANDLERS: () => SYNC_HANDLERS
});
function placeOf(deps) {
  const id = getPlaceIds(deps.db)[0];
  if (!id) throw new SyncDeferred("Ch\u01B0a ch\u1ECDn \u0111\u1ECBa \u0111i\u1EC3m Camera AI");
  return id;
}
async function ignoreNotFound(fn) {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof HanetApiError) || err.returnCode !== -5011) throw err;
  }
}
var userRow, deptRow, norm, SYNC_HANDLERS;
var init_sync_handlers = __esm({
  "server/sync-handlers.ts"() {
    init_hanet_api();
    init_hanet_sync();
    init_hanet();
    userRow = (deps, id) => deps.db.prepare("SELECT code, name, position, hanet_person_id, face_registered FROM users WHERE id = ?").get(id);
    deptRow = (deps, id) => deps.db.prepare("SELECT name, description, hanet_department_id FROM departments WHERE id = ?").get(id);
    norm = (s) => s.trim().toLocaleLowerCase("vi");
    SYNC_HANDLERS = {
      "camera.rename": async (deps, job) => {
        if (!deps.db.prepare("SELECT 1 FROM cameras WHERE id = ?").get(job.entityId)) return;
        await hanetApi.updateDevice(deps, String(job.payload.deviceId), String(job.payload.name));
      },
      "user.alias": async (deps, job) => {
        if (!userRow(deps, job.entityId)) return;
        await hanetApi.updateAliasId(deps, String(job.payload.personId), String(job.payload.code));
      },
      "user.info": async (deps, job) => {
        const u = userRow(deps, job.entityId);
        if (!u || u.face_registered !== 1) return;
        await hanetApi.updateInfo(deps, { aliasId: u.code, placeId: placeOf(deps), name: u.name, title: u.position ?? "" });
      },
      "user.department": async (deps, job) => {
        const u = userRow(deps, job.entityId);
        if (!u) return;
        const personId = u.hanet_person_id;
        if (!personId) throw new SyncDeferred("Ch\u1EDD \u0111\u0103ng k\xFD FaceID");
        let toHanet = null;
        const toId = job.payload.toDepartmentId;
        if (toId) {
          const d = deptRow(deps, toId);
          if (d) {
            if (!d.hanet_department_id) throw new SyncDeferred("Ch\u1EDD ph\xF2ng ban \u0111\u1ED3ng b\u1ED9 l\xEAn Camera AI");
            toHanet = Number(d.hanet_department_id);
          }
        }
        const fromHanet = job.payload.fromHanetDeptId ? Number(job.payload.fromHanetDeptId) : null;
        if (fromHanet && fromHanet !== toHanet) await ignoreNotFound(() => hanetApi.removePersonFromDepartment(deps, fromHanet, personId));
        if (toHanet) await hanetApi.addPersonsToDepartment(deps, toHanet, [personId]);
      },
      "user.remove": async (deps, job) => {
        if (job.payload.personId) {
          await ignoreNotFound(() => hanetApi.removeById(deps, String(job.payload.personId)));
          return;
        }
        await hanetApi.removeByPlace(deps, String(job.payload.code), placeOf(deps));
      },
      "dept.create": async (deps, job) => {
        const d = deptRow(deps, job.entityId);
        if (!d || d.hanet_department_id) return;
        const placeId = placeOf(deps);
        const same = (await hanetApi.listDepartments(deps, placeId, d.name.trim())).find((h) => norm(h.name) === norm(d.name));
        const hanetId = same ? same.id : await hanetApi.createDepartment(deps, placeId, d.name, d.description ?? "");
        deps.db.prepare("UPDATE departments SET hanet_department_id = ? WHERE id = ?").run(String(hanetId), job.entityId);
        wakeOp(deps.db, "user.department", deps.now());
      },
      "dept.update": async (deps, job) => {
        const d = deptRow(deps, job.entityId);
        if (!d) return;
        if (!d.hanet_department_id) throw new SyncDeferred("Ch\u1EDD t\u1EA1o ph\xF2ng ban tr\xEAn Camera AI");
        await hanetApi.updateDepartment(deps, Number(d.hanet_department_id), d.name, d.description ?? "");
      },
      "dept.remove": async (deps, job) => {
        await ignoreNotFound(() => hanetApi.removeDepartment(deps, Number(job.payload.hanetDepartmentId)));
      }
    };
  }
});

// server/hanet-sync.ts
function retryDelayMs(attempts) {
  return (RETRY_DELAYS_MIN[attempts - 1] ?? RETRY_LATER_MIN) * 6e4;
}
function claimSet(db) {
  let s = claimed.get(db);
  if (!s) {
    s = /* @__PURE__ */ new Set();
    claimed.set(db, s);
  }
  return s;
}
function refreshEntityStatus(db, entityType, entityId) {
  const table = STATUS_TABLE[entityType];
  if (!table) return;
  const c = db.prepare(
    `SELECT SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p
       FROM sync_jobs WHERE entity_type = ? AND entity_id = ?`
  ).get(entityType, entityId);
  const status = Number(c.e ?? 0) > 0 ? "error" : Number(c.p ?? 0) > 0 ? "pending" : "synced";
  const last = db.prepare(
    `SELECT last_error FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error') AND last_error IS NOT NULL
       ORDER BY updated_at DESC, id DESC LIMIT 1`
  ).get(entityType, entityId);
  db.prepare(`UPDATE ${table} SET hanet_sync_status = ?, hanet_sync_error = ? WHERE id = ?`).run(
    status,
    status === "synced" ? null : last?.last_error ?? null,
    entityId
  );
}
function enqueue(db, entityType, entityId, op, payload, now) {
  tx(db, () => {
    if (REMOVE.has(op)) dropEntityJobs(db, entityType, entityId);
    if (COALESCE.has(op)) {
      const busy = [...claimSet(db)];
      const notBusy = busy.length ? ` AND id NOT IN (${busy.map(() => "?").join(", ")})` : "";
      const r = db.prepare(
        `UPDATE sync_jobs SET payload = ?, updated_at = ?
           WHERE entity_type = ? AND entity_id = ? AND op = ? AND status = 'pending' AND attempts = 0${notBusy}`
      ).run(JSON.stringify(payload), now, entityType, entityId, op, ...busy);
      if (Number(r.changes) > 0) {
        refreshEntityStatus(db, entityType, entityId);
        return;
      }
    }
    db.prepare(
      `INSERT INTO sync_jobs(entity_type, entity_id, op, payload, status, attempts, next_run_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?)`
    ).run(entityType, entityId, op, JSON.stringify(payload), now, now, now);
    refreshEntityStatus(db, entityType, entityId);
  });
}
function dropEntityJobs(db, entityType, entityId) {
  const busy = [...claimSet(db)];
  const notBusy = busy.length ? ` AND id NOT IN (${busy.map(() => "?").join(", ")})` : "";
  db.prepare(`DELETE FROM sync_jobs WHERE entity_type = ? AND entity_id = ? AND status IN ('pending', 'error')${notBusy}`).run(
    entityType,
    entityId,
    ...busy
  );
}
function wakeEntity(db, entityType, entityId, now) {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE entity_type = ? AND entity_id = ? AND status = 'pending'").run(now, entityType, entityId);
}
function wakeOp(db, op, now) {
  db.prepare("UPDATE sync_jobs SET next_run_at = ? WHERE op = ? AND status = 'pending'").run(now, op);
}
function toJob(r) {
  return { id: r.id, entityType: r.entity_type, entityId: r.entity_id, op: r.op, payload: JSON.parse(r.payload), attempts: r.attempts };
}
async function runJob(deps, handlers, job) {
  const { db } = deps;
  let result;
  try {
    const handler = handlers[job.op];
    if (!handler) throw Object.assign(new Error(`Ch\u01B0a h\u1ED7 tr\u1EE3 thao t\xE1c ${job.op}`), { permanent: true });
    await handler(deps, job);
    db.prepare("UPDATE sync_jobs SET status = 'done', last_error = NULL, updated_at = ? WHERE id = ?").run(deps.now(), job.id);
    result = "done";
  } catch (err) {
    const now = deps.now();
    const message = err.message;
    if (err instanceof SyncDeferred) {
      db.prepare("UPDATE sync_jobs SET next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(now + DEFER_MS, message, now, job.id);
      result = "deferred";
    } else {
      const attempts = job.attempts + 1;
      const permanent = Boolean(err.permanent) || !isTransientError(err);
      if (permanent || attempts >= MAX_ATTEMPTS) {
        db.prepare("UPDATE sync_jobs SET status = 'error', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?").run(attempts, message, now, job.id);
      } else {
        db.prepare("UPDATE sync_jobs SET attempts = ?, next_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?").run(
          attempts,
          now + retryDelayMs(attempts),
          message,
          now,
          job.id
        );
      }
      const code = err instanceof HanetApiError ? err.returnCode : "network";
      console.warn(`[SYNC] op=${job.op} entity=${job.entityType}:${job.entityId} code=${code}`);
      result = "failed";
    }
  }
  refreshEntityStatus(db, job.entityType, job.entityId);
  return result;
}
async function runClaimed(deps, handlers, row) {
  const claims = claimSet(deps.db);
  if (claims.has(row.id)) return null;
  claims.add(row.id);
  try {
    const fresh = deps.db.prepare(`${HEAD_SQL} AND j.id = ?`).get(deps.now(), row.id);
    if (!fresh) return null;
    return await runJob(deps, handlers, toJob(fresh));
  } finally {
    claims.delete(row.id);
  }
}
async function runDueJobs(deps, handlers, limit = RUN_LIMIT) {
  const out = { done: 0, failed: 0, deferred: 0 };
  if (!reconcileEnabled(deps.db)) return out;
  const rows = deps.db.prepare(`${HEAD_SQL} ORDER BY j.id LIMIT ?`).all(deps.now(), limit);
  for (const row of rows) {
    const r = await runClaimed(deps, handlers, row);
    if (r) out[r]++;
  }
  return out;
}
async function runEntityJobs(deps, handlers, entityType, entityId) {
  if (!reconcileEnabled(deps.db)) return;
  for (let i = 0; i < 10; i++) {
    const row = deps.db.prepare(`${HEAD_SQL} AND j.entity_type = ? AND j.entity_id = ? LIMIT 1`).get(deps.now(), entityType, entityId);
    if (!row || await runClaimed(deps, handlers, row) !== "done") return;
  }
}
function depsOf(ctx) {
  return { db: ctx.db, fetch: ctx.fetch, now: ctx.now };
}
function kickEntity(ctx, entityType, entityId) {
  if (!ctx.config.kickSync) return;
  void Promise.resolve().then(() => (init_sync_handlers(), sync_handlers_exports)).then(({ SYNC_HANDLERS: SYNC_HANDLERS2 }) => runEntityJobs(depsOf(ctx), SYNC_HANDLERS2, entityType, entityId)).catch((err) => console.error("[SYNC] l\u1ED7i ch\u1EA1y ngay:", err.message));
}
function kickAll(ctx) {
  if (!ctx.config.kickSync) return;
  void Promise.resolve().then(() => (init_sync_handlers(), sync_handlers_exports)).then(({ SYNC_HANDLERS: SYNC_HANDLERS2 }) => runDueJobs(depsOf(ctx), SYNC_HANDLERS2)).catch((err) => console.error("[SYNC] l\u1ED7i ch\u1EA1y h\xE0ng \u0111\u1EE3i:", err.message));
}
function retryJobs(db, filter, now) {
  const where = ["status = 'error'"];
  const params = [];
  if (filter.jobId !== void 0) {
    where.push("id = ?");
    params.push(filter.jobId);
  }
  if (filter.entityType && filter.entityId) {
    where.push("entity_type = ? AND entity_id = ?");
    params.push(filter.entityType, filter.entityId);
  }
  const affected = db.prepare(`SELECT DISTINCT entity_type, entity_id FROM sync_jobs WHERE ${where.join(" AND ")}`).all(...params);
  const r = db.prepare(`UPDATE sync_jobs SET status = 'pending', attempts = 0, next_run_at = ?, updated_at = ? WHERE ${where.join(" AND ")}`).run(now, now, ...params);
  for (const a of affected) refreshEntityStatus(db, a.entity_type, a.entity_id);
  return Number(r.changes);
}
function labelOf(db, type, id, payload) {
  if (type === "user") {
    const u = db.prepare("SELECT name, code FROM users WHERE id = ?").get(id);
    if (u) return `${u.name} (${u.code})`;
  } else {
    const row = db.prepare(`SELECT name FROM ${type === "department" ? "departments" : "cameras"} WHERE id = ?`).get(id);
    if (row) return row.name;
  }
  return String(payload.name ?? payload.code ?? id);
}
function syncSummary(db) {
  const c = db.prepare(
    `SELECT SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS p, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS e FROM sync_jobs`
  ).get();
  const rows = db.prepare("SELECT * FROM sync_jobs WHERE status = 'error' ORDER BY updated_at DESC, id DESC LIMIT 50").all();
  const errors = rows.map((r) => {
    const payload = JSON.parse(r.payload);
    return {
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      op: r.op,
      label: labelOf(db, r.entity_type, r.entity_id, payload),
      attempts: r.attempts,
      lastError: r.last_error ?? null,
      updatedAt: r.updated_at
    };
  });
  return { pending: Number(c.p ?? 0), error: Number(c.e ?? 0), errors };
}
function purgeDoneJobs(db, now) {
  return Number(db.prepare("DELETE FROM sync_jobs WHERE status = 'done' AND updated_at < ?").run(now - DONE_TTL_MS).changes);
}
var SyncDeferred, RETRY_DELAYS_MIN, RETRY_LATER_MIN, MAX_ATTEMPTS, DEFER_MS, DONE_TTL_MS, RUN_LIMIT, COALESCE, REMOVE, STATUS_TABLE, claimed, HEAD_SQL;
var init_hanet_sync = __esm({
  "server/hanet-sync.ts"() {
    init_db();
    init_hanet_api();
    init_hanet();
    SyncDeferred = class extends Error {
    };
    RETRY_DELAYS_MIN = [1, 2, 5, 15];
    RETRY_LATER_MIN = 60;
    MAX_ATTEMPTS = 20;
    DEFER_MS = 5 * 6e4;
    DONE_TTL_MS = 7 * 24 * 60 * 6e4;
    RUN_LIMIT = 50;
    COALESCE = /* @__PURE__ */ new Set(["user.info", "dept.update", "camera.rename"]);
    REMOVE = /* @__PURE__ */ new Set(["user.remove", "dept.remove"]);
    STATUS_TABLE = { user: "users", department: "departments" };
    claimed = /* @__PURE__ */ new WeakMap();
    HEAD_SQL = `SELECT j.* FROM sync_jobs j
  WHERE j.status = 'pending' AND j.next_run_at <= ?
    AND j.id = (SELECT MIN(k.id) FROM sync_jobs k WHERE k.entity_type = j.entity_type AND k.entity_id = j.entity_id AND k.status IN ('pending', 'error'))`;
  }
});

// server/check-node.ts
var [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || major === 22 && minor < 13) {
  console.error(`[STARTUP] C\u1EA7n Node.js >= 22.13 (\u0111ang ch\u1EA1y ${process.versions.node}). H\xE3y n\xE2ng c\u1EA5p Node r\u1ED3i ch\u1EA1y l\u1EA1i.`);
  process.exit(1);
}

// server/index.ts
init_db();
init_migrations();
import "dotenv/config";
import path3 from "node:path";
import express2 from "express";

// server/app.ts
init_errors();
import express from "express";

// server/middleware.ts
init_auth();
init_errors();
init_bootstrap();
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
init_errors();
import { Router as Router2 } from "express";
init_auth();

// server/accounts.ts
init_errors();
init_auth();
import { randomBytes as randomBytes3 } from "node:crypto";
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var RESET_TTL_MS = 30 * 6e4;
function parseEmail(v) {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!email) throw new HttpError(400, "Email l\xE0 b\u1EAFt bu\u1ED9c");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Email kh\xF4ng h\u1EE3p l\u1EC7");
  return email;
}
function parsePhone(v) {
  const raw = typeof v === "string" ? v.replace(/[\s.\-()]/g, "") : "";
  if (!raw) throw new HttpError(400, "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i l\xE0 b\u1EAFt bu\u1ED9c");
  const phone = /^\+84\d{9}$/.test(raw) ? `0${raw.slice(3)}` : raw;
  if (!/^0\d{9}$/.test(phone)) throw new HttpError(400, "S\u1ED1 \u0111i\u1EC7n tho\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7 (10 ch\u1EEF s\u1ED1, b\u1EAFt \u0111\u1EA7u b\u1EB1ng 0 ho\u1EB7c +84)");
  return phone;
}
function assertEmailFree(db, email, userId) {
  const holder = db.prepare("SELECT id FROM users WHERE email != '' AND lower(email) = ?").get(email.toLowerCase());
  if (holder && holder.id !== userId) throw new HttpError(409, "Email \u0111\xE3 \u0111\u01B0\u1EE3c d\xF9ng cho nh\xE2n s\u1EF1 kh\xE1c");
}
function findLoginUser(db, login) {
  const s = login.trim();
  if (!s) return void 0;
  const sql = "SELECT id, code, email, password_hash, status FROM users WHERE ";
  return s.includes("@") ? db.prepare(`${sql} email != '' AND lower(email) = ?`).get(s.toLowerCase()) : db.prepare(`${sql} code = ?`).get(s.toUpperCase());
}
function createResetToken(db, userId, now) {
  const token = randomBytes3(32).toString("base64url");
  db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(userId);
  db.prepare("INSERT INTO password_resets(token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, now + RESET_TTL_MS);
  return token;
}
function consumeResetToken(db, token, now) {
  const row = db.prepare("SELECT user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(sha256(token), now);
  if (!row) return null;
  db.prepare("UPDATE password_resets SET used_at = ? WHERE token_hash = ?").run(now, sha256(token));
  return row.user_id;
}

// server/mail-queue.ts
init_auth();

// server/mail.ts
init_settings();
init_errors();
init_vntime();
import nodemailer from "nodemailer";
var MailError = class extends Error {
  constructor(message, permanent, code) {
    super(message);
    this.permanent = permanent;
    this.code = code;
  }
};
var DEFAULT_DAILY_LIMIT = 450;
var K = {
  host: "mail.host",
  port: "mail.port",
  secure: "mail.secure",
  user: "mail.user",
  password: "mail.password",
  fromName: "mail.from_name",
  fromEmail: "mail.from_email",
  appUrl: "mail.app_url",
  dailyLimit: "mail.daily_limit"
};
var EMAIL_RE2 = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function getSmtpConfig(db) {
  const host = getSetting(db, K.host);
  const user = getSetting(db, K.user);
  const password = getSetting(db, K.password);
  const fromEmail = getSetting(db, K.fromEmail);
  if (!host || !user || !password || !fromEmail) return null;
  return {
    host,
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? "ssl") === "ssl",
    user,
    password,
    fromName: getSetting(db, K.fromName) ?? "Petrolimex Attendance",
    fromEmail
  };
}
function getAppUrl(db) {
  return getSetting(db, K.appUrl) || null;
}
function getDailyLimit(db) {
  return Number(getSetting(db, K.dailyLimit) ?? DEFAULT_DAILY_LIMIT);
}
function getMailConfigView(db, now) {
  const dayStart = vnDayStart(toVnDate(now));
  const count = (sql, ...p) => db.prepare(sql).get(...p).c;
  return {
    host: getSetting(db, K.host) ?? "",
    port: Number(getSetting(db, K.port) ?? 465),
    secure: (getSetting(db, K.secure) ?? "ssl") === "starttls" ? "starttls" : "ssl",
    user: getSetting(db, K.user) ?? "",
    hasPassword: Boolean(getSetting(db, K.password)),
    fromName: getSetting(db, K.fromName) ?? "Petrolimex Attendance",
    fromEmail: getSetting(db, K.fromEmail) ?? "",
    appUrl: getSetting(db, K.appUrl) ?? "",
    dailyLimit: getDailyLimit(db),
    configured: getSmtpConfig(db) !== null,
    sentToday: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?", dayStart),
    pending: count("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'pending'")
  };
}
function saveMailConfig(db, input) {
  const b = input ?? {};
  const text2 = (v) => typeof v === "string" ? v.trim() : "";
  const host = text2(b.host);
  const user = text2(b.user);
  const fromEmail = text2(b.fromEmail).toLowerCase();
  const fromName = text2(b.fromName) || "Petrolimex Attendance";
  const appUrl = text2(b.appUrl).replace(/\/+$/, "");
  const port = Number(b.port);
  const dailyLimit = Number(b.dailyLimit ?? DEFAULT_DAILY_LIMIT);
  if (!host) throw new HttpError(400, "M\xE1y ch\u1EE7 SMTP l\xE0 b\u1EAFt bu\u1ED9c");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, "C\u1ED5ng SMTP kh\xF4ng h\u1EE3p l\u1EC7");
  if (b.secure !== "ssl" && b.secure !== "starttls") throw new HttpError(400, "Ki\u1EC3u b\u1EA3o m\u1EADt ph\u1EA3i l\xE0 SSL/TLS ho\u1EB7c STARTTLS");
  if (!user) throw new HttpError(400, "T\xE0i kho\u1EA3n SMTP l\xE0 b\u1EAFt bu\u1ED9c");
  if (!EMAIL_RE2.test(fromEmail)) throw new HttpError(400, "Email ng\u01B0\u1EDDi g\u1EEDi kh\xF4ng h\u1EE3p l\u1EC7");
  if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(appUrl)) throw new HttpError(400, "\u0110\u1ECBa ch\u1EC9 web ph\u1EA3i b\u1EAFt \u0111\u1EA7u b\u1EB1ng http:// ho\u1EB7c https://");
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 1e4) throw new HttpError(400, "H\u1EA1n m\u1EE9c th\u01B0 m\u1ED7i ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7");
  setSetting(db, K.host, host);
  setSetting(db, K.port, String(port));
  setSetting(db, K.secure, b.secure);
  setSetting(db, K.user, user);
  if (typeof b.password === "string" && b.password !== "") setSetting(db, K.password, b.password);
  setSetting(db, K.fromName, fromName);
  setSetting(db, K.fromEmail, fromEmail);
  setSetting(db, K.appUrl, appUrl);
  setSetting(db, K.dailyLimit, String(dailyLimit));
}
function classifyMailError(err) {
  if (err instanceof MailError) return err;
  const e = err ?? {};
  if (e.code === "EAUTH") return new MailError("Sai t\xE0i kho\u1EA3n ho\u1EB7c m\u1EADt kh\u1EA9u g\u1EEDi th\u01B0 (SMTP)", true, "EAUTH");
  if (e.code === "EENVELOPE") return new MailError("\u0110\u1ECBa ch\u1EC9 email ng\u01B0\u1EDDi nh\u1EADn kh\xF4ng h\u1EE3p l\u1EC7", true, "EENVELOPE");
  if (typeof e.responseCode === "number" && e.responseCode >= 500) return new MailError(`M\xE1y ch\u1EE7 th\u01B0 t\u1EEB ch\u1ED1i (${e.responseCode})`, true, String(e.responseCode));
  return new MailError("Kh\xF4ng k\u1EBFt n\u1ED1i \u0111\u01B0\u1EE3c m\xE1y ch\u1EE7 g\u1EEDi th\u01B0, s\u1EBD th\u1EED l\u1EA1i", false, e.code ?? "ENET");
}
var nodemailerSend = async (cfg, msg) => {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: 15e3,
    greetingTimeout: 15e3,
    socketTimeout: 3e4
  });
  try {
    await transport.sendMail({ from: { name: cfg.fromName, address: cfg.fromEmail }, to: msg.to, subject: msg.subject, text: msg.text });
  } catch (err) {
    throw classifyMailError(err);
  } finally {
    transport.close();
  }
};

// server/mail-templates.ts
var SIGN = "\n\nTr\xE2n tr\u1ECDng,\nPetrolimex Attendance \u2014 H\u1EC7 th\u1ED1ng \u0110i\u1EC3m danh Camera AI";
var site = (appUrl) => appUrl ? `
\u0110\u1ECBa ch\u1EC9 \u0111\u0103ng nh\u1EADp: ${appUrl}` : "";
function welcomeMail(u, tempPassword, appUrl) {
  return {
    to: u.email,
    subject: "Petrolimex Attendance \u2014 T\xE0i kho\u1EA3n \u0111\u0103ng nh\u1EADp c\u1EE7a b\u1EA1n",
    text: `Xin ch\xE0o ${u.name},

T\xE0i kho\u1EA3n \u0111i\u1EC3m danh c\u1EE7a b\u1EA1n \u0111\xE3 \u0111\u01B0\u1EE3c t\u1EA1o.
M\xE3 nh\xE2n vi\xEAn: ${u.code}
\u0110\u0103ng nh\u1EADp b\u1EB1ng m\xE3 nh\xE2n vi\xEAn ho\u1EB7c email: ${u.email}
M\u1EADt kh\u1EA9u t\u1EA1m: ${tempPassword}` + site(appUrl) + "\n\nL\u1EA7n \u0111\u0103ng nh\u1EADp \u0111\u1EA7u ti\xEAn b\u1EA1n s\u1EBD \u0111\u01B0\u1EE3c y\xEAu c\u1EA7u \u0111\u1ED5i m\u1EADt kh\u1EA9u." + SIGN
  };
}
function resetTempMail(u, tempPassword, appUrl) {
  return {
    to: u.email,
    subject: "Petrolimex Attendance \u2014 M\u1EADt kh\u1EA9u m\u1EDBi",
    text: `Xin ch\xE0o ${u.name},

M\u1EADt kh\u1EA9u c\u1EE7a t\xE0i kho\u1EA3n ${u.code} v\u1EEBa \u0111\u01B0\u1EE3c \u0111\u1EB7t l\u1EA1i.
M\u1EADt kh\u1EA9u t\u1EA1m: ${tempPassword}` + site(appUrl) + "\n\nH\xE3y \u0111\u0103ng nh\u1EADp v\xE0 \u0111\u1ED5i m\u1EADt kh\u1EA9u ngay. N\u1EBFu b\u1EA1n kh\xF4ng y\xEAu c\u1EA7u, h\xE3y b\xE1o ph\xF2ng Nh\xE2n s\u1EF1." + SIGN
  };
}
function resetLinkMail(u, link) {
  return {
    to: u.email,
    subject: "Petrolimex Attendance \u2014 \u0110\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u",
    text: `Xin ch\xE0o ${u.name},

B\u1EA1n (ho\u1EB7c ai \u0111\xF3) v\u1EEBa y\xEAu c\u1EA7u \u0111\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u cho t\xE0i kho\u1EA3n ${u.code}.
B\u1EA5m v\xE0o link sau trong v\xF2ng 30 ph\xFAt \u0111\u1EC3 \u0111\u1EB7t m\u1EADt kh\u1EA9u m\u1EDBi (ch\u1EC9 d\xF9ng \u0111\u01B0\u1EE3c m\u1ED9t l\u1EA7n):
${link}

N\u1EBFu b\u1EA1n kh\xF4ng y\xEAu c\u1EA7u, h\xE3y b\u1ECF qua th\u01B0 n\xE0y; m\u1EADt kh\u1EA9u hi\u1EC7n t\u1EA1i v\u1EABn gi\u1EEF nguy\xEAn.` + SIGN
  };
}
function testMail(to) {
  return { to, subject: "Petrolimex Attendance \u2014 Th\u01B0 th\u1EED", text: "C\u1EA5u h\xECnh g\u1EEDi th\u01B0 ho\u1EA1t \u0111\u1ED9ng b\xECnh th\u01B0\u1EDDng." + SIGN };
}

// server/mail-queue.ts
init_vntime();
var MAIL_RETRY_MIN = [1, 5, 15, 60];
var MAIL_MAX_ATTEMPTS = 5;
var PASSWORD_KINDS = ["welcome", "reset_temp"];
var inFlight = /* @__PURE__ */ new WeakMap();
var inFlightIds = (db) => {
  let ids = inFlight.get(db);
  if (!ids) inFlight.set(db, ids = /* @__PURE__ */ new Set());
  return ids;
};
var RESET_EXPIRED = "Link \u0111\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u \u0111\xE3 h\u1EBFt h\u1EA1n tr\u01B0\u1EDBc khi g\u1EEDi \u0111\u01B0\u1EE3c";
function enqueueMail(db, userId, kind, payload, now) {
  const row = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
  if (!row || !row.email) return;
  dropPendingMails(db, userId, PASSWORD_KINDS.includes(kind) ? PASSWORD_KINDS : [kind]);
  db.prepare(
    `INSERT INTO email_jobs(user_id, kind, to_email, status, attempts, payload, next_run_at, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?)`
  ).run(userId, kind, row.email, JSON.stringify(payload), now, now);
  db.prepare("UPDATE users SET email_status = 'pending', email_error = NULL WHERE id = ?").run(userId);
}
function dropPendingMails(db, userId, kinds) {
  const sending = [...inFlightIds(db)];
  db.prepare(
    `DELETE FROM email_jobs WHERE user_id = ? AND status = 'pending' AND kind IN (${kinds.map(() => "?").join(", ")})
       AND id NOT IN (${sending.map(() => "?").join(", ")})`
  ).run(userId, ...kinds, ...sending);
}
function cancelPasswordMails(db, userId) {
  dropPendingMails(db, userId, PASSWORD_KINDS);
  if (db.prepare("SELECT 1 FROM email_jobs WHERE user_id = ? AND status = 'pending'").get(userId)) return;
  const last = db.prepare("SELECT status, last_error FROM email_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1").get(userId);
  db.prepare("UPDATE users SET email_status = ?, email_error = ? WHERE id = ?").run(last?.status ?? "none", last?.status === "error" ? last.last_error : null, userId);
}
function sentToday(db, now) {
  return db.prepare("SELECT COUNT(*) AS c FROM email_jobs WHERE status = 'sent' AND sent_at >= ?").get(vnDayStart(toVnDate(now))).c;
}
function setUserMailStatus(db, userId, status, error) {
  if (db.prepare("SELECT 1 FROM email_jobs WHERE user_id = ? AND status = 'pending'").get(userId)) return;
  db.prepare("UPDATE users SET email_status = ?, email_error = ? WHERE id = ?").run(status, error, userId);
}
function failJob(db, job, attempts, message) {
  db.prepare("UPDATE email_jobs SET status = 'error', attempts = ?, last_error = ?, payload = '{}' WHERE id = ? AND user_id = ?").run(attempts, message, job.id, job.user_id);
  setUserMailStatus(db, job.user_id, "error", message);
}
var running = /* @__PURE__ */ new WeakSet();
async function runMailJobs(deps, limit = 20) {
  const { db } = deps;
  const result = { sent: 0, failed: 0 };
  const cfg = getSmtpConfig(db);
  if (!cfg || running.has(db)) return result;
  running.add(db);
  try {
    const now = deps.now();
    const due = db.prepare("SELECT id FROM email_jobs WHERE status = 'pending' AND next_run_at <= ? ORDER BY id LIMIT ?").all(now, limit);
    const fresh = db.prepare("SELECT id, user_id, kind, attempts, payload, created_at FROM email_jobs WHERE id = ? AND status = 'pending'");
    let budget = getDailyLimit(db) - sentToday(db, now);
    for (const { id } of due) {
      const job = fresh.get(id);
      if (!job) continue;
      if (budget <= 0) {
        const tomorrow = vnDayStart(addDays(toVnDate(now), 1));
        db.prepare("UPDATE email_jobs SET next_run_at = ? WHERE status = 'pending' AND next_run_at <= ?").run(tomorrow, now);
        break;
      }
      const ids = inFlightIds(db);
      ids.add(job.id);
      let outcome;
      try {
        outcome = await sendOne(deps, cfg, job);
      } finally {
        ids.delete(job.id);
      }
      if (outcome === "sent") {
        result.sent++;
        budget--;
      } else {
        result.failed++;
        if (outcome === "stop") break;
      }
    }
  } finally {
    running.delete(db);
  }
  return result;
}
async function sendOne(deps, cfg, job) {
  const { db } = deps;
  const now = deps.now();
  const u = db.prepare("SELECT id, code, name, email, status, password_hash, must_change_password FROM users WHERE id = ?").get(job.user_id);
  if (!u || u.status !== "active" || !u.email) {
    failJob(db, job, job.attempts + 1, "Nh\xE2n s\u1EF1 kh\xF4ng c\xF2n ho\u1EA1t \u0111\u1ED9ng ho\u1EB7c kh\xF4ng c\xF3 email");
    return "failed";
  }
  const resetExpiresAt = job.created_at + RESET_TTL_MS;
  if (job.kind === "reset_link" && now > resetExpiresAt) {
    failJob(db, job, job.attempts + 1, RESET_EXPIRED);
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=EXPIRED`);
    return "failed";
  }
  const mailUser = { name: u.name, code: u.code, email: u.email };
  const appUrl = getAppUrl(db);
  let msg;
  let newHash = null;
  try {
    if (job.kind === "reset_link") {
      const token = JSON.parse(job.payload).token ?? "";
      msg = resetLinkMail(mailUser, `${appUrl ?? ""}/?reset=${encodeURIComponent(token)}`);
    } else {
      const temp = generateTempPassword();
      newHash = hashPassword(temp);
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(newHash, u.id);
      msg = job.kind === "welcome" ? welcomeMail(mailUser, temp, appUrl) : resetTempMail(mailUser, temp, appUrl);
    }
  } catch {
    if (newHash) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND password_hash = ?").run(u.password_hash, u.must_change_password, u.id, newHash);
    }
    failJob(db, job, job.attempts + 1, "Kh\xF4ng t\u1EA1o \u0111\u01B0\u1EE3c n\u1ED9i dung th\u01B0 (d\u1EEF li\u1EC7u th\u01B0 kh\xF4ng h\u1EE3p l\u1EC7)");
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=BUILD`);
    return "failed";
  }
  try {
    await deps.sendMail(cfg, msg);
  } catch (err) {
    const me = classifyMailError(err);
    if (newHash) {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ? AND password_hash = ?").run(u.password_hash, u.must_change_password, u.id, newHash);
    }
    const attempts = job.attempts + 1;
    const delay = MAIL_RETRY_MIN[Math.min(attempts - 1, MAIL_RETRY_MIN.length - 1)] * 6e4;
    if (me.permanent || attempts >= MAIL_MAX_ATTEMPTS) {
      failJob(db, job, attempts, me.message);
    } else if (job.kind === "reset_link" && now + delay > resetExpiresAt) {
      failJob(db, job, attempts, RESET_EXPIRED);
    } else {
      db.prepare("UPDATE email_jobs SET attempts = ?, last_error = ?, next_run_at = ? WHERE id = ? AND user_id = ?").run(attempts, me.message, now + delay, job.id, job.user_id);
    }
    console.warn(`[MAIL] kind=${job.kind} user=${u.code} status=error code=${me.code}`);
    return me.code === "EAUTH" ? "stop" : "failed";
  }
  db.prepare("UPDATE email_jobs SET status = 'sent', attempts = attempts + 1, last_error = NULL, payload = '{}', sent_at = ? WHERE id = ? AND user_id = ?").run(now, job.id, job.user_id);
  setUserMailStatus(db, u.id, "sent", null);
  if (job.kind === "reset_temp") deleteUserSessions(db, u.id);
  console.log(`[MAIL] kind=${job.kind} user=${u.code} status=sent`);
  return "sent";
}

// server/repo.ts
init_auth();
var USER_SELECT = `SELECT u.id, u.code, u.name, u.email, u.phone, u.role, u.department_id,
  d.name AS department_name, d.area_id, ar.name AS area_name, u.position, u.avatar_url, u.hanet_person_id, u.face_registered, u.status,
  u.hanet_sync_status, u.hanet_sync_error, u.face_error, u.email_status, u.email_error, (u.password_hash IS NOT NULL) AS can_login,
  u.shift_id, us.name AS shift_name,
  (SELECT group_concat(x.area_id) FROM admin_areas x WHERE x.user_id = u.id) AS admin_area_ids, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id LEFT JOIN areas ar ON ar.id = d.area_id LEFT JOIN shifts us ON us.id = u.shift_id`;
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
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    adminAreaIds: r.admin_area_ids ? String(r.admin_area_ids).split(",").sort() : [],
    position: r.position ?? "",
    avatarUrl: r.avatar_url ?? "",
    hanetPersonId: r.hanet_person_id ?? null,
    faceRegistered: r.face_registered === 1,
    status: r.status,
    hanetSyncStatus: r.hanet_sync_status ?? "synced",
    hanetSyncError: r.hanet_sync_error ?? null,
    faceError: r.face_error ?? null,
    emailStatus: r.email_status ?? "none",
    emailError: r.email_error ?? null,
    shiftId: r.shift_id ?? null,
    shiftName: r.shift_name ?? null,
    canLogin: r.can_login === 1,
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
  if (scope.kind === "areas") return target.id === scope.userId || target.areaId !== null && scope.areaIds.includes(target.areaId);
  return scope.departmentId !== null && target.departmentId === scope.departmentId;
}

// server/access.ts
init_errors();
init_bootstrap();
var isSystemAdmin = (u) => u.code === SYSTEM_ADMIN_CODE;
var isGlobalHr = (u) => u.role === "hr";
var isManager = (u) => u.role === "hr" || u.role === "area_admin";
function gate(ok, message) {
  return (req, _res, next) => {
    if (!req.user || !ok(req.user)) return next(new HttpError(403, message));
    next();
  };
}
var requireGlobalHr = gate(isGlobalHr, "Ch\u1EC9 HR to\xE0n h\u1EC7 th\u1ED1ng \u0111\u01B0\u1EE3c th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y");
var requireManager = gate(isManager, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n th\u1EF1c hi\u1EC7n thao t\xE1c n\xE0y");
function managesArea(u, areaId) {
  if (isGlobalHr(u)) return true;
  return u.role === "area_admin" && areaId !== null && u.areaIds.includes(areaId);
}
function notFound(what) {
  return new HttpError(404, `Kh\xF4ng t\xECm th\u1EA5y ${what}`);
}
function deptAreaId(db, departmentId) {
  const row = db.prepare("SELECT area_id FROM departments WHERE id = ?").get(departmentId);
  return row ? row.area_id : void 0;
}
function deviceAreaId(db, deviceKey) {
  const row = db.prepare("SELECT area_id FROM cameras WHERE device_key = ?").get(deviceKey);
  return row?.area_id ?? null;
}
function parseAreaFilter(db, u, raw) {
  if (raw === void 0 || raw === "" || raw === "all") return { kind: "all" };
  if (raw === "none") {
    if (!isGlobalHr(u)) throw notFound("khu v\u1EF1c");
    return { kind: "none" };
  }
  if (typeof raw !== "string" || !db.prepare("SELECT 1 FROM areas WHERE id = ?").get(raw) || !managesArea(u, raw)) throw notFound("khu v\u1EF1c");
  return { kind: "area", areaId: raw };
}
function areaFilterSql(f, deptCol) {
  if (f.kind === "all") return { sql: "1=1", params: [] };
  if (f.kind === "none") return { sql: `(${deptCol} IS NULL OR ${deptCol} IN (SELECT id FROM departments WHERE area_id IS NULL))`, params: [] };
  return { sql: `${deptCol} IN (SELECT id FROM departments WHERE area_id = ?)`, params: [f.areaId] };
}
function areaColumnSql(f, col) {
  if (f.kind === "all") return { sql: "1=1", params: [] };
  if (f.kind === "none") return { sql: `${col} IS NULL`, params: [] };
  return { sql: `${col} = ?`, params: [f.areaId] };
}
function inAreas(col, ids) {
  return ids.length ? { sql: `${col} IN (${ids.map(() => "?").join(", ")})`, params: [...ids] } : { sql: "0=1", params: [] };
}
function departmentScopeSql(u) {
  if (isGlobalHr(u)) return { sql: "1=1", params: [] };
  if (u.role === "area_admin") return inAreas("d.area_id", u.areaIds);
  return u.departmentId ? { sql: "d.id = ?", params: [u.departmentId] } : { sql: "0=1", params: [] };
}
function cameraScopeSql(u) {
  if (isGlobalHr(u)) return { sql: "1=1", params: [] };
  if (u.role === "area_admin") return inAreas("c.area_id", u.areaIds);
  if (u.role === "dept_manager" && u.departmentId) {
    return { sql: "c.area_id IS NOT NULL AND c.area_id = (SELECT area_id FROM departments WHERE id = ?)", params: [u.departmentId] };
  }
  return { sql: "0=1", params: [] };
}
function canDeleteUser(actor, target) {
  if (target.id === actor.id || target.code === SYSTEM_ADMIN_CODE) return false;
  if (isSystemAdmin(actor)) return true;
  if (target.role === "hr") return false;
  if (isGlobalHr(actor)) return true;
  return actor.role === "area_admin" && (target.role === "employee" || target.role === "dept_manager") && managesArea(actor, target.areaId);
}
function resolveAreaFor(db, u, raw) {
  if (raw === void 0 || raw === null || raw === "") {
    if (u.role === "area_admin") throw new HttpError(400, "H\xE3y ch\u1ECDn khu v\u1EF1c");
    return null;
  }
  if (typeof raw !== "string" || !db.prepare("SELECT 1 FROM areas WHERE id = ?").get(raw) || !managesArea(u, raw)) throw notFound("khu v\u1EF1c");
  return raw;
}

// server/routes/areas.ts
init_db();
init_errors();
import { Router } from "express";

// server/validation.ts
var CODE_RE = /^[A-Z0-9._-]{1,32}$/;
var CODE_ERROR = "M\xE3 ch\u1EC9 g\u1ED3m ch\u1EEF kh\xF4ng d\u1EA5u, s\u1ED1, d\u1EA5u ch\u1EA5m, g\u1EA1ch ngang, g\u1EA1ch d\u01B0\u1EDBi (t\u1ED1i \u0111a 32 k\xFD t\u1EF1)";

// server/routes/areas.ts
init_bootstrap();
init_vntime();
var AREA_SELECT = `SELECT a.id, a.code, a.name, a.note, a.created_at,
  (SELECT COUNT(*) FROM departments d WHERE d.area_id = a.id) AS department_count,
  (SELECT COUNT(*) FROM cameras c WHERE c.area_id = a.id) AS camera_count,
  (SELECT COUNT(*) FROM users u JOIN departments d ON d.id = u.department_id WHERE d.area_id = a.id AND u.code != '${SYSTEM_ADMIN_CODE}') AS member_count,
  (SELECT group_concat(u.name, '|') FROM admin_areas x JOIN users u ON u.id = x.user_id WHERE x.area_id = a.id) AS admin_names
  FROM areas a`;
function mapArea(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note ?? "",
    departmentCount: Number(r.department_count),
    cameraCount: Number(r.camera_count),
    memberCount: Number(r.member_count),
    adminNames: r.admin_names ? String(r.admin_names).split("|").sort((x, y) => x.localeCompare(y, "vi")) : [],
    createdAt: r.created_at
  };
}
function getArea(db, id) {
  const row = db.prepare(`${AREA_SELECT} WHERE a.id = ?`).get(id);
  return row ? mapArea(row) : null;
}
function listAreasFor(db, u) {
  if (isGlobalHr(u)) return db.prepare(`${AREA_SELECT} ORDER BY a.code`).all().map(mapArea);
  if (u.role !== "area_admin" || u.areaIds.length === 0) return [];
  const rows = db.prepare(`${AREA_SELECT} WHERE a.id IN (${u.areaIds.map(() => "?").join(", ")}) ORDER BY a.code`).all(...u.areaIds);
  return rows.map(mapArea);
}
function nextAreaCode(db) {
  const codes = db.prepare("SELECT code FROM areas WHERE code GLOB 'KV[0-9]*'").all();
  const max = codes.reduce((m, { code }) => /^KV\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m, 0);
  return `KV${String(max + 1).padStart(2, "0")}`;
}
var text = (v) => typeof v === "string" ? v.trim() : "";
function areaRoutes(ctx) {
  const { db } = ctx;
  const r = Router();
  r.get("/areas", (req, res) => {
    res.json({ areas: listAreasFor(db, currentUser(req)) });
  });
  r.post("/areas", requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const code = text(b.code).toUpperCase() || nextAreaCode(db);
    const name = text(b.name);
    if (!CODE_RE.test(code)) throw new HttpError(400, "M\xE3 khu v\u1EF1c kh\xF4ng h\u1EE3p l\u1EC7");
    if (!name) throw new HttpError(400, "T\xEAn khu v\u1EF1c l\xE0 b\u1EAFt bu\u1ED9c");
    if (db.prepare("SELECT 1 FROM areas WHERE code = ?").get(code)) throw new HttpError(409, "M\xE3 khu v\u1EF1c \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("area");
    db.prepare("INSERT INTO areas(id, code, name, note, created_at) VALUES (?, ?, ?, ?, ?)").run(id, code, name, text(b.note), toVnDate(ctx.now()));
    res.json({ area: getArea(db, id) });
  });
  r.put("/areas/:id", requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound("khu v\u1EF1c");
    const b = req.body ?? {};
    const name = b.name === void 0 ? area.name : text(b.name);
    if (!name) throw new HttpError(400, "T\xEAn khu v\u1EF1c l\xE0 b\u1EAFt bu\u1ED9c");
    db.prepare("UPDATE areas SET name = ?, note = ? WHERE id = ?").run(name, b.note === void 0 ? area.note : text(b.note), area.id);
    res.json({ area: getArea(db, area.id) });
  });
  r.delete("/areas/:id", requireGlobalHr, (req, res) => {
    const area = getArea(db, req.params.id);
    if (!area) throw notFound("khu v\u1EF1c");
    if (area.departmentCount > 0 || area.cameraCount > 0) {
      throw new HttpError(409, "Khu v\u1EF1c c\xF2n ph\xF2ng ban ho\u1EB7c camera: h\xE3y chuy\u1EC3n sang khu kh\xE1c tr\u01B0\u1EDBc khi x\xF3a");
    }
    db.prepare("DELETE FROM areas WHERE id = ?").run(area.id);
    console.warn(`[SECURITY] area_deleted by=${currentUser(req).code} target=${area.code} ip=${req.ip}`);
    res.json({ success: true });
  });
  return r;
}

// server/routes/auth.ts
function authPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router2();
  r.post("/auth/login", jsonOnly, (req, res) => {
    const b = req.body ?? {};
    const raw = typeof b.login === "string" ? b.login : typeof b.code === "string" ? b.code : "";
    const login = raw.includes("@") ? raw.trim().toLowerCase() : raw.trim().toUpperCase();
    const password = typeof b.password === "string" ? b.password : "";
    const key = `${login}|${req.ip}`;
    const now = ctx.now();
    if (ctx.limiter.isBlocked(key, now)) {
      console.warn(`[SECURITY] login_blocked login=${login} ip=${req.ip}`);
      throw new HttpError(429, "B\u1EA1n \u0111\xE3 nh\u1EADp sai qu\xE1 nhi\u1EC1u l\u1EA7n. Vui l\xF2ng th\u1EED l\u1EA1i sau 15 ph\xFAt");
    }
    const row = findLoginUser(db, login);
    if (!row || row.status !== "active" || !verifyPassword(password, row.password_hash)) {
      ctx.limiter.recordFailure(key, now);
      console.warn(`[SECURITY] login_failed login=${login} ip=${req.ip}`);
      throw new HttpError(401, "M\xE3 nh\xE2n vi\xEAn/email ho\u1EB7c m\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng");
    }
    ctx.limiter.reset(key);
    setSessionCookie(res, createSession(db, row.id, now), ctx);
    res.json({ success: true });
  });
  const forgotByIp = new LoginLimiter(5, 15 * 6e4);
  const forgotByLogin = new LoginLimiter(5, 15 * 6e4);
  const FORGOT_MESSAGE = "N\u1EBFu t\xE0i kho\u1EA3n t\u1ED3n t\u1EA1i v\xE0 c\xF3 email, th\u01B0 h\u01B0\u1EDBng d\u1EABn \u0111\xE3 \u0111\u01B0\u1EE3c g\u1EEDi.";
  r.post("/auth/forgot-password", jsonOnly, (req, res) => {
    const raw = typeof req.body?.login === "string" ? req.body.login.trim() : "";
    const login = raw.includes("@") ? raw.toLowerCase() : raw.toUpperCase();
    const now = ctx.now();
    const ipKey = String(req.ip);
    if (forgotByIp.isBlocked(ipKey, now) || forgotByLogin.isBlocked(login, now)) {
      throw new HttpError(429, "B\u1EA1n \u0111\xE3 y\xEAu c\u1EA7u qu\xE1 nhi\u1EC1u l\u1EA7n. Vui l\xF2ng th\u1EED l\u1EA1i sau 15 ph\xFAt");
    }
    forgotByIp.recordFailure(ipKey, now);
    forgotByLogin.recordFailure(login, now);
    const u = findLoginUser(db, login);
    if (u && u.status === "active" && u.email) {
      if (getAppUrl(db)) {
        enqueueMail(db, u.id, "reset_link", { token: createResetToken(db, u.id, now) }, now);
        console.warn(`[SECURITY] password_reset_link_queued user=${u.code} ip=${req.ip}`);
      } else {
        console.warn("[MAIL] forgot_password b\u1ECF qua: ch\u01B0a c\u1EA5u h\xECnh \u0111\u1ECBa ch\u1EC9 web (mail.app_url)");
      }
    }
    res.json({ message: FORGOT_MESSAGE });
  });
  r.post("/auth/reset-password", jsonOnly, (req, res) => {
    const { token, newPassword } = req.body ?? {};
    const error = validateNewPassword(newPassword, "");
    if (error) throw new HttpError(400, error);
    const userId = typeof token === "string" && token ? consumeResetToken(db, token, ctx.now()) : null;
    const u = userId ? db.prepare("SELECT id, status FROM users WHERE id = ?").get(userId) : void 0;
    if (!u || u.status !== "active") throw new HttpError(400, "Link \u0111\u1EB7t l\u1EA1i m\u1EADt kh\u1EA9u kh\xF4ng h\u1EE3p l\u1EC7 ho\u1EB7c \u0111\xE3 h\u1EBFt h\u1EA1n");
    db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(newPassword), u.id);
    deleteUserSessions(db, u.id);
    cancelPasswordMails(db, u.id);
    res.json({ success: true });
  });
  return r;
}
function authRoutes(ctx) {
  const { db } = ctx;
  const r = Router2();
  r.get("/auth/me", (req, res) => {
    const auth = currentUser(req);
    const user = getUser(db, auth.id);
    if (!user) throw new HttpError(401, "Vui l\xF2ng \u0111\u0103ng nh\u1EADp");
    const body = {
      user,
      mustChangePassword: auth.mustChangePassword,
      simulatorEnabled: ctx.config.simulatorEnabled,
      isSystemAdmin: isSystemAdmin(auth),
      areas: listAreasFor(db, auth)
    };
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
init_db();
init_errors();
import { Router as Router3 } from "express";
init_backup();
init_auth();
init_vntime();
init_attendance();
init_bootstrap();

// server/sightings.ts
var SIGHTING_TTL_MS = 24 * 60 * 6e4;
var SIGHTING_PICK_WINDOW_MS = 30 * 6e4;
var LIST_LIMIT = 30;
function mapSighting(r) {
  return {
    id: r.id,
    kind: r.kind,
    personId: r.person_id ?? null,
    aliasId: r.alias_id ?? null,
    personName: r.person_name ?? null,
    deviceId: r.device_id,
    deviceName: r.device_name ?? null,
    ts: r.ts,
    imageUrl: r.image_url
  };
}
function recordSighting(db, s, now) {
  db.prepare(
    `INSERT INTO face_sightings(kind, person_id, alias_id, person_name, device_id, device_name, ts, image_url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(s.kind, s.personId, s.aliasId, s.personName, s.deviceId, s.deviceName, s.ts, s.imageUrl, now);
}
function listSightings(db, now, kind) {
  const since = now - SIGHTING_PICK_WINDOW_MS;
  const rows = kind ? db.prepare("SELECT * FROM face_sightings WHERE created_at >= ? AND kind = ? ORDER BY created_at DESC, id DESC LIMIT 500").all(since, kind) : db.prepare("SELECT * FROM face_sightings WHERE created_at >= ? ORDER BY created_at DESC, id DESC LIMIT 500").all(since);
  const known = db.prepare("SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)");
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const r of rows) {
    const s = mapSighting(r);
    if (s.kind === "unlinked") {
      const key = s.personId ?? `alias:${s.aliasId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (known.get(s.aliasId?.toUpperCase() ?? "", s.personId ?? "")) continue;
    }
    out.push(s);
    if (out.length >= LIST_LIMIT) break;
  }
  return out;
}
function getSighting(db, id) {
  const row = db.prepare("SELECT * FROM face_sightings WHERE id = ?").get(id);
  return row ? mapSighting(row) : null;
}
function deleteSighting(db, id) {
  db.prepare("DELETE FROM face_sightings WHERE id = ?").run(id);
}
function purgeSightings(db, now) {
  return Number(db.prepare("DELETE FROM face_sightings WHERE created_at < ?").run(now - SIGHTING_TTL_MS).changes);
}

// server/hanet-face.ts
init_hanet_api();
init_hanet();
init_hanet_sync();
function linkFace(db, userId, personId, departmentId, now) {
  db.prepare("UPDATE users SET hanet_person_id = ?, face_registered = 1, face_error = NULL WHERE id = ?").run(personId, userId);
  if (departmentId) enqueue(db, "user", userId, "user.department", { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
  wakeEntity(db, "user", userId, now);
}
async function registerFace(deps, userId, imageUrl) {
  const { db } = deps;
  const u = db.prepare("SELECT id, code, name, position, department_id, face_registered FROM users WHERE id = ?").get(userId);
  if (!u) return { ok: false, message: "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1" };
  const fail = (message) => {
    db.prepare("UPDATE users SET face_error = ? WHERE id = ?").run(message, userId);
    return { ok: false, message };
  };
  const placeId = getPlaceIds(db)[0];
  if (!reconcileEnabled(db) || !placeId) return fail("Ch\u01B0a c\u1EA5u h\xECnh k\u1EBFt n\u1ED1i Camera AI (Client ID, Refresh Token, \u0111\u1ECBa \u0111i\u1EC3m)");
  try {
    if (u.face_registered === 1) {
      await hanetApi.updateFaceByUrl(deps, { aliasId: u.code, placeId, url: imageUrl });
      db.prepare("UPDATE users SET face_error = NULL WHERE id = ?").run(userId);
      return { ok: true, message: "\u0110\xE3 c\u1EADp nh\u1EADt \u1EA3nh nh\u1EADn di\u1EC7n tr\xEAn Camera AI" };
    }
    let personId;
    try {
      personId = await hanetApi.registerByUrl(deps, { name: u.name, aliasId: u.code, placeId, url: imageUrl, title: u.position ?? "" });
    } catch (err) {
      if (err instanceof HanetApiError && err.returnCode === -9005) {
        return fail(`M\xE3 ${u.code} \u0111\xE3 l\xE0 aliasID c\u1EE7a m\u1ED9t ng\u01B0\u1EDDi kh\xE1c tr\xEAn Camera AI. D\xF9ng "Nh\u1EADp t\u1EEB Camera AI" \u0111\u1EC3 li\xEAn k\u1EBFt ng\u01B0\u1EDDi \u0111\xF3, ho\u1EB7c \u0111\u1ED5i m\xE3 nh\xE2n vi\xEAn.`);
      }
      throw err;
    }
    if (!personId) return fail("Camera AI kh\xF4ng tr\u1EA3 Person ID sau khi \u0111\u0103ng k\xFD");
    linkFace(db, userId, String(personId), u.department_id, deps.now());
    return { ok: true, message: "\u0110\xE3 \u0111\u0103ng k\xFD FaceID tr\xEAn Camera AI" };
  } catch (err) {
    return fail(err.message);
  }
}

// server/routes/users.ts
init_hanet_sync();

// server/hanet-import.ts
init_db();
init_hanet_api();
init_hanet_sync();
init_bootstrap();
init_vntime();
var IMPORT_PAGE_SIZE = 100;
var IMPORT_MAX = 100;
var MAX_PAGES2 = 50;
async function fetchAllPersons(deps, placeId) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES2; page++) {
    const items = await hanetApi.listPersons(deps, placeId, page, IMPORT_PAGE_SIZE);
    all.push(...items);
    if (items.length < IMPORT_PAGE_SIZE) break;
  }
  return all;
}
function aliasCode(p) {
  const upper = String(p.aliasID ?? "").trim().toUpperCase();
  return upper !== "" && upper !== SYSTEM_ADMIN_CODE && CODE_RE.test(upper) ? upper : null;
}
function unlinkedPersons(db, persons) {
  const known = db.prepare("SELECT 1 FROM users WHERE code = ? OR (hanet_person_id IS NOT NULL AND hanet_person_id = ?)");
  return persons.filter((p) => {
    if (!p.personID) return false;
    const code = aliasCode(p) ?? String(p.aliasID ?? "").trim().toUpperCase();
    return !known.get(code === SYSTEM_ADMIN_CODE ? "" : code, String(p.personID));
  });
}
function hanetAliases(persons) {
  return new Set(persons.map((p) => String(p.aliasID ?? "").trim().toUpperCase()).filter(Boolean));
}
function nextEmployeeCode(db, reserved = /* @__PURE__ */ new Set()) {
  const codes = db.prepare("SELECT code FROM users WHERE code GLOB 'NV[0-9][0-9][0-9][0-9]*'").all();
  let n = codes.reduce((m, { code }) => /^NV\d{4,}$/.test(code) ? Math.max(m, Number(code.slice(2))) : m, 0) + 1;
  while (reserved.has(`NV${String(n).padStart(4, "0")}`)) n++;
  return `NV${String(n).padStart(4, "0")}`;
}
function importPersons(db, persons, departmentId, now, reserved = /* @__PURE__ */ new Set()) {
  const exists = db.prepare("SELECT 1 FROM users WHERE code = ?");
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, '', '', 'employee', ?, ?, ?, ?, 1, 'active', NULL, 1, ?)`
  );
  return tx(
    db,
    () => persons.map((p) => {
      const alias = String(p.aliasID ?? "").trim();
      const fromAlias = aliasCode(p);
      const code = fromAlias && !exists.get(fromAlias) ? fromAlias : nextEmployeeCode(db, reserved);
      const id = newId("usr");
      const name = String(p.name ?? "").trim() || code;
      insert.run(id, code, name, departmentId, String(p.title ?? "").trim(), String(p.avatar ?? ""), String(p.personID), toVnDate(now));
      if (code !== alias) enqueue(db, "user", id, "user.alias", { personId: String(p.personID), code }, now);
      if (departmentId) enqueue(db, "user", id, "user.department", { fromHanetDeptId: null, toDepartmentId: departmentId }, now);
      return { id, code, name };
    })
  );
}

// server/routes/users.ts
init_hanet();

// server/csv-import.ts
init_db();
init_errors();
init_bootstrap();
init_vntime();
var CSV_MAX_ROWS = 200;
var ROLE_MAP = { "": "employee", nhan_vien: "employee", truong_phong: "dept_manager" };
var cell = (v) => typeof v === "string" ? v.trim() : "";
var errText = (e) => e instanceof HttpError ? e.message : "D\u1EEF li\u1EC7u kh\xF4ng h\u1EE3p l\u1EC7";
function checkCsvRows(db, actor, rows, reserved) {
  if (!Array.isArray(rows)) throw new HttpError(400, "D\u1EEF li\u1EC7u nh\u1EADp kh\xF4ng h\u1EE3p l\u1EC7");
  if (rows.length === 0) throw new HttpError(400, "File kh\xF4ng c\xF3 d\xF2ng n\xE0o");
  if (rows.length > CSV_MAX_ROWS) throw new HttpError(400, `M\u1ED7i l\u1EA7n nh\u1EADp t\u1ED1i \u0111a ${CSV_MAX_ROWS} d\xF2ng`);
  const deptByCode = db.prepare("SELECT id, area_id FROM departments WHERE code = ?");
  const codeTaken = db.prepare("SELECT 1 FROM users WHERE code = ?");
  const emailTaken = db.prepare("SELECT 1 FROM users WHERE email != '' AND lower(email) = ?");
  const fileCodes = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const c = cell(r?.code).toUpperCase();
    if (c) fileCodes.set(c, (fileCodes.get(c) ?? 0) + 1);
  }
  const seenEmails = /* @__PURE__ */ new Set();
  const checked = rows.map((r, i) => {
    const errors = [];
    const name = cell(r?.name);
    if (!name) errors.push("H\u1ECD t\xEAn l\xE0 b\u1EAFt bu\u1ED9c");
    let email = "";
    try {
      email = parseEmail(r?.email);
      if (seenEmails.has(email)) errors.push("Email tr\xF9ng v\u1EDBi d\xF2ng kh\xE1c trong file");
      else if (emailTaken.get(email)) errors.push("Email \u0111\xE3 \u0111\u01B0\u1EE3c d\xF9ng cho nh\xE2n s\u1EF1 kh\xE1c");
      seenEmails.add(email);
    } catch (e) {
      errors.push(errText(e));
    }
    let phone = "";
    try {
      phone = parsePhone(r?.phone);
    } catch (e) {
      errors.push(errText(e));
    }
    const dept = deptByCode.get(cell(r?.departmentCode).toUpperCase());
    if (!dept || !managesArea(actor, dept.area_id)) errors.push("M\xE3 ph\xF2ng ban kh\xF4ng t\u1ED3n t\u1EA1i");
    const roleKey = cell(r?.role).toLowerCase();
    const role = Object.hasOwn(ROLE_MAP, roleKey) ? ROLE_MAP[roleKey] : void 0;
    if (!role) errors.push("Vai tr\xF2 ch\u1EC9 \u0111\u01B0\u1EE3c l\xE0 nhan_vien ho\u1EB7c truong_phong");
    const code = cell(r?.code).toUpperCase();
    if (code) {
      if (!CODE_RE.test(code)) errors.push(CODE_ERROR);
      else if (code === SYSTEM_ADMIN_CODE) errors.push("M\xE3 ADMIN d\xE0nh ri\xEAng cho t\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng");
      else if (codeTaken.get(code)) errors.push("M\xE3 nh\xE2n vi\xEAn \u0111\xE3 t\u1ED3n t\u1EA1i");
      else if ((fileCodes.get(code) ?? 0) > 1) errors.push("M\xE3 nh\xE2n vi\xEAn tr\xF9ng v\u1EDBi d\xF2ng kh\xE1c trong file");
    }
    return { line: i + 2, errors, name, email, phone, code, departmentId: dept?.id ?? "", position: cell(r?.position), role: role ?? "employee" };
  });
  const taken = /* @__PURE__ */ new Set([...reserved, ...fileCodes.keys()]);
  const preview = [];
  const valid = [];
  for (const c of checked) {
    const ok = c.errors.length === 0;
    let code = null;
    if (ok) {
      code = c.code || nextEmployeeCode(db, taken);
      taken.add(code);
      valid.push({ code, name: c.name, email: c.email, phone: c.phone, departmentId: c.departmentId, position: c.position, role: c.role });
    }
    preview.push({ line: c.line, ok, errors: c.errors, code, name: c.name, email: c.email });
  }
  return { preview, valid };
}
function createCsvUsers(db, valid, now) {
  const insert = db.prepare(
    `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
       face_registered, status, password_hash, must_change_password, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 0, 'active', NULL, 1, ?)`
  );
  return tx(
    db,
    () => valid.map((v) => {
      const id = newId("usr");
      insert.run(id, v.code, v.name, v.email, v.phone, v.role, v.departmentId, v.position, toVnDate(now));
      enqueueMail(db, id, "welcome", {}, now);
      return { id, code: v.code, name: v.name };
    })
  );
}

// server/routes/users.ts
var ROLES = ["hr", "area_admin", "dept_manager", "employee"];
var str2 = (v) => typeof v === "string" ? v.trim() : void 0;
function assertPersonIdFree(db, personId, userId) {
  if (!personId) return;
  const holder = db.prepare("SELECT id FROM users WHERE hanet_person_id = ?").get(personId);
  if (holder && holder.id !== userId) throw new HttpError(409, "Person ID n\xE0y \u0111\xE3 g\u1EAFn v\u1EDBi nh\xE2n s\u1EF1 kh\xE1c");
}
function enqueueAlias(db, userId, personId, code, now) {
  enqueue(db, "user", userId, "user.alias", { personId, code }, now);
}
function resolveDepartment(db, departmentId) {
  if (departmentId === void 0 || departmentId === null || departmentId === "") return null;
  if (typeof departmentId !== "string" || !db.prepare("SELECT 1 FROM departments WHERE id = ?").get(departmentId)) {
    throw new HttpError(400, "Ph\xF2ng ban kh\xF4ng t\u1ED3n t\u1EA1i");
  }
  return departmentId;
}
function manageableUser(db, actor, id) {
  const u = getUser(db, id);
  if (!u || u.code === SYSTEM_ADMIN_CODE && !isSystemAdmin(actor)) throw notFound("nh\xE2n s\u1EF1");
  if (u.id !== actor.id && !managesArea(actor, u.areaId)) throw notFound("nh\xE2n s\u1EF1");
  return u;
}
function assertCanEdit(actor, target) {
  if (target.id === actor.id) return;
  if (target.role === "hr" && !isSystemAdmin(actor)) throw new HttpError(403, "Ch\u1EC9 t\xE0i kho\u1EA3n ADMIN \u0111\u01B0\u1EE3c s\u1EEDa t\xE0i kho\u1EA3n HR to\xE0n h\u1EC7 th\u1ED1ng");
  if (actor.role === "area_admin" && target.role === "area_admin") throw new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n s\u1EEDa t\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB khu v\u1EF1c kh\xE1c");
}
function assertRoleAllowed(actor, role) {
  if (!ROLES.includes(role)) throw new HttpError(400, "Vai tr\xF2 kh\xF4ng h\u1EE3p l\u1EC7");
  if (role === "hr" && !isSystemAdmin(actor)) throw new HttpError(403, "Ch\u1EC9 t\xE0i kho\u1EA3n ADMIN \u0111\u01B0\u1EE3c c\u1EA5p vai tr\xF2 HR to\xE0n h\u1EC7 th\u1ED1ng");
  if (role === "area_admin" && !isGlobalHr(actor)) throw new HttpError(403, "Ch\u1EC9 HR to\xE0n h\u1EC7 th\u1ED1ng \u0111\u01B0\u1EE3c c\u1EA5p quy\u1EC1n qu\u1EA3n tr\u1ECB khu v\u1EF1c");
}
function resolveDepartmentFor(db, actor, departmentId) {
  const id = resolveDepartment(db, departmentId);
  if (id === null) {
    if (actor.role === "area_admin") throw new HttpError(400, "H\xE3y ch\u1ECDn ph\xF2ng ban thu\u1ED9c khu b\u1EA1n qu\u1EA3n l\xFD");
    return null;
  }
  if (!managesArea(actor, deptAreaId(db, id) ?? null)) throw notFound("ph\xF2ng ban");
  return id;
}
function resolveUserShift(db, shiftId, departmentId) {
  if (shiftId === void 0 || shiftId === null || shiftId === "") return null;
  const area = departmentId ? deptAreaId(db, departmentId) ?? null : null;
  const s = typeof shiftId === "string" ? db.prepare("SELECT area_id FROM shifts WHERE id = ?").get(shiftId) : void 0;
  if (!s || area === null || s.area_id !== area) throw new HttpError(400, "Ca kh\xF4ng thu\u1ED9c khu c\u1EE7a nh\xE2n s\u1EF1 n\xE0y");
  return shiftId;
}
function assertCanManageFace(actor, target) {
  assertCanEdit(actor, target);
  if (actor.role === "area_admin" && target.id === actor.id) throw new HttpError(403, "B\u1EA1n kh\xF4ng th\u1EC3 t\u1EF1 \u0111\u0103ng k\xFD FaceID cho ch\xEDnh m\xECnh");
}
function parseAdminAreaIds(db, raw) {
  const ids = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
  if (ids.length === 0) throw new HttpError(400, "H\xE3y ch\u1ECDn \xEDt nh\u1EA5t m\u1ED9t khu cho qu\u1EA3n tr\u1ECB khu v\u1EF1c");
  for (const id of ids) if (!db.prepare("SELECT 1 FROM areas WHERE id = ?").get(id)) throw new HttpError(400, "Khu v\u1EF1c kh\xF4ng t\u1ED3n t\u1EA1i");
  return ids;
}
function setAdminAreas(db, userId, areaIds) {
  db.prepare("DELETE FROM admin_areas WHERE user_id = ?").run(userId);
  const ins = db.prepare("INSERT INTO admin_areas(user_id, area_id) VALUES (?, ?)");
  for (const id of areaIds) ins.run(userId, id);
}
function resolveFaceImage(db, actor, userId, b, now) {
  if (b.sightingId !== void 0 && b.sightingId !== null && b.sightingId !== "") {
    const s = getSighting(db, Number(b.sightingId));
    if (!s || !managesArea(actor, deviceAreaId(db, s.deviceId))) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y l\u01B0\u1EE3t ch\u1EE5p n\xE0y, h\xE3y ch\u1ECDn l\u01B0\u1EE3t m\u1EDBi h\u01A1n");
    return { url: s.imageUrl, sightingId: s.id };
  }
  if (b.detectionId !== void 0 && b.detectionId !== null && userId) {
    const row = db.prepare("SELECT image_url FROM detections WHERE id = ? AND user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != ''").get(Number(b.detectionId), userId, now - SIGHTING_TTL_MS);
    if (!row) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y \u1EA3nh c\u1EE7a l\u01B0\u1EE3t qu\u1EB9t n\xE0y (ch\u1EC9 d\xF9ng \u0111\u01B0\u1EE3c l\u01B0\u1EE3t trong 24 gi\u1EDD)");
    return { url: row.image_url, sightingId: null };
  }
  return null;
}
function userRoutes(ctx) {
  const { db } = ctx;
  const r = Router3();
  const deps = { db, fetch: ctx.fetch, now: ctx.now };
  r.get("/users", (req, res) => {
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), "u.id", "u.department_id");
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), "u.department_id");
    const rows = db.prepare(`${USER_SELECT} WHERE ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} ORDER BY u.code`).all(...w.params, ...f.params);
    res.json({ users: rows.map(mapUser) });
  });
  r.post(
    "/users/import",
    requireManager,
    ah(async (req, res) => {
      const b = req.body ?? {};
      const wanted = new Set(
        (Array.isArray(b.persons) ? b.persons : []).map((p) => String(p?.personId ?? "")).filter(Boolean)
      );
      if (wanted.size === 0) throw new HttpError(400, "Ch\u01B0a ch\u1ECDn ng\u01B0\u1EDDi n\xE0o \u0111\u1EC3 nh\u1EADp");
      if (wanted.size > IMPORT_MAX) throw new HttpError(400, `M\u1ED7i l\u1EA7n nh\u1EADp t\u1ED1i \u0111a ${IMPORT_MAX} ng\u01B0\u1EDDi`);
      const departmentId = resolveDepartmentFor(db, currentUser(req), b.departmentId);
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, "Ch\u01B0a c\u1EA5u h\xECnh k\u1EBFt n\u1ED1i Camera AI (Client ID, Refresh Token, \u0111\u1ECBa \u0111i\u1EC3m)");
      let all;
      try {
        all = await fetchAllPersons(deps, placeId);
      } catch (err) {
        throw new HttpError(502, `Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c danh s\xE1ch ng\u01B0\u1EDDi t\u1EEB Camera AI: ${err.message}`);
      }
      const chosen = unlinkedPersons(db, all).filter((p) => wanted.has(String(p.personID)));
      if (chosen.length === 0) throw new HttpError(400, "Kh\xF4ng c\xF3 ng\u01B0\u1EDDi h\u1EE3p l\u1EC7 \u0111\u1EC3 nh\u1EADp (c\xF3 th\u1EC3 \u0111\xE3 \u0111\u01B0\u1EE3c nh\u1EADp tr\u01B0\u1EDBc \u0111\xF3)");
      const created = importPersons(db, chosen, departmentId, ctx.now(), hanetAliases(all));
      kickAll(ctx);
      res.json({ created });
    })
  );
  const cameraAliases = async () => {
    const placeId = getPlaceIds(db)[0];
    if (!reconcileEnabled(db) || !placeId) return /* @__PURE__ */ new Set();
    try {
      return hanetAliases(await fetchAllPersons(deps, placeId));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  };
  r.get(
    "/users/next-code",
    requireManager,
    ah(async (_req, res) => {
      res.json({ code: nextEmployeeCode(db, await cameraAliases()) });
    })
  );
  r.post(
    "/users/import-csv/preview",
    requireManager,
    ah(async (req, res) => {
      const { preview } = checkCsvRows(db, currentUser(req), req.body?.rows, await cameraAliases());
      res.json({ rows: preview });
    })
  );
  r.post(
    "/users/import-csv",
    requireManager,
    ah(async (req, res) => {
      const { preview, valid } = checkCsvRows(db, currentUser(req), req.body?.rows, await cameraAliases());
      if (valid.length === 0) throw new HttpError(400, "Kh\xF4ng c\xF3 d\xF2ng h\u1EE3p l\u1EC7 \u0111\u1EC3 t\u1EA1o");
      const created = createCsvUsers(db, valid, ctx.now());
      res.json({ created, skipped: preview.length - valid.length });
    })
  );
  r.post(
    "/users",
    requireManager,
    ah(async (req, res) => {
      const actor = currentUser(req);
      const b = req.body ?? {};
      const code = (str2(b.code) ?? "").toUpperCase() || nextEmployeeCode(db, await cameraAliases());
      const name = str2(b.name) ?? "";
      if (!CODE_RE.test(code)) throw new HttpError(400, CODE_ERROR);
      if (code === SYSTEM_ADMIN_CODE) throw new HttpError(400, "M\xE3 ADMIN d\xE0nh ri\xEAng cho t\xE0i kho\u1EA3n qu\u1EA3n tr\u1ECB h\u1EC7 th\u1ED1ng");
      if (!name) throw new HttpError(400, "H\u1ECD t\xEAn l\xE0 b\u1EAFt bu\u1ED9c");
      const role = b.role === void 0 ? "employee" : b.role;
      assertRoleAllowed(actor, role);
      const departmentId = resolveDepartmentFor(db, actor, b.departmentId);
      const shiftId = resolveUserShift(db, b.shiftId, departmentId);
      const email = parseEmail(b.email);
      const phone = parsePhone(b.phone);
      const adminAreaIds = role === "area_admin" ? parseAdminAreaIds(db, b.adminAreaIds) : [];
      if (db.prepare("SELECT 1 FROM users WHERE code = ?").get(code)) throw new HttpError(409, "M\xE3 nh\xE2n vi\xEAn \u0111\xE3 t\u1ED3n t\u1EA1i");
      assertEmailFree(db, email, null);
      const image = resolveFaceImage(db, actor, null, b, ctx.now());
      const hanetPersonId = str2(b.hanetPersonId) || null;
      assertPersonIdFree(db, hanetPersonId, null);
      const id = newId("usr");
      tx(db, () => {
        db.prepare(
          `INSERT INTO users(id, code, name, email, phone, role, department_id, position, avatar_url, hanet_person_id,
             face_registered, status, password_hash, must_change_password, shift_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, 1, ?, ?)`
        ).run(id, code, name, email, phone, role, departmentId, str2(b.position) ?? "", str2(b.avatarUrl) ?? "", hanetPersonId, hanetPersonId ? 1 : 0, shiftId, toVnDate(ctx.now()));
        if (adminAreaIds.length) setAdminAreas(db, id, adminAreaIds);
        enqueueMail(db, id, "welcome", {}, ctx.now());
      });
      if (hanetPersonId) enqueueAlias(db, id, hanetPersonId, code, ctx.now());
      if (hanetPersonId && departmentId) {
        enqueue(db, "user", id, "user.department", { fromHanetDeptId: null, toDepartmentId: departmentId }, ctx.now());
      }
      let face;
      if (image) {
        face = await registerFace(deps, id, image.url);
        if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      }
      kickEntity(ctx, "user", id);
      res.json({ user: getUser(db, id), ...face ? { face } : {} });
    })
  );
  r.put("/users/:id", requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    const b = req.body ?? {};
    const changesRole = b.role !== void 0 && b.role !== target.role;
    const changesStatus = b.status !== void 0 && b.status !== target.status;
    const changesDept = b.departmentId !== void 0 && (b.departmentId || null) !== target.departmentId;
    const changesShift = b.shiftId !== void 0 && (b.shiftId || null) !== target.shiftId;
    const changesAreas = b.adminAreaIds !== void 0 && !(Array.isArray(b.adminAreaIds) && [...new Set(b.adminAreaIds.map(String))].sort().join(",") === target.adminAreaIds.join(","));
    if (target.id === actor.id && actor.role === "area_admin") {
      const changesOther = changesRole || changesStatus || changesDept || changesAreas || changesShift || b.hanetPersonId !== void 0 && (str2(b.hanetPersonId) || null) !== target.hanetPersonId || b.avatarUrl !== void 0 && (str2(b.avatarUrl) ?? "") !== target.avatarUrl;
      if (changesOther) throw new HttpError(400, "B\u1EA1n ch\u1EC9 \u0111\u01B0\u1EE3c s\u1EEDa h\u1ECD t\xEAn, email, \u0111i\u1EC7n tho\u1EA1i v\xE0 ch\u1EE9c v\u1EE5 c\u1EE7a ch\xEDnh m\xECnh");
    }
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
      const name = str2(b.name);
      if (!name) throw new HttpError(400, "H\u1ECD t\xEAn l\xE0 b\u1EAFt bu\u1ED9c");
      set("name", name);
    }
    if (b.email !== void 0) {
      const email = parseEmail(b.email);
      assertEmailFree(db, email, target.id);
      set("email", email);
    }
    if (b.phone !== void 0) set("phone", parsePhone(b.phone));
    for (const [key, col] of [["position", "position"], ["avatarUrl", "avatar_url"]]) {
      if (b[key] !== void 0) set(col, str2(b[key]) ?? "");
    }
    if (b.hanetPersonId !== void 0) {
      const pid = str2(b.hanetPersonId) || null;
      assertPersonIdFree(db, pid, target.id);
      set("hanet_person_id", pid);
      set("face_registered", pid ? 1 : 0);
    }
    if (changesRole) {
      assertRoleAllowed(actor, b.role);
      set("role", b.role);
    }
    if (b.status !== void 0) {
      if (b.status !== "active" && b.status !== "inactive") throw new HttpError(400, "Tr\u1EA1ng th\xE1i kh\xF4ng h\u1EE3p l\u1EC7");
      set("status", b.status);
    }
    const deptAfter = changesDept ? resolveDepartmentFor(db, actor, b.departmentId) : target.departmentId;
    if (changesDept) set("department_id", deptAfter);
    if (b.shiftId !== void 0) set("shift_id", resolveUserShift(db, b.shiftId, deptAfter));
    const newRole = changesRole ? b.role : target.role;
    let adminAreas = null;
    if (newRole === "area_admin" && (changesRole || changesAreas)) {
      if (!isGlobalHr(actor)) throw new HttpError(403, "Ch\u1EC9 HR to\xE0n h\u1EC7 th\u1ED1ng \u0111\u01B0\u1EE3c c\u1EA5p quy\u1EC1n qu\u1EA3n tr\u1ECB khu v\u1EF1c");
      adminAreas = parseAdminAreaIds(db, b.adminAreaIds);
    } else if (changesRole && target.role === "area_admin") {
      adminAreas = [];
    }
    tx(db, () => {
      if (sets.length) db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params, target.id);
      if (adminAreas !== null) setAdminAreas(db, target.id, adminAreas);
    });
    if (changesShift || changesDept) {
      const { from, to } = monthToDate(ctx.now());
      recomputeUsers(db, [target.id], from, to, ctx.now());
    }
    if (b.email !== void 0 && !target.canLogin && parseEmail(b.email) !== target.email.toLowerCase()) {
      enqueueMail(db, target.id, "welcome", {}, ctx.now());
    }
    if (b.status === "inactive" && target.status !== "inactive") deleteUserSessions(db, target.id);
    const after = getUser(db, target.id);
    const now = ctx.now();
    if (after.hanetPersonId && after.hanetPersonId !== target.hanetPersonId) enqueueAlias(db, target.id, after.hanetPersonId, after.code, now);
    if (after.faceRegistered && (after.name !== target.name || after.position !== target.position)) {
      enqueue(db, "user", target.id, "user.info", { code: after.code, name: after.name, title: after.position }, now);
    }
    const linkedNow = Boolean(after.hanetPersonId) && !target.hanetPersonId;
    if (after.hanetPersonId && (after.departmentId !== target.departmentId || linkedNow && after.departmentId)) {
      const from = target.departmentId && !linkedNow ? db.prepare("SELECT hanet_department_id FROM departments WHERE id = ?").get(target.departmentId)?.hanet_department_id ?? null : null;
      enqueue(db, "user", target.id, "user.department", { fromHanetDeptId: from, toDepartmentId: after.departmentId }, now);
    }
    kickEntity(ctx, "user", target.id);
    res.json({ user: getUser(db, target.id) });
  });
  r.post("/users/:id/reset-password", requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanEdit(actor, target);
    if (!target.email) throw new HttpError(400, "Nh\xE2n s\u1EF1 ch\u01B0a c\xF3 email: h\xE3y b\u1ED5 sung email tr\u01B0\u1EDBc");
    enqueueMail(db, target.id, target.canLogin ? "reset_temp" : "welcome", {}, ctx.now());
    console.warn(`[SECURITY] password_reset_queued by=${actor.code} target=${target.code} ip=${req.ip}`);
    res.json({ queued: true });
  });
  r.post(
    "/users/:id/face",
    requireManager,
    ah(async (req, res) => {
      const actor = currentUser(req);
      const target = manageableUser(db, actor, req.params.id);
      assertCanManageFace(actor, target);
      const image = resolveFaceImage(db, actor, target.id, req.body ?? {}, ctx.now());
      if (!image) throw new HttpError(400, "H\xE3y ch\u1ECDn m\u1ED9t l\u01B0\u1EE3t camera ch\u1EE5p");
      const face = await registerFace(deps, target.id, image.url);
      if (face.ok && image.sightingId !== null) deleteSighting(db, image.sightingId);
      if (face.ok) kickEntity(ctx, "user", target.id);
      res.json({ user: getUser(db, target.id), face });
    })
  );
  r.get("/users/:id/face-candidates", requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    assertCanManageFace(actor, target);
    const now = ctx.now();
    const rows = db.prepare(
      `SELECT id, ts, image_url, device_id, device_name FROM detections
         WHERE user_id = ? AND ts >= ? AND image_url IS NOT NULL AND image_url != '' ORDER BY ts DESC LIMIT 30`
    ).all(target.id, now - SIGHTING_TTL_MS);
    const body = {
      detections: rows.map((d) => ({ id: d.id, ts: d.ts, imageUrl: d.image_url, deviceName: d.device_name ?? d.device_id })),
      strangers: listSightings(db, now, "stranger").filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId)))
    };
    res.json(body);
  });
  r.delete("/users/:id", requireManager, (req, res) => {
    const actor = currentUser(req);
    const target = manageableUser(db, actor, req.params.id);
    if (target.id === actor.id) throw new HttpError(400, "Kh\xF4ng th\u1EC3 t\u1EF1 x\xF3a t\xE0i kho\u1EA3n \u0111ang \u0111\u0103ng nh\u1EADp");
    if (!canDeleteUser(actor, target)) throw new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n x\xF3a t\xE0i kho\u1EA3n n\xE0y");
    const backup = backupNow(db, ctx.config.backupDir, "pre-delete", ctx.now());
    if (target.faceRegistered || target.hanetPersonId) {
      enqueue(db, "user", target.id, "user.remove", { code: target.code, name: target.name, personId: target.hanetPersonId }, ctx.now());
    } else {
      dropEntityJobs(db, "user", target.id);
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
    console.warn(`[SECURITY] user_deleted by=${actor.code} target=${target.code} backup=${backup} ip=${req.ip}`);
    kickEntity(ctx, "user", target.id);
    res.json({ success: true, backup });
  });
  return r;
}

// server/routes/departments.ts
init_db();
init_errors();
import { Router as Router4 } from "express";
init_backup();
init_hanet_sync();
init_vntime();
init_attendance();
var DEPT_SELECT = `SELECT d.id, d.code, d.name, d.description, d.manager_id, m.name AS manager_name, d.hanet_sync_status, d.hanet_sync_error, d.created_at,
  d.shift_id, ds.name AS shift_name,
  d.area_id, ar.name AS area_name,
  (SELECT COUNT(*) FROM users x WHERE x.department_id = d.id) AS member_count
  FROM departments d LEFT JOIN users m ON m.id = d.manager_id LEFT JOIN areas ar ON ar.id = d.area_id LEFT JOIN shifts ds ON ds.id = d.shift_id`;
function mapDept(r) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? "",
    managerId: r.manager_id ?? null,
    managerName: r.manager_name ?? null,
    memberCount: Number(r.member_count),
    hanetSyncStatus: r.hanet_sync_status ?? "synced",
    hanetSyncError: r.hanet_sync_error ?? null,
    shiftId: r.shift_id ?? null,
    shiftName: r.shift_name ?? null,
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    createdAt: r.created_at
  };
}
function getDept(db, id) {
  const row = db.prepare(`${DEPT_SELECT} WHERE d.id = ?`).get(id);
  return row ? mapDept(row) : null;
}
function resolveManager(db, actor, managerId) {
  if (managerId === void 0 || managerId === null || managerId === "") return null;
  const m = typeof managerId === "string" ? getUser(db, managerId) : null;
  if (!m) throw new HttpError(400, "Tr\u01B0\u1EDFng ph\xF2ng \u0111\u01B0\u1EE3c ch\u1ECDn kh\xF4ng t\u1ED3n t\u1EA1i");
  if (!managesArea(actor, m.areaId)) throw notFound("nh\xE2n s\u1EF1");
  return m.id;
}
function resolveDeptShift(db, shiftId, areaId) {
  if (shiftId === void 0 || shiftId === null || shiftId === "") return null;
  const s = typeof shiftId === "string" ? db.prepare("SELECT area_id FROM shifts WHERE id = ?").get(shiftId) : void 0;
  if (!s || s.area_id !== areaId) throw new HttpError(400, "Ca kh\xF4ng thu\u1ED9c khu c\u1EE7a ph\xF2ng ban n\xE0y");
  return shiftId;
}
function manageableDept(db, actor, id) {
  const dept = getDept(db, id);
  if (!dept || !managesArea(actor, dept.areaId)) throw notFound("ph\xF2ng ban");
  return dept;
}
function nextDepartmentCode(db) {
  const codes = db.prepare("SELECT code FROM departments WHERE code GLOB 'PB[0-9]*'").all();
  const max = codes.reduce((m, { code }) => /^PB\d+$/.test(code) ? Math.max(m, Number(code.slice(2))) : m, 0);
  return `PB${String(max + 1).padStart(3, "0")}`;
}
function departmentRoutes(ctx) {
  const { db } = ctx;
  const r = Router4();
  r.get("/departments", (req, res) => {
    const actor = currentUser(req);
    const s = departmentScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), "d.area_id");
    const rows = db.prepare(`${DEPT_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY d.code`).all(...s.params, ...f.params);
    res.json({ departments: rows.map(mapDept) });
  });
  r.post("/departments", requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const given = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
    const code = given || nextDepartmentCode(db);
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!CODE_RE.test(code)) throw new HttpError(400, "M\xE3 ph\xF2ng ban kh\xF4ng h\u1EE3p l\u1EC7");
    if (!name) throw new HttpError(400, "T\xEAn ph\xF2ng ban l\xE0 b\u1EAFt bu\u1ED9c");
    const areaId = resolveAreaFor(db, actor, b.areaId);
    const shiftId = resolveDeptShift(db, b.shiftId, areaId);
    const managerId = resolveManager(db, actor, b.managerId);
    if (db.prepare("SELECT 1 FROM departments WHERE code = ?").get(code)) throw new HttpError(409, "M\xE3 ph\xF2ng ban \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("dep");
    db.prepare("INSERT INTO departments(id, code, name, description, manager_id, shift_id, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      code,
      name,
      typeof b.description === "string" ? b.description.trim() : "",
      managerId,
      shiftId,
      areaId,
      toVnDate(ctx.now())
    );
    enqueue(db, "department", id, "dept.create", { name, desc: typeof b.description === "string" ? b.description.trim() : "" }, ctx.now());
    kickEntity(ctx, "department", id);
    res.json({ department: getDept(db, id) });
  });
  r.put("/departments/:id", requireManager, (req, res) => {
    const actor = currentUser(req);
    const dept = manageableDept(db, actor, req.params.id);
    const b = req.body ?? {};
    const name = b.name === void 0 ? void 0 : typeof b.name === "string" ? b.name.trim() : "";
    if (name === "") throw new HttpError(400, "T\xEAn ph\xF2ng ban l\xE0 b\u1EAFt bu\u1ED9c");
    const areaId = b.areaId === void 0 ? void 0 : resolveAreaFor(db, actor, b.areaId);
    const areaAfter = areaId === void 0 ? dept.areaId : areaId;
    const shiftId = b.shiftId === void 0 ? void 0 : resolveDeptShift(db, b.shiftId, areaAfter);
    const managerId = b.managerId === void 0 ? void 0 : resolveManager(db, actor, b.managerId);
    tx(db, () => {
      if (name !== void 0) db.prepare("UPDATE departments SET name = ? WHERE id = ?").run(name, dept.id);
      if (b.description !== void 0) {
        db.prepare("UPDATE departments SET description = ? WHERE id = ?").run(typeof b.description === "string" ? b.description.trim() : "", dept.id);
      }
      if (shiftId !== void 0) db.prepare("UPDATE departments SET shift_id = ? WHERE id = ?").run(shiftId, dept.id);
      if (areaId !== void 0) db.prepare("UPDATE departments SET area_id = ? WHERE id = ?").run(areaId, dept.id);
      if (managerId !== void 0) db.prepare("UPDATE departments SET manager_id = ? WHERE id = ?").run(managerId, dept.id);
    });
    if (shiftId !== void 0 || areaId !== void 0) {
      const members = db.prepare("SELECT id FROM users WHERE department_id = ?").all(dept.id).map((x) => x.id);
      const { from, to } = monthToDate(ctx.now());
      recomputeUsers(db, members, from, to, ctx.now());
    }
    const after = getDept(db, dept.id);
    if (after.name !== dept.name || after.description !== dept.description) {
      enqueue(db, "department", dept.id, "dept.update", { name: after.name, desc: after.description }, ctx.now());
      kickEntity(ctx, "department", dept.id);
    }
    res.json({ department: getDept(db, dept.id) });
  });
  r.delete("/departments/:id", requireManager, (req, res) => {
    const actor = currentUser(req);
    const dept = manageableDept(db, actor, req.params.id);
    const backup = backupNow(db, ctx.config.backupDir, "pre-delete", ctx.now());
    const hanetDeptId = db.prepare("SELECT hanet_department_id FROM departments WHERE id = ?").get(dept.id).hanet_department_id;
    if (hanetDeptId) enqueue(db, "department", dept.id, "dept.remove", { hanetDepartmentId: hanetDeptId, name: dept.name }, ctx.now());
    else dropEntityJobs(db, "department", dept.id);
    db.prepare("DELETE FROM departments WHERE id = ?").run(dept.id);
    console.warn(`[SECURITY] department_deleted by=${actor.code} target=${dept.code} backup=${backup} ip=${req.ip}`);
    kickEntity(ctx, "department", dept.id);
    res.json({ success: true, backup });
  });
  return r;
}

// server/routes/shifts.ts
init_db();
init_errors();
import { Router as Router5 } from "express";
init_bootstrap();
init_shifts();
init_attendance();
init_vntime();
function usersOfShift(db, shiftId) {
  return db.prepare("SELECT u.id FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.code != ? AND (u.shift_id = ? OR d.shift_id = ?)").all(SYSTEM_ADMIN_CODE, shiftId, shiftId).map((r) => r.id);
}
function allStaffIds(db) {
  return db.prepare("SELECT id FROM users WHERE code != ?").all(SYSTEM_ADMIN_CODE).map((r) => r.id);
}
function shiftRoutes(ctx) {
  const { db } = ctx;
  const r = Router5();
  const recomputeMonth = (ids) => {
    const { from, to } = monthToDate(ctx.now());
    return recomputeUsers(db, ids, from, to, ctx.now());
  };
  r.get("/shifts", requireManager, (req, res) => {
    const actor = currentUser(req);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), "s.area_id");
    const scope = isGlobalHr(actor) ? { sql: "1=1", params: [] } : actor.areaIds.length ? { sql: `s.area_id IN (${actor.areaIds.map(() => "?").join(", ")})`, params: [...actor.areaIds] } : { sql: "0=1", params: [] };
    const rows = db.prepare(`${SHIFT_SELECT} WHERE ${scope.sql} AND ${f.sql} ORDER BY a.code, s.name`).all(...scope.params, ...f.params);
    res.json({ shifts: rows.map(mapShift) });
  });
  r.post("/shifts", requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const areaId = resolveAreaFor(db, actor, b.areaId);
    if (!areaId) throw new HttpError(400, "H\xE3y ch\u1ECDn khu v\u1EF1c cho ca");
    const s = validateShiftInput(b);
    if (db.prepare("SELECT 1 FROM shifts WHERE area_id = ? AND name = ?").get(areaId, s.name)) throw new HttpError(409, "Khu n\xE0y \u0111\xE3 c\xF3 ca c\xF9ng t\xEAn");
    const id = newId("shift");
    db.prepare(
      `INSERT INTO shifts(id, area_id, name, work_start, work_end, work_days, late_grace_minutes, early_arrival_minutes, early_leave_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, areaId, s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, toVnDate(ctx.now()));
    res.json({ shift: getShift(db, id) });
  });
  r.put("/shifts/:id", requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound("ca");
    const s = validateShiftInput({ ...cur, ...req.body ?? {} });
    const dup = db.prepare("SELECT id FROM shifts WHERE area_id = ? AND name = ?").get(cur.areaId, s.name);
    if (dup && dup.id !== cur.id) throw new HttpError(409, "Khu n\xE0y \u0111\xE3 c\xF3 ca c\xF9ng t\xEAn");
    db.prepare(
      `UPDATE shifts SET name = ?, work_start = ?, work_end = ?, work_days = ?, late_grace_minutes = ?, early_arrival_minutes = ?, early_leave_minutes = ? WHERE id = ?`
    ).run(s.name, s.workStart, s.workEnd, formatWorkDays(s.workDays), s.lateGraceMinutes, s.earlyArrivalMinutes, s.earlyLeaveMinutes, cur.id);
    const recomputed = recomputeMonth(usersOfShift(db, cur.id));
    res.json({ shift: getShift(db, cur.id), recomputed });
  });
  r.delete("/shifts/:id", requireManager, (req, res) => {
    const cur = getShift(db, req.params.id);
    if (!cur || !managesArea(currentUser(req), cur.areaId)) throw notFound("ca");
    if (cur.departmentCount > 0 || cur.userCount > 0) throw new HttpError(409, "Ca \u0111ang \u0111\u01B0\u1EE3c ph\xF2ng ban ho\u1EB7c nh\xE2n s\u1EF1 s\u1EED d\u1EE5ng");
    db.prepare("DELETE FROM shifts WHERE id = ?").run(cur.id);
    res.json({ success: true });
  });
  r.get("/holidays", (req, res) => {
    const year = typeof req.query.year === "string" && /^\d{4}$/.test(req.query.year) ? req.query.year : toVnDate(ctx.now()).slice(0, 4);
    const rows = db.prepare("SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date").all(`${year}-%`);
    res.json({ holidays: rows.map((h) => ({ date: h.date, name: h.name })) });
  });
  const recomputeDate = (date) => date <= toVnDate(ctx.now()) ? recomputeUsers(db, allStaffIds(db), date, date, ctx.now()) : 0;
  r.post("/holidays", requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const name = typeof b.name === "string" ? b.name.trim() : "";
    if (!isValidDate(b.date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    if (!name) throw new HttpError(400, "T\xEAn ng\xE0y l\u1EC5 l\xE0 b\u1EAFt bu\u1ED9c");
    if (db.prepare("SELECT 1 FROM holidays WHERE date = ?").get(b.date)) throw new HttpError(409, "Ng\xE0y n\xE0y \u0111\xE3 l\xE0 ng\xE0y l\u1EC5");
    db.prepare("INSERT INTO holidays(date, name) VALUES (?, ?)").run(b.date, name);
    res.json({ holiday: { date: b.date, name }, recomputed: recomputeDate(b.date) });
  });
  r.delete("/holidays/:date", requireGlobalHr, (req, res) => {
    const result = db.prepare("DELETE FROM holidays WHERE date = ?").run(req.params.date);
    if (Number(result.changes) === 0) throw notFound("ng\xE0y l\u1EC5");
    res.json({ success: true, recomputed: recomputeDate(req.params.date) });
  });
  return r;
}

// server/routes/cameras.ts
init_db();
init_errors();
import { Router as Router6 } from "express";

// server/cameras.ts
init_db();
init_hanet_api();
init_hanet();
async function importCameras(deps) {
  const { db } = deps;
  const placeId = getPlaceIds(db)[0];
  if (!placeId) return 0;
  const devices = await hanetApi.listDevices(deps, placeId);
  const exists = db.prepare("SELECT 1 FROM cameras WHERE device_key = ?");
  const insert = db.prepare(
    `INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, created_at) VALUES (?, ?, ?, ?, ?, '', '', ?)`
  );
  let added = 0;
  for (const d of devices) {
    const key = String(d.deviceID ?? "").trim();
    if (!key || exists.get(key)) continue;
    insert.run(newId("cam"), String(d.deviceName || key), key, Number(d.placeID) || placeId, String(d.placeName ?? ""), new Date(deps.now()).toISOString());
    added++;
  }
  return added;
}
async function refreshCameraStatus(deps) {
  const { db } = deps;
  const keys = db.prepare("SELECT device_key FROM cameras ORDER BY device_key").all().map((r) => r.device_key);
  if (keys.length === 0) return;
  const status = await hanetApi.connectionStatus(deps, keys);
  const now = deps.now();
  const update = db.prepare("UPDATE cameras SET online = ?, status_checked_at = ? WHERE device_key = ?");
  for (const k of keys) update.run(status[k] === true ? 1 : 0, now, k);
}

// server/routes/cameras.ts
init_hanet();
init_hanet_sync();
var CAMERA_SELECT = "SELECT c.*, ar.name AS area_name FROM cameras c LEFT JOIN areas ar ON ar.id = c.area_id";
function mapCamera(r) {
  return {
    id: r.id,
    name: r.name,
    deviceKey: r.device_key,
    placeId: r.place_id ?? null,
    placeName: r.place_name ?? "",
    location: r.location ?? "",
    ipAddress: r.ip_address ?? "",
    online: r.online === null || r.online === void 0 ? null : r.online === 1,
    statusCheckedAt: r.status_checked_at ?? null,
    areaId: r.area_id ?? null,
    areaName: r.area_name ?? null,
    createdAt: r.created_at
  };
}
function cameraRoutes(ctx) {
  const { db } = ctx;
  const r = Router6();
  const deps = { db, fetch: ctx.fetch, now: ctx.now };
  const listCameras = () => db.prepare(`${CAMERA_SELECT} ORDER BY c.name`).all().map(mapCamera);
  const requireHanet = () => {
    if (!reconcileEnabled(db)) throw new HttpError(400, "Ch\u01B0a c\u1EA5u h\xECnh k\u1EBFt n\u1ED1i Camera AI (Client ID, Refresh Token, \u0111\u1ECBa \u0111i\u1EC3m)");
  };
  r.get("/cameras", (req, res) => {
    const actor = currentUser(req);
    const s = cameraScopeSql(actor);
    const f = areaColumnSql(parseAreaFilter(db, actor, req.query.area), "c.area_id");
    const rows = db.prepare(`${CAMERA_SELECT} WHERE ${s.sql} AND ${f.sql} ORDER BY c.name`).all(...s.params, ...f.params);
    res.json({ cameras: rows.map(mapCamera) });
  });
  r.post("/cameras", requireGlobalHr, (req, res) => {
    const b = req.body ?? {};
    const text2 = (v) => typeof v === "string" ? v.trim() : "";
    const name = text2(b.name);
    const deviceKey = text2(b.deviceKey);
    if (!name || !deviceKey) throw new HttpError(400, "T\xEAn camera v\xE0 m\xE3 thi\u1EBFt b\u1ECB l\xE0 b\u1EAFt bu\u1ED9c");
    const placeId = b.placeId === void 0 || b.placeId === "" || b.placeId === null ? null : Number(b.placeId);
    if (placeId !== null && (!Number.isInteger(placeId) || placeId <= 0)) throw new HttpError(400, "Place ID kh\xF4ng h\u1EE3p l\u1EC7");
    const areaId = resolveAreaFor(db, currentUser(req), b.areaId);
    if (db.prepare("SELECT 1 FROM cameras WHERE device_key = ?").get(deviceKey)) throw new HttpError(409, "M\xE3 thi\u1EBFt b\u1ECB \u0111\xE3 t\u1ED3n t\u1EA1i");
    const id = newId("cam");
    db.prepare(
      "INSERT INTO cameras(id, name, device_key, place_id, place_name, location, ip_address, area_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(id, name, deviceKey, placeId, text2(b.placeName), text2(b.location), text2(b.ipAddress), areaId, new Date(ctx.now()).toISOString());
    res.json({ camera: mapCamera(db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(id)) });
  });
  r.post(
    "/cameras/import",
    requireGlobalHr,
    ah(async (_req, res) => {
      requireHanet();
      let added;
      try {
        added = await importCameras(deps);
      } catch (err) {
        throw new HttpError(502, `Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c danh s\xE1ch camera t\u1EEB Camera AI: ${err.message}`);
      }
      res.json({ added, cameras: listCameras() });
    })
  );
  r.post(
    "/cameras/refresh-status",
    requireGlobalHr,
    ah(async (_req, res) => {
      requireHanet();
      try {
        await refreshCameraStatus(deps);
      } catch (err) {
        throw new HttpError(502, `Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c tr\u1EA1ng th\xE1i camera t\u1EEB Camera AI: ${err.message}`);
      }
      res.json({ cameras: listCameras() });
    })
  );
  r.put("/cameras/:id", requireManager, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(req.params.id);
    if (!row || !managesArea(actor, row.area_id ?? null)) throw notFound("camera");
    const b = req.body ?? {};
    const text2 = (v) => typeof v === "string" ? v.trim() : "";
    const name = b.name === void 0 ? row.name : text2(b.name);
    if (!name) throw new HttpError(400, "T\xEAn camera l\xE0 b\u1EAFt bu\u1ED9c");
    const areaId = b.areaId === void 0 ? row.area_id ?? null : resolveAreaFor(db, actor, b.areaId);
    db.prepare("UPDATE cameras SET name = ?, location = ?, ip_address = ?, area_id = ? WHERE id = ?").run(
      name,
      b.location === void 0 ? row.location : text2(b.location),
      b.ipAddress === void 0 ? row.ip_address : text2(b.ipAddress),
      areaId,
      row.id
    );
    if (name !== row.name) {
      enqueue(db, "camera", row.id, "camera.rename", { deviceId: row.device_key, name }, ctx.now());
      kickEntity(ctx, "camera", row.id);
    }
    res.json({ camera: mapCamera(db.prepare(`${CAMERA_SELECT} WHERE c.id = ?`).get(row.id)) });
  });
  r.delete("/cameras/:id", requireManager, (req, res) => {
    const row = db.prepare("SELECT id, area_id FROM cameras WHERE id = ?").get(req.params.id);
    if (!row || !managesArea(currentUser(req), row.area_id)) throw notFound("camera");
    db.prepare("DELETE FROM cameras WHERE id = ?").run(row.id);
    dropEntityJobs(db, "camera", row.id);
    res.json({ success: true });
  });
  return r;
}

// server/routes/attendance.ts
init_errors();
import { Router as Router7 } from "express";
init_auth();
init_attendance();
init_bootstrap();

// server/hanet-connect.ts
init_errors();
init_hanet_api();
init_settings();
var CONNECT_BASE = "https://connect.hanet.ai";
var EMAIL_KEY = "hanet.connect_email";
var PASSWORD_KEY = "hanet.connect_password";
var VIDEO_NOT_CONFIGURED = "Ch\u01B0a c\u1EA5u h\xECnh t\xE0i kho\u1EA3n xem video (tab C\u1EA5u h\xECnh)";
var VIDEO_LOGIN_FAILED = "\u0110\u0103ng nh\u1EADp t\xE0i kho\u1EA3n xem video th\u1EA5t b\u1EA1i, ki\u1EC3m tra email/m\u1EADt kh\u1EA9u";
var VIDEO_NOT_FOUND = "Kh\xF4ng c\xF3 video ghi l\u1EA1i v\xE0o th\u1EDDi \u0111i\u1EC3m n\xE0y";
var VIDEO_UNAVAILABLE = "Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c video, th\u1EED l\u1EA1i sau";
var notConfigured = () => new HttpError(400, VIDEO_NOT_CONFIGURED);
var loginFailed = () => new HttpError(502, VIDEO_LOGIN_FAILED);
var unavailable = () => new HttpError(502, VIDEO_UNAVAILABLE);
function getConnectConfig(db) {
  return { email: getSetting(db, EMAIL_KEY) ?? null, hasPassword: Boolean(getSetting(db, PASSWORD_KEY)) };
}
function saveConnectConfig(db, input) {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (input.email !== void 0 && input.email !== null && typeof input.email !== "string") throw new HttpError(400, "Email kh\xF4ng h\u1EE3p l\u1EC7");
  if (input.password !== void 0 && input.password !== null && typeof input.password !== "string") throw new HttpError(400, "M\u1EADt kh\u1EA9u kh\xF4ng h\u1EE3p l\u1EC7");
  if (!email) {
    deleteSetting(db, EMAIL_KEY);
    deleteSetting(db, PASSWORD_KEY);
  } else {
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new HttpError(400, "Email kh\xF4ng h\u1EE3p l\u1EC7");
    setSetting(db, EMAIL_KEY, email);
    if (password) setSetting(db, PASSWORD_KEY, password);
  }
  clearConnectSession(db);
  return getConnectConfig(db);
}
var sessions = /* @__PURE__ */ new WeakMap();
var logins = /* @__PURE__ */ new WeakMap();
function clearConnectSession(db) {
  sessions.delete(db);
  logins.delete(db);
}
function readCookies(res, into) {
  for (const line of res.headers.getSetCookie()) {
    const pair = line.split(";", 1)[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value) into.set(name, value);
    else into.delete(name);
  }
  return into;
}
var cookieHeader = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
var hasSessionToken = (jar) => [...jar.keys()].some((k) => /(authjs|next-auth)\.session-token/.test(k));
async function doLogin(deps) {
  const email = getSetting(deps.db, EMAIL_KEY);
  const password = getSetting(deps.db, PASSWORD_KEY);
  if (!email || !password) throw notConfigured();
  const jar = /* @__PURE__ */ new Map();
  let res;
  try {
    const csrfRes = await deps.fetch(`${CONNECT_BASE}/api/auth/csrf`, { redirect: "manual", signal: AbortSignal.timeout(HANET_TIMEOUT_MS) });
    if (!csrfRes.ok) throw unavailable();
    const csrfToken = (await csrfRes.json())?.csrfToken;
    if (typeof csrfToken !== "string" || !csrfToken) throw unavailable();
    readCookies(csrfRes, jar);
    res = await deps.fetch(`${CONNECT_BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(jar) },
      body: new URLSearchParams({ csrfToken, username: email, password, json: "true" }).toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(HANET_TIMEOUT_MS)
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unavailable();
  }
  readCookies(res, jar);
  if (hasSessionToken(jar)) return jar;
  if (res.status >= 500) throw unavailable();
  throw loginFailed();
}
function ensureSession(deps) {
  const { db } = deps;
  const current = sessions.get(db);
  if (current) return Promise.resolve(current);
  const pending = logins.get(db);
  if (pending) return pending;
  const p = doLogin(deps).then((jar) => {
    if (logins.get(db) === p) sessions.set(db, jar);
    return jar;
  }).finally(() => {
    if (logins.get(db) === p) logins.delete(db);
  });
  logins.set(db, p);
  return p;
}
function parseClip(body) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const d = b.data && typeof b.data === "object" && !Array.isArray(b.data) ? b.data : b;
  const url = typeof d.file === "string" && /^https:\/\//.test(d.file) ? d.file : null;
  let startTs = Number(d.timestamp);
  if (!url || !Number.isFinite(startTs) || startTs <= 0) return null;
  if (startTs < 1e12) startTs = Math.round(startTs * 1e3);
  const duration = Number(d.duration);
  return {
    url,
    startTs,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 60,
    deviceName: typeof d.device_name === "string" && d.device_name.trim() ? d.device_name.trim() : null
  };
}
async function getVideoAt(deps, deviceId, ts) {
  const { db } = deps;
  if (!getSetting(db, EMAIL_KEY) || !getSetting(db, PASSWORD_KEY)) throw notConfigured();
  for (let attempt = 0; ; attempt++) {
    const jar = await ensureSession(deps);
    let res;
    let body = null;
    try {
      res = await deps.fetch(`${CONNECT_BASE}/api/video/get`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieHeader(jar) },
        body: JSON.stringify({ device_id: deviceId, timestamp: ts }),
        redirect: "manual",
        signal: AbortSignal.timeout(HANET_TIMEOUT_MS)
      });
      body = await res.json().catch(() => null);
    } catch {
      throw unavailable();
    }
    if (res.status === 401) {
      if (sessions.get(db) === jar) sessions.delete(db);
      if (attempt === 0) continue;
      throw loginFailed();
    }
    readCookies(res, jar);
    const clip = res.ok ? parseClip(body) : null;
    if (clip) return clip;
    const code = body && typeof body === "object" ? body.error_code : void 0;
    if (typeof code === "string" && code.startsWith("VIDEO_") || res.ok && body && typeof body === "object") {
      throw new HttpError(404, VIDEO_NOT_FOUND);
    }
    throw unavailable();
  }
}
async function testConnectLogin(deps) {
  clearConnectSession(deps.db);
  try {
    await ensureSession(deps);
    return { ok: true, message: `\u0110\u0103ng nh\u1EADp th\xE0nh c\xF4ng b\u1EB1ng ${getSetting(deps.db, EMAIL_KEY)}` };
  } catch (err) {
    return { ok: false, message: err instanceof HttpError ? err.message : VIDEO_UNAVAILABLE };
  }
}

// server/routes/attendance.ts
init_shifts();
init_vntime();
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
    firstIn: r.first_in ?? null,
    lastOut: r.last_out ?? null,
    lateMinutes: r.late_minutes,
    earlyMinutes: r.early_minutes,
    earlyArrivalMinutes: r.early_arrival_minutes ?? 0,
    status: r.status,
    final: r.final === 1,
    lateExcused: r.late_excused === 1,
    manualIn: r.manual_in ?? null,
    manualOut: r.manual_out ?? null,
    detectionCount: r.detection_count
  };
}
var MAX_RECOMPUTE_DAYS = 92;
var MAX_VIDEO_DRIFT_MS = 24 * 36e5;
var DETAIL_FILTER = {
  total: "1 = 1",
  present: "a.first_in IS NOT NULL",
  on_time: "a.first_in IS NOT NULL AND a.late_minutes = 0 AND a.status NOT IN ('leave', 'business_trip')",
  late: "a.late_minutes > 0",
  missing_out: "a.status = 'missing_out'",
  not_checked_in: "a.user_id IS NULL",
  absent: "a.status = 'absent'",
  leave: "a.status = 'leave'",
  business_trip: "a.status = 'business_trip'",
  early_arrival: "a.early_arrival_minutes > 0"
};
function denySee(viewer) {
  return viewer.role === "area_admin" ? notFound("nh\xE2n s\u1EF1") : new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n xem d\u1EEF li\u1EC7u n\xE0y");
}
function attendanceRoutes(ctx) {
  const { db } = ctx;
  const r = Router7();
  r.get("/attendance", (req, res) => {
    const user = currentUser(req);
    const date = req.query.date === void 0 || req.query.date === "" ? toVnDate(ctx.now()) : req.query.date;
    if (!isValidDate(date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const w = scopeWhere(scopeFor(user), "u.id", "u.department_id");
    const f = areaFilterSql(parseAreaFilter(db, user, req.query.area), "u.department_id");
    let sql = `${DAY_SELECT} WHERE a.work_date = ? AND ${w.sql} AND ${f.sql}`;
    const params = [date, ...w.params, ...f.params];
    const departmentId = req.query.departmentId;
    if ((user.role === "hr" || user.role === "area_admin") && typeof departmentId === "string" && departmentId) {
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
    const viewer = currentUser(req);
    const target = getUser(db, req.params.userId);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y nh\xE2n s\u1EF1");
    if (!canSeeUser(viewer, target)) throw denySee(viewer);
    if (!isValidDate(req.params.date)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const rows = db.prepare("SELECT id, device_id, device_name, place_id, ts, work_date, image_url, source FROM detections WHERE user_id = ? AND work_date = ? ORDER BY ts").all(target.id, req.params.date);
    const canWatch = viewer.role === "hr" || viewer.role === "area_admin" || viewer.role === "dept_manager";
    const detections = rows.map((x) => ({
      id: x.id,
      deviceId: x.device_id,
      deviceName: x.device_name ?? null,
      placeId: x.place_id ?? null,
      ts: x.ts,
      imageUrl: x.image_url ?? null,
      source: x.source,
      hasVideo: canWatch && x.source !== "simulator"
    }));
    res.json({ detections });
  });
  r.get(
    "/detections/:id/video",
    requireRole("hr", "area_admin", "dept_manager"),
    ah(async (req, res) => {
      const det = db.prepare("SELECT user_id, device_id, ts, source FROM detections WHERE id = ?").get(Number(req.params.id) || 0);
      if (!det) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y l\u01B0\u1EE3t nh\u1EADn di\u1EC7n");
      const target = getUser(db, det.user_id);
      if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y l\u01B0\u1EE3t nh\u1EADn di\u1EC7n");
      const viewer = currentUser(req);
      if (!canSeeUser(viewer, target)) throw denySee(viewer);
      if (det.source === "simulator") throw new HttpError(404, "L\u01B0\u1EE3t m\xF4 ph\u1ECFng kh\xF4ng c\xF3 video");
      let at = det.ts;
      if (req.query.at !== void 0) {
        at = Number(req.query.at);
        if (!Number.isInteger(at) || at <= 0) throw new HttpError(400, "Th\u1EDDi \u0111i\u1EC3m xem video kh\xF4ng h\u1EE3p l\u1EC7");
        if (Math.abs(at - det.ts) > MAX_VIDEO_DRIFT_MS) throw new HttpError(400, "Ch\u1EC9 xem \u0111\u01B0\u1EE3c video trong v\xF2ng 24 gi\u1EDD quanh l\u01B0\u1EE3t qu\u1EB9t");
      }
      const clip = await getVideoAt({ db, fetch: ctx.fetch, now: ctx.now }, det.device_id, at);
      const body = {
        url: clip.url,
        startTs: clip.startTs,
        duration: clip.duration,
        offsetSeconds: Math.min(Math.max((at - clip.startTs) / 1e3, 0), clip.duration),
        deviceName: clip.deviceName,
        // Làm tròn: duration lẻ từ Hanet không được làm ?at= của nút đoạn trước/sau bị từ chối (400)
        prevAt: Math.round(clip.startTs - 1e3),
        nextAt: Math.round(clip.startTs + clip.duration * 1e3 + 1e3)
      };
      res.json(body);
    })
  );
  r.post("/attendance/recompute", requireGlobalHr, (req, res) => {
    const { from, to } = req.body ?? {};
    if (!isValidDate(from) || !isValidDate(to)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    const span = daysBetween(from, to);
    if (span < 0) throw new HttpError(400, "Ng\xE0y b\u1EAFt \u0111\u1EA7u ph\u1EA3i tr\u01B0\u1EDBc ng\xE0y k\u1EBFt th\xFAc");
    if (span >= MAX_RECOMPUTE_DAYS) throw new HttpError(400, `M\u1ED7i l\u1EA7n ch\u1EC9 t\xEDnh l\u1EA1i t\u1ED1i \u0111a ${MAX_RECOMPUTE_DAYS} ng\xE0y`);
    res.json({ updated: recomputeRange(db, from, to) });
  });
  r.get("/stats", (req, res) => {
    const actor = currentUser(req);
    const filter = parseAreaFilter(db, actor, req.query.area);
    const w = scopeWhere(scopeFor(actor), "u.id", "u.department_id");
    const f = areaFilterSql(filter, "u.department_id");
    const where = `${w.sql} AND ${f.sql}`;
    const params = [...w.params, ...f.params];
    const date = toVnDate(ctx.now());
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`).get(...params);
    const day = db.prepare(
      `SELECT
           SUM(CASE WHEN a.first_in IS NOT NULL THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN ${DETAIL_FILTER.on_time} THEN 1 ELSE 0 END) AS on_time,
           SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS late,
           SUM(CASE WHEN a.status = 'missing_out' THEN 1 ELSE 0 END) AS missing_out,
           SUM(CASE WHEN a.early_arrival_minutes > 0 THEN 1 ELSE 0 END) AS early_arrival,
           SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent,
           SUM(CASE WHEN a.status = 'leave' THEN 1 ELSE 0 END) AS leave,
           SUM(CASE WHEN a.status = 'business_trip' THEN 1 ELSE 0 END) AS business_trip
         FROM attendance_days a JOIN users u ON u.id = a.user_id
         WHERE a.work_date = ? AND u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where}`
    ).get(date, ...params);
    const noRow = db.prepare(
      `SELECT u.id FROM users u LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
           WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${where} AND a.user_id IS NULL`
    ).all(date, ...params).map((r2) => r2.id);
    const notCheckedIn = noRow.filter((id) => isWorkday(db, effectiveShift(db, id), date)).length;
    const pending = db.prepare(`SELECT COUNT(*) AS c FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' AND ${where}`).get(...params);
    const cs = cameraScopeSql(actor);
    const cf = areaColumnSql(filter, "c.area_id");
    const cameras = db.prepare(`SELECT COUNT(*) AS c FROM cameras c WHERE ${cs.sql} AND ${cf.sql}`).get(...cs.params, ...cf.params);
    const body = {
      date,
      totalEmployees: total.c,
      presentCount: day.present ?? 0,
      onTimeCount: day.on_time ?? 0,
      lateCount: day.late ?? 0,
      missingOutCount: day.missing_out ?? 0,
      earlyArrivalCount: day.early_arrival ?? 0,
      absentCount: day.absent ?? 0,
      leaveCount: day.leave ?? 0,
      businessTripCount: day.business_trip ?? 0,
      notCheckedInCount: notCheckedIn,
      pendingRequests: pending.c,
      totalCameras: cameras.c
    };
    res.json(body);
  });
  r.get("/stats/details", (req, res) => {
    const type = req.query.type;
    if (typeof type !== "string" || !Object.hasOwn(DETAIL_FILTER, type)) throw new HttpError(400, "Lo\u1EA1i th\u1ED1ng k\xEA kh\xF4ng h\u1EE3p l\u1EC7");
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), "u.id", "u.department_id");
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), "u.department_id");
    const date = toVnDate(ctx.now());
    let rows = db.prepare(
      `SELECT u.id, u.code, u.name, d.name AS department_name, a.first_in, a.last_out, a.late_minutes, a.early_minutes, a.early_arrival_minutes, a.status, a.final
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         LEFT JOIN attendance_days a ON a.user_id = u.id AND a.work_date = ?
         WHERE u.status = 'active' AND ${NOT_SYSTEM_ADMIN} AND ${w.sql} AND ${f.sql} AND ${DETAIL_FILTER[type]}
         ORDER BY a.first_in IS NULL, a.first_in, u.code`
    ).all(date, ...w.params, ...f.params);
    if (type === "not_checked_in") {
      rows = rows.filter((x) => isWorkday(db, effectiveShift(db, x.id), date));
    }
    const out = rows.map((x) => ({
      userId: x.id,
      employeeCode: x.code,
      employeeName: x.name,
      departmentName: x.department_name ?? null,
      firstIn: x.first_in ?? null,
      lastOut: x.last_out ?? null,
      lateMinutes: x.late_minutes ?? 0,
      earlyArrivalMinutes: x.early_arrival_minutes ?? 0,
      earlyMinutes: x.early_minutes ?? 0,
      status: x.status ?? null,
      final: x.final === 1
    }));
    res.json({ date, type, rows: out });
  });
  return r;
}

// server/routes/settings.ts
import { Router as Router8 } from "express";
init_settings();
init_attendance();
function settingsRoutes(ctx) {
  const { db } = ctx;
  const r = Router8();
  r.get("/settings/work", requireGlobalHr, (_req, res) => {
    res.json({ settings: getWorkSettings(db) });
  });
  r.put("/settings/work", requireGlobalHr, (req, res) => {
    saveWorkSettings(db, validateWorkSettings(req.body));
    const { from, to } = monthToDate(ctx.now());
    const recomputed = recomputeUsers(db, allStaffIds(db), from, to, ctx.now());
    res.json({ settings: getWorkSettings(db), recomputed });
  });
  return r;
}

// server/routes/mail.ts
init_errors();
import { Router as Router9 } from "express";
function mailRoutes(ctx) {
  const { db } = ctx;
  const r = Router9();
  r.get("/settings/mail", requireGlobalHr, (_req, res) => {
    res.json(getMailConfigView(db, ctx.now()));
  });
  r.put("/settings/mail", requireSystemAdmin, (req, res) => {
    saveMailConfig(db, req.body);
    res.json(getMailConfigView(db, ctx.now()));
  });
  r.post(
    "/settings/mail/test",
    requireSystemAdmin,
    ah(async (req, res) => {
      const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, "Email nh\u1EADn th\u01B0 th\u1EED kh\xF4ng h\u1EE3p l\u1EC7");
      const cfg = getSmtpConfig(db);
      if (!cfg) {
        res.json({ ok: false, message: "Ch\u01B0a c\u1EA5u h\xECnh \u0111\u1EE7 m\xE1y ch\u1EE7, t\xE0i kho\u1EA3n, m\u1EADt kh\u1EA9u v\xE0 email ng\u01B0\u1EDDi g\u1EEDi" });
        return;
      }
      try {
        await ctx.sendMail(cfg, testMail(to));
        res.json({ ok: true, message: `\u0110\xE3 g\u1EEDi th\u01B0 th\u1EED t\u1EDBi ${to}` });
      } catch (err) {
        res.json({ ok: false, message: classifyMailError(err).message });
      }
    })
  );
  return r;
}

// server/routes/requests.ts
init_db();
init_errors();
import { Router as Router10 } from "express";
init_auth();
init_attendance();
init_vntime();
var TYPES = ["missed_punch", "late_explanation", "leave_request", "business_trip"];
var LEAVE_TYPES = ["leave_request", "business_trip"];
var MAX_LEAVE_DAYS = 31;
var MAX_LEAVE_AHEAD_DAYS = 7;
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
    endDate: r.end_date ?? null,
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
  const r = Router10();
  r.get("/requests", (req, res) => {
    const actor = currentUser(req);
    const w = scopeWhere(scopeFor(actor), "u.id", "u.department_id");
    const f = areaFilterSql(parseAreaFilter(db, actor, req.query.area), "u.department_id");
    const rows = db.prepare(`${REQUEST_SELECT} WHERE ${w.sql} AND ${f.sql} ORDER BY r.created_at DESC`).all(...w.params, ...f.params);
    res.json({ requests: rows.map(mapRequest) });
  });
  r.post("/requests", (req, res) => {
    const user = currentUser(req);
    const b = req.body ?? {};
    if (!isValidDate(b.workDate)) throw new HttpError(400, "Ng\xE0y kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
    if (!TYPES.includes(b.type)) throw new HttpError(400, "Lo\u1EA1i \u0111\u01A1n kh\xF4ng h\u1EE3p l\u1EC7");
    const today = toVnDate(ctx.now());
    const isLeave = LEAVE_TYPES.includes(b.type);
    let endDate = null;
    if (isLeave) {
      if (b.endDate !== void 0 && b.endDate !== null && b.endDate !== "") {
        if (!isValidDate(b.endDate)) throw new HttpError(400, "Ng\xE0y k\u1EBFt th\xFAc kh\xF4ng h\u1EE3p l\u1EC7 (\u0111\u1ECBnh d\u1EA1ng YYYY-MM-DD)");
        if (b.endDate < b.workDate) throw new HttpError(400, "Ng\xE0y k\u1EBFt th\xFAc ph\u1EA3i t\u1EEB ng\xE0y b\u1EAFt \u0111\u1EA7u tr\u1EDF \u0111i");
        if (daysBetween(b.workDate, b.endDate) >= MAX_LEAVE_DAYS) throw new HttpError(400, `M\u1ED7i \u0111\u01A1n t\u1ED1i \u0111a ${MAX_LEAVE_DAYS} ng\xE0y`);
        endDate = b.endDate === b.workDate ? null : b.endDate;
      }
      if (daysBetween(today, b.workDate) > MAX_LEAVE_AHEAD_DAYS) throw new HttpError(400, `Ch\u1EC9 g\u1EEDi \u0111\u01A1n tr\u01B0\u1EDBc t\u1ED1i \u0111a ${MAX_LEAVE_AHEAD_DAYS} ng\xE0y`);
    } else {
      if (b.endDate !== void 0 && b.endDate !== null && b.endDate !== "") throw new HttpError(400, "Ch\u1EC9 \u0111\u01A1n ngh\u1EC9 ph\xE9p v\xE0 c\xF4ng t\xE1c m\u1EDBi ch\u1ECDn kho\u1EA3ng ng\xE0y");
      if (b.workDate > today) throw new HttpError(400, "Kh\xF4ng th\u1EC3 g\u1EEDi \u0111\u01A1n cho ng\xE0y trong t\u01B0\u01A1ng lai");
    }
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
      `INSERT INTO requests(id, user_id, work_date, end_date, type, reason, suggested_in, suggested_out, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, user.id, b.workDate, endDate, b.type, reason, suggestedIn, suggestedOut, new Date(ctx.now()).toISOString());
    res.json({ request: getRequest(db, id) });
  });
  r.put("/requests/:id", requireRole("hr", "area_admin", "dept_manager"), (req, res) => {
    const reviewer = currentUser(req);
    const target = getRequest(db, req.params.id);
    if (!target) throw new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n");
    if (reviewer.role === "area_admin" && !managesArea(reviewer, target.departmentId ? deptAreaId(db, target.departmentId) ?? null : null)) {
      throw notFound("\u0111\u01A1n");
    }
    if (reviewer.role === "area_admin") {
      const owner = db.prepare("SELECT role FROM users WHERE id = ?").get(target.userId);
      if (!owner || owner.role !== "employee" && owner.role !== "dept_manager") {
        throw new HttpError(403, "B\u1EA1n kh\xF4ng c\xF3 quy\u1EC1n duy\u1EC7t \u0111\u01A1n c\u1EE7a t\xE0i kho\u1EA3n n\xE0y");
      }
    }
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
      } else if (LEAVE_TYPES.includes(target.type)) {
        const to = target.endDate ?? target.workDate;
        const overlap = db.prepare(
          `SELECT 1 FROM requests WHERE user_id = ? AND id != ? AND status = 'approved' AND type IN ('leave_request', 'business_trip')
             AND work_date <= ? AND COALESCE(end_date, work_date) >= ?`
        ).get(target.userId, target.id, to, target.workDate);
        if (overlap) throw new HttpError(409, "Kho\u1EA3ng ng\xE0y tr\xF9ng v\u1EDBi \u0111\u01A1n \u0111\xE3 duy\u1EC7t");
        recomputeUsers(db, [target.userId], target.workDate, to, ctx.now());
      }
    });
    res.json({ request: getRequest(db, target.id) });
  });
  return r;
}

// server/routes/hanet.ts
init_errors();
import { Router as Router11 } from "express";
init_auth();
init_hanet();
init_hanet_api();
init_settings();
init_vntime();
init_hanet_sync();
function hanetPublicRoutes(ctx) {
  const { db } = ctx;
  const r = Router11();
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
      const stranger = parseStranger(req.body, now);
      if (stranger) {
        recordSighting(db, { kind: "stranger", personId: null, aliasId: null, personName: null, ...stranger }, now);
        logWebhook(db, { status: "ignored", deviceName: stranger.deviceName, message: STRANGER_MESSAGE, rawPayload: req.body }, now);
      } else {
        logWebhook(db, { status: "ignored", message: "Kh\xF4ng ph\u1EA3i s\u1EF1 ki\u1EC7n nh\u1EADn di\u1EC7n", rawPayload: req.body }, now);
      }
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
    if (result.status === "ignored" && result.message === UNMATCHED_MESSAGE && parsed.input.imageUrl) {
      const i = parsed.input;
      recordSighting(
        db,
        { kind: "unlinked", personId: i.personId, aliasId: i.aliasId, personName: i.personName, deviceId: i.deviceId, deviceName: i.deviceName, ts: i.ts, imageUrl: i.imageUrl },
        now
      );
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
function syncEntityInScope(db, actor, type, id) {
  if (isGlobalHr(actor)) return true;
  if (type === "user") {
    const u = getUser(db, id);
    return Boolean(u) && managesArea(actor, u.areaId);
  }
  if (type === "department") {
    const area = deptAreaId(db, id);
    return area !== void 0 && managesArea(actor, area);
  }
  const cam = db.prepare("SELECT area_id FROM cameras WHERE id = ?").get(id);
  return Boolean(cam) && managesArea(actor, cam.area_id);
}
function hanetRoutes(ctx) {
  const { db } = ctx;
  const r = Router11();
  r.get("/hanet/config", requireGlobalHr, (req, res) => {
    const config = getHanetConfigView(db);
    if (!isSystemAdmin(currentUser(req))) config.webhookPath = config.webhookPath.replace(/[^/]+$/, (t) => `\u2022\u2022\u2022\u2022${t.slice(-4)}`);
    res.json({ config });
  });
  r.put("/hanet/config", requireSystemAdmin, (req, res) => {
    updateHanetConfig(db, req.body);
    kickAll(ctx);
    res.json({ config: getHanetConfigView(db) });
  });
  r.post(
    "/hanet/test-connection",
    requireSystemAdmin,
    ah(async (_req, res) => {
      const fail = (message) => ({ ok: false, account: null, places: [], message });
      if (!getSetting(db, "hanet.client_id") || !(getSetting(db, "hanet.refresh_token") || getSetting(db, "hanet.access_token"))) {
        res.json(fail("Ch\u01B0a nh\u1EADp Client ID v\xE0 Refresh Token (ho\u1EB7c Access Token)"));
        return;
      }
      const deps = { db, fetch: ctx.fetch, now: ctx.now };
      try {
        const account = await hanetApi.getProfile(deps);
        const places = await hanetApi.getPlaces(deps);
        const body = {
          ok: true,
          account,
          places,
          message: `\u0110\xE3 k\u1EBFt n\u1ED1i t\xE0i kho\u1EA3n ${account.name || account.email}, ${places.length} \u0111\u1ECBa \u0111i\u1EC3m`
        };
        res.json(body);
      } catch (err) {
        res.json(fail(err.message));
      }
    })
  );
  r.get("/hanet/connect", requireGlobalHr, (_req, res) => {
    res.json(getConnectConfig(db));
  });
  r.put("/hanet/connect", requireSystemAdmin, (req, res) => {
    const b = req.body ?? {};
    res.json(saveConnectConfig(db, { email: b.email, password: b.password }));
  });
  r.post(
    "/hanet/connect/test",
    requireSystemAdmin,
    ah(async (_req, res) => {
      res.json(await testConnectLogin({ db, fetch: ctx.fetch, now: ctx.now }));
    })
  );
  r.post("/hanet/webhook-token/rotate", requireSystemAdmin, (req, res) => {
    rotateWebhookToken(db);
    console.warn(`[SECURITY] webhook_token_rotated by=${currentUser(req).code} ip=${req.ip}`);
    res.json({ config: getHanetConfigView(db) });
  });
  r.get("/hanet/sightings", requireManager, (req, res) => {
    const actor = currentUser(req);
    const kind = req.query.kind;
    if (kind !== void 0 && kind !== "stranger" && kind !== "unlinked") throw new HttpError(400, "Lo\u1EA1i l\u01B0\u1EE3t ch\u1EE5p kh\xF4ng h\u1EE3p l\u1EC7");
    const all = listSightings(db, ctx.now(), kind);
    const sightings = isGlobalHr(actor) ? all : all.filter((s) => managesArea(actor, deviceAreaId(db, s.deviceId)));
    res.json({ sightings });
  });
  r.get(
    "/hanet/persons/unlinked",
    requireManager,
    ah(async (_req, res) => {
      const placeId = getPlaceIds(db)[0];
      if (!reconcileEnabled(db) || !placeId) throw new HttpError(400, "Ch\u01B0a c\u1EA5u h\xECnh k\u1EBFt n\u1ED1i Camera AI (Client ID, Refresh Token, \u0111\u1ECBa \u0111i\u1EC3m)");
      let persons;
      try {
        persons = await fetchAllPersons({ db, fetch: ctx.fetch, now: ctx.now }, placeId);
      } catch (err) {
        throw new HttpError(502, `Kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c danh s\xE1ch ng\u01B0\u1EDDi t\u1EEB Camera AI: ${err.message}`);
      }
      res.json({ persons: unlinkedPersons(db, persons) });
    })
  );
  r.get("/hanet/sync", requireGlobalHr, (_req, res) => {
    res.json(syncSummary(db));
  });
  r.post("/hanet/sync/retry", requireManager, (req, res) => {
    const actor = currentUser(req);
    const b = req.body ?? {};
    const filter = {};
    if (b.jobId !== void 0) {
      if (!Number.isInteger(Number(b.jobId))) throw new HttpError(400, "M\xE3 vi\u1EC7c kh\xF4ng h\u1EE3p l\u1EC7");
      filter.jobId = Number(b.jobId);
    }
    if (b.entityType !== void 0 || b.entityId !== void 0) {
      if (!["user", "department", "camera"].includes(b.entityType) || typeof b.entityId !== "string") throw new HttpError(400, "\u0110\u1ED1i t\u01B0\u1EE3ng kh\xF4ng h\u1EE3p l\u1EC7");
      filter.entityType = b.entityType;
      filter.entityId = b.entityId;
    }
    if (filter.entityType === void 0) {
      if (!isSystemAdmin(actor)) throw new HttpError(403, "Ch\u1EC9 t\xE0i kho\u1EA3n ADMIN \u0111\u01B0\u1EE3c \u0111\u1ED3ng b\u1ED9 l\u1EA1i to\xE0n b\u1ED9");
    } else if (!syncEntityInScope(db, actor, filter.entityType, filter.entityId)) {
      throw notFound("\u0111\u1ED1i t\u01B0\u1EE3ng");
    }
    retryJobs(db, filter, ctx.now());
    kickAll(ctx);
    res.json(isGlobalHr(actor) ? syncSummary(db) : { success: true });
  });
  r.get("/hanet/webhook-logs", requireGlobalHr, (_req, res) => {
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
  r.post("/hanet/simulate", requireGlobalHr, (req, res) => {
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
    requireSystemAdmin,
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
init_db();
init_errors();
import { Router as Router12 } from "express";
init_auth();
init_backup();
function adminRoutes(ctx) {
  const { db } = ctx;
  const dir = ctx.config.backupDir;
  const r = Router12();
  r.get("/admin/backups", requireGlobalHr, (_req, res) => {
    res.json({ backups: listBackups(dir) });
  });
  r.post("/admin/backups", requireSystemAdmin, (_req, res) => {
    res.json({ backup: backupNow(db, dir, "manual", ctx.now()) });
  });
  r.get("/admin/backups/latest", requireSystemAdmin, (_req, res) => {
    const file = latestBackup(dir);
    if (!file) throw new HttpError(404, "Ch\u01B0a c\xF3 b\u1EA3n sao l\u01B0u n\xE0o");
    res.download(file);
  });
  r.post("/admin/reset-database", requireSystemAdmin, (req, res) => {
    const actor = currentUser(req);
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(actor.id);
    const password = req.body?.password;
    if (typeof password !== "string" || !verifyPassword(password, row?.password_hash)) {
      throw new HttpError(400, "M\u1EADt kh\u1EA9u kh\xF4ng \u0111\xFAng");
    }
    const backup = backupNow(db, dir, "pre-reset", ctx.now());
    tx(db, () => {
      for (const table of [
        "detections",
        "attendance_days",
        "requests",
        "webhook_logs",
        "cameras",
        "sync_jobs",
        "face_sightings",
        "email_jobs",
        "password_resets",
        "admin_areas"
      ]) db.exec(`DELETE FROM ${table}`);
      db.prepare("UPDATE users SET department_id = NULL WHERE id = ?").run(actor.id);
      db.exec("UPDATE departments SET manager_id = NULL");
      db.prepare("DELETE FROM users WHERE id != ?").run(actor.id);
      db.exec("DELETE FROM departments");
      db.exec("DELETE FROM areas");
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
  api.use(areaRoutes(ctx));
  api.use(shiftRoutes(ctx));
  api.use(cameraRoutes(ctx));
  api.use(attendanceRoutes(ctx));
  api.use(settingsRoutes(ctx));
  api.use(mailRoutes(ctx));
  api.use(requestRoutes(ctx));
  api.use(hanetRoutes(ctx));
  api.use(adminRoutes(ctx));
  app.use("/api", api);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Kh\xF4ng t\xECm th\u1EA5y")));
  app.use(errorHandler(ctx.config.production));
  return app;
}

// server/index.ts
init_auth();
init_bootstrap();

// server/jobs.ts
init_backup();
init_auth();
init_hanet();
init_hanet_sync();
init_sync_handlers();
init_hanet_api();
init_vntime();
init_attendance();
function dueJobs(now) {
  const m = vnMinutesOfDay(now);
  return {
    backup: m === 2 * 60,
    reconcileToday: m % 15 === 0,
    reconcileYesterday: m === 5,
    purgeSessions: m % 60 === 0,
    purgeHourly: m % 60 === 30,
    cameraStatus: m % 5 === 0,
    closeDays: m % 15 === 0
  };
}
function startJobs(ctx) {
  const running2 = /* @__PURE__ */ new Set();
  const deps = { db: ctx.db, fetch: ctx.fetch, now: ctx.now };
  const run = (name, fn) => {
    if (running2.has(name)) return;
    running2.add(name);
    Promise.resolve().then(fn).catch((err) => console.error(`[JOB] ${name} l\u1ED7i:`, err.message)).finally(() => running2.delete(name));
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
    if (due.purgeHourly) run("purge-sightings", () => purgeSightings(ctx.db, now));
    if (due.purgeHourly) run("purge-sync-jobs", () => purgeDoneJobs(ctx.db, now));
    run("sync", () => runDueJobs(deps, SYNC_HANDLERS));
    run("mail", () => runMailJobs({ db: ctx.db, sendMail: ctx.sendMail, now: ctx.now }));
    if (due.closeDays) run("close-days", () => closeDays(ctx.db, now));
    if (reconcileEnabled(ctx.db)) {
      if (due.cameraStatus) run("camera-status", () => refreshCameraStatus(deps));
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
  run("close-days-startup", () => closeDays(ctx.db, ctx.now()));
  const timer = setInterval(tick, 2e4);
  timer.unref();
  return () => clearInterval(timer);
}

// server/index.ts
var production = process.env.NODE_ENV === "production";
var defaultPort = production ? 3001 : 3e3;
var PORT = process.env.PORT && process.env.PORT !== "8080" ? Number(process.env.PORT) : defaultPort;
var dataDir = path3.resolve(process.cwd(), "data");
var backupDir = path3.join(dataDir, "backups");
async function main() {
  const db = openDb(path3.join(dataDir, "attendance.db"), { backupDir });
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
      backupDir,
      kickSync: true
    },
    limiter: new LoginLimiter(),
    fetch: globalThis.fetch,
    now: () => Date.now(),
    sendMail: nodemailerSend
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
  if (err instanceof SchemaVersionError || err instanceof SchemaTooNewError || err instanceof MigrationError) console.error(err.message);
  else console.error("[STARTUP] Kh\xF4ng kh\u1EDFi \u0111\u1ED9ng \u0111\u01B0\u1EE3c:", err);
  process.exit(1);
});
