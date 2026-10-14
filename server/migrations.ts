import type { Db } from './db';
import { backupPreMigrate } from './backup';
import { ddlAttendanceDays, ddlHolidays, ddlRequests, ddlShifts, SCHEMA_VERSION } from './schema';
import { toVnDate } from './vntime';

export const MIN_MIGRATABLE_VERSION = 3;

export interface Migration {
  from: number;
  run: (db: Db, now: number) => void;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public backup: string | null,
  ) {
    super(message);
  }
}

/** v3 → v4: ca làm việc, ngày lễ, đơn theo khoảng ngày, ngày công vắng/nghỉ/đi sớm/đã chốt. */
function migrate3to4(db: Db, now: number): void {
  db.exec(ddlShifts(false));
  db.exec(ddlHolidays(false));
  db.exec('ALTER TABLE departments ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT');
  db.exec('ALTER TABLE users ADD COLUMN shift_id TEXT REFERENCES shifts(id) ON DELETE RESTRICT');

  db.exec(ddlRequests('requests_v4', false));
  db.exec(`INSERT INTO requests_v4(id, user_id, work_date, end_date, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at)
    SELECT id, user_id, work_date, NULL, type, reason, suggested_in, suggested_out, status, reviewed_by, reviewed_at, comment, created_at FROM requests`);
  db.exec('DROP TABLE requests');
  db.exec('ALTER TABLE requests_v4 RENAME TO requests');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id)');

  db.exec(ddlAttendanceDays('attendance_days_v4', false));
  db.prepare(
    `INSERT INTO attendance_days_v4(user_id, work_date, first_in, last_out, late_minutes, early_minutes, early_arrival_minutes, status, final,
       late_excused, manual_in, manual_out, detection_count)
     SELECT user_id, work_date, first_in, last_out, late_minutes, early_minutes, 0, status, CASE WHEN work_date < ? THEN 1 ELSE 0 END,
       late_excused, manual_in, manual_out, detection_count FROM attendance_days`,
  ).run(toVnDate(now));
  db.exec('DROP TABLE attendance_days');
  db.exec('ALTER TABLE attendance_days_v4 RENAME TO attendance_days');
  db.exec('CREATE INDEX IF NOT EXISTS idx_attendance_days_date ON attendance_days(work_date)');

  db.exec(`INSERT OR IGNORE INTO settings(key, value) VALUES ('work_days', '1,2,3,4,5'), ('early_arrival_minutes', '15'), ('early_leave_minutes', '10')`);
}

export const MIGRATIONS: Migration[] = [{ from: 3, run: migrate3to4 }];

/**
 * Nâng cấp từ `from` lên SCHEMA_VERSION trong một giao dịch (sao lưu file trước). Lỗi ⇒ hoàn tác, DB giữ nguyên.
 * Tắt foreign_keys trong lúc dựng lại bảng; kiểm tra foreign_key_check trước khi COMMIT.
 */
export function runMigrations(db: Db, file: string, from: number, opts: { backupDir: string | null; now: number }): string | null {
  const backup = opts.backupDir && file !== ':memory:' ? backupPreMigrate(db, opts.backupDir, from) : null;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (let v = from; v < SCHEMA_VERSION; v++) {
        const step = MIGRATIONS.find((m) => m.from === v);
        if (!step) throw new Error(`thiếu bước nâng cấp v${v} → v${v + 1}`);
        step.run(db, opts.now);
      }
      const bad = db.prepare('PRAGMA foreign_key_check').all();
      if (bad.length) throw new Error(`dữ liệu khóa ngoại không hợp lệ (${bad.length} dòng)`);
      db.prepare('UPDATE schema_version SET version = ?').run(SCHEMA_VERSION);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } catch (err) {
    throw new MigrationError(
      `[MIGRATE] Nâng cấp v${from} → v${SCHEMA_VERSION} thất bại: ${(err as Error).message}. Database giữ nguyên v${from}${backup ? ` (sao lưu: ${backup})` : ''}.`,
      backup,
    );
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  console.log(`[MIGRATE] v${from} → v${SCHEMA_VERSION} xong (sao lưu: ${backup ?? 'không'})`);
  return backup;
}
