import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { contentHash, upgradeLesson, validateLesson, type Evidence, type Lesson, type LessonStatus } from './model.ts';

export function dataDirectory(): string {
  if (process.env.LESSONLAB_HOME) return resolve(process.env.LESSONLAB_HOME);
  if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'agent-lesson-lab');
  if (platform() === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'agent-lesson-lab');
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'agent-lesson-lab');
}

export function openStore() {
  const directory = dataDirectory();
  if (existsSync(directory) && lstatSync(directory).isSymbolicLink()) throw new Error('Data directory cannot be a symlink');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (platform() !== 'win32') chmodSync(directory, 0o700);
  const path = join(directory, 'lessons.sqlite');
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error('Database cannot be a symlink');
  const db = new DatabaseSync(path);
  if (platform() !== 'win32') chmodSync(path, 0o600);
  db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA secure_delete = ON;');
  const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
  if (version === 1) backupDatabase(db, 'before-v2-migration');
  migrate(db);
  return { db, path };
}

export function openReadStore(): DatabaseSync {
  const directory = dataDirectory();
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink()) throw new Error('No safe local store');
  const path = join(directory, 'lessons.sqlite');
  if (!existsSync(path) || lstatSync(path).isSymbolicLink()) throw new Error('No safe local database');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
    const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version !== 2) throw new Error('Database needs an explicit CLI migration');
    return db;
  } catch (error) { db.close(); throw error; }
}

export function backupDatabase(db: DatabaseSync, label = 'backup'): string {
  const directory = join(dataDirectory(), 'backups');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (platform() !== 'win32') chmodSync(directory, 0o700);
  const path = join(directory, `${label}-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.sqlite`);
  db.prepare('VACUUM INTO ?').run(path);
  if (platform() !== 'win32') chmodSync(path, 0o600);
  return path;
}

function createSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE lesson_revisions (
      id TEXT NOT NULL, revision INTEGER NOT NULL, project_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('proposed','approved','rejected','retired')),
      data TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(id, revision)
    ) STRICT;
    CREATE TABLE lesson_current (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL, active_revision INTEGER,
      project_id TEXT NOT NULL, scope_level TEXT NOT NULL, stack TEXT,
      status TEXT NOT NULL,
      FOREIGN KEY(id, revision) REFERENCES lesson_revisions(id, revision)
    ) STRICT;
    CREATE INDEX current_scope ON lesson_current(scope_level, project_id, stack, active_revision);
    CREATE TABLE audit (
      event_id INTEGER PRIMARY KEY, lesson_id TEXT NOT NULL, revision INTEGER NOT NULL,
      action TEXT NOT NULL, occurred_at TEXT NOT NULL,
      FOREIGN KEY(lesson_id, revision) REFERENCES lesson_revisions(id, revision)
    ) STRICT;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    INSERT INTO settings VALUES ('enabled', '1');
    CREATE VIRTUAL TABLE lesson_fts USING fts5(id UNINDEXED, title, lesson, triggers);
    PRAGMA user_version = 2;
  `);
}

function migrate(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version > 2) throw new Error(`Database schema ${version} is newer than this CLI`);
    if (version === 0) createSchema(db);
    if (version === 1) {
      db.exec(`
        CREATE TABLE lesson_revisions_v2 (id TEXT NOT NULL, revision INTEGER NOT NULL, project_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('proposed','approved','rejected','retired')),
          data TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(id, revision)) STRICT;
        CREATE TABLE lesson_current_v2 (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, active_revision INTEGER,
          project_id TEXT NOT NULL, scope_level TEXT NOT NULL, stack TEXT, status TEXT NOT NULL,
          FOREIGN KEY(id, revision) REFERENCES lesson_revisions_v2(id, revision)) STRICT;
        CREATE TABLE audit_v2 (event_id INTEGER PRIMARY KEY, lesson_id TEXT NOT NULL, revision INTEGER NOT NULL,
          action TEXT NOT NULL, occurred_at TEXT NOT NULL,
          FOREIGN KEY(lesson_id, revision) REFERENCES lesson_revisions_v2(id, revision)) STRICT;
      `);
      const rows = db.prepare('SELECT * FROM lesson_revisions').all() as { id: string; revision: number; project_id: string; status: string; data: string; created_at: string }[];
      const insert = db.prepare('INSERT INTO lesson_revisions_v2 VALUES (?,?,?,?,?,?)');
      for (const row of rows) insert.run(row.id, row.revision, row.project_id, row.status, JSON.stringify(upgradeLesson(JSON.parse(row.data))), row.created_at);
      db.exec(`
        INSERT INTO lesson_current_v2 SELECT id, revision,
          CASE WHEN status='approved' THEN revision ELSE NULL END,
          project_id, 'project', NULL, status FROM lesson_current;
        INSERT INTO audit_v2 SELECT * FROM audit;
        DROP TABLE audit;
        DROP TABLE lesson_current;
        DROP TABLE lesson_revisions;
        ALTER TABLE lesson_revisions_v2 RENAME TO lesson_revisions;
        ALTER TABLE lesson_current_v2 RENAME TO lesson_current;
        ALTER TABLE audit_v2 RENAME TO audit;
        CREATE INDEX current_scope ON lesson_current(scope_level, project_id, stack, active_revision);
        PRAGMA user_version = 2;
      `);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

function decode(data: string): Lesson {
  const lesson = upgradeLesson(JSON.parse(data));
  validateLesson(lesson);
  return lesson;
}

function validRows(rows: { data: string }[]): Lesson[] {
  const lessons: Lesson[] = [];
  for (const row of rows) {
    try { lessons.push(decode(row.data)); }
    catch { /* Invalid or secret-bearing stored data is never rendered. */ }
  }
  return lessons;
}

function saveRevision(db: DatabaseSync, lesson: Lesson, action: string, at = new Date().toISOString()) {
  db.prepare('INSERT INTO lesson_revisions VALUES (?,?,?,?,?,?)').run(lesson.id, lesson.revision, lesson.projectId, lesson.status, JSON.stringify(lesson), at);
  db.prepare('INSERT INTO audit(lesson_id, revision, action, occurred_at) VALUES (?,?,?,?)').run(lesson.id, lesson.revision, action, at);
}

function indexActive(db: DatabaseSync, lesson: Lesson) {
  db.prepare('DELETE FROM lesson_fts WHERE id=?').run(lesson.id);
  if (lesson.status === 'approved') db.prepare('INSERT INTO lesson_fts(id,title,lesson,triggers) VALUES (?,?,?,?)').run(lesson.id, lesson.title, lesson.lesson, lesson.triggers.join(' '));
}

export function insertLesson(db: DatabaseSync, lesson: Lesson) {
  validateLesson(lesson);
  transaction(db, () => {
    saveRevision(db, lesson, 'capture', lesson.createdAt);
    db.prepare('INSERT INTO lesson_current VALUES (?,?,?,?,?,?,?)').run(lesson.id, lesson.revision, null, lesson.projectId, 'project', null, lesson.status);
  });
}

export function currentLesson(db: DatabaseSync, id: string): Lesson | null {
  const row = db.prepare('SELECT r.data FROM lesson_current c JOIN lesson_revisions r ON r.id=c.id AND r.revision=c.revision WHERE c.id=?').get(id) as { data: string } | undefined;
  return row ? decode(row.data) : null;
}

export function activeLesson(db: DatabaseSync, id: string): Lesson | null {
  const row = db.prepare('SELECT r.data FROM lesson_current c JOIN lesson_revisions r ON r.id=c.id AND r.revision=c.active_revision WHERE c.id=?').get(id) as { data: string } | undefined;
  return row ? decode(row.data) : null;
}

export function projectLessons(db: DatabaseSync, projectId: string): Lesson[] {
  const rows = db.prepare('SELECT r.data FROM lesson_current c JOIN lesson_revisions r ON r.id=c.id AND r.revision=c.revision WHERE c.project_id=? ORDER BY r.created_at DESC').all(projectId) as { data: string }[];
  return validRows(rows);
}

export function applicableLessons(db: DatabaseSync, projectId: string, stack?: string): Lesson[] {
  const rows = db.prepare(`SELECT r.data FROM lesson_current c JOIN lesson_revisions r ON r.id=c.id AND r.revision=c.active_revision
    WHERE c.active_revision IS NOT NULL AND ((c.scope_level='project' AND c.project_id=?)
      OR (c.scope_level='stack' AND c.stack=?) OR c.scope_level='global')`).all(projectId, stack || '') as { data: string }[];
  return validRows(rows);
}

export function candidateLessons(db: DatabaseSync, projectId: string, stack: string | undefined, ftsQuery: string): { lesson: Lesson; score: number }[] {
  const rows = db.prepare(`SELECT r.data, bm25(lesson_fts) AS score
    FROM lesson_fts f JOIN lesson_current c ON c.id=f.id
      JOIN lesson_revisions r ON r.id=c.id AND r.revision=c.active_revision
    WHERE c.active_revision IS NOT NULL AND ((c.scope_level='project' AND c.project_id=?)
      OR (c.scope_level='stack' AND c.stack=?) OR c.scope_level='global')
      AND triggers MATCH ?`).all(projectId, stack || '', ftsQuery) as { data: string; score: number }[];
  const result: { lesson: Lesson; score: number }[] = [];
  for (const row of rows) {
    try { result.push({ lesson: decode(row.data), score: -row.score }); }
    catch { /* Never render invalid indexed data. */ }
  }
  return result;
}

export function invalidRecordCount(db: DatabaseSync): number {
  const rows = db.prepare('SELECT data FROM lesson_revisions').all() as { data: string }[];
  return rows.length - validRows(rows).length;
}

export function history(db: DatabaseSync, id: string): Lesson[] {
  return (db.prepare('SELECT data FROM lesson_revisions WHERE id=? ORDER BY revision').all(id) as { data: string }[]).map(row => decode(row.data));
}

export function exportProject(db: DatabaseSync, projectId: string) {
  const lessons = projectLessons(db, projectId).map(lesson => ({
    id: lesson.id,
    revisions: history(db, lesson.id),
    audit: db.prepare('SELECT revision, action, occurred_at FROM audit WHERE lesson_id=? ORDER BY event_id').all(lesson.id),
  }));
  return { schemaVersion: 2, exportedAt: new Date().toISOString(), projectId, lessons };
}

export function deleteLesson(db: DatabaseSync, id: string) {
  transaction(db, () => {
    db.prepare('DELETE FROM lesson_fts WHERE id=?').run(id);
    db.prepare('DELETE FROM audit WHERE lesson_id=?').run(id);
    db.prepare('DELETE FROM lesson_current WHERE id=?').run(id);
    db.prepare('DELETE FROM lesson_revisions WHERE id=?').run(id);
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  // Every backup contains the whole store, so any one may resurrect this lesson.
  rmSync(join(dataDirectory(), 'backups'), { recursive: true, force: true });
}

export function deleteAll(db: DatabaseSync) {
  transaction(db, () => {
    db.exec('DELETE FROM lesson_fts; DELETE FROM audit; DELETE FROM lesson_current; DELETE FROM lesson_revisions;');
  });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
  rmSync(join(dataDirectory(), 'backups'), { recursive: true, force: true });
}

export function changeStatus(db: DatabaseSync, existing: Lesson, status: LessonStatus): Lesson {
  const previousActive = activeLesson(db, existing.id);
  if (status === 'approved' && existing.status !== 'proposed') throw new Error('Only proposed lessons can be approved');
  if (status === 'rejected' && existing.status !== 'proposed') throw new Error('Only proposed lessons can be rejected');
  if (status === 'retired' && !previousActive) throw new Error('Only active lessons can be retired');
  const now = new Date().toISOString();
  const source = status === 'retired' ? previousActive! : existing;
  const next: Lesson = {
    ...source, revision: existing.revision + 1, status,
    approvedAt: status === 'approved' ? now : source.approvedAt,
    evidence: status === 'approved' ? [...source.evidence, { kind: 'human_review', result: 'accepted', at: now }] : source.evidence,
    confidence: status === 'approved' ? 'reviewed' : source.confidence,
  };
  validateLesson(next);
  transaction(db, () => {
    const row = db.prepare('SELECT revision, active_revision FROM lesson_current WHERE id=?').get(existing.id) as { revision: number; active_revision: number | null };
    if (row.revision !== existing.revision) throw new Error('Lesson changed during review; review the latest revision');
    if (status === 'retired' && row.active_revision === null) throw new Error('Lesson is no longer active');
    saveRevision(db, next, status, now);
    const active = status === 'approved' ? next.revision : status === 'rejected' ? row.active_revision : null;
    const activeScope = status === 'rejected' && previousActive ? previousActive.scope : next.scope;
    db.prepare('UPDATE lesson_current SET revision=?, active_revision=?, scope_level=?, stack=?, status=? WHERE id=?').run(next.revision, active, activeScope.level, activeScope.level === 'stack' ? activeScope.stack : null, status, next.id);
    if (status !== 'rejected') indexActive(db, next);
  });
  return next;
}

export function proposeRevision(db: DatabaseSync, id: string, revise: (active: Lesson) => Lesson): Lesson {
  const current = currentLesson(db, id);
  const active = activeLesson(db, id);
  if (!current || !active) throw new Error('Only active lessons can be revised or promoted');
  if (current.status === 'proposed') throw new Error('Review or reject the pending draft first');
  const draft: Lesson = { ...revise(active), id, revision: current.revision + 1, status: 'proposed', approvedAt: null, confidence: 'draft' };
  draft.hash = contentHash(draft);
  if (draft.hash !== active.hash) draft.evidence = active.evidence.filter(e => e.kind === 'human_review');
  validateLesson(draft);
  transaction(db, () => {
    const row = db.prepare('SELECT revision FROM lesson_current WHERE id=?').get(id) as { revision: number };
    if (row.revision !== current.revision) throw new Error('Lesson changed during revision');
    saveRevision(db, draft, 'propose_revision');
    db.prepare("UPDATE lesson_current SET revision=?, status='proposed' WHERE id=?").run(draft.revision, id);
  });
  return draft;
}

export function recordEvidence(db: DatabaseSync, existing: Lesson, evidence: Evidence): Lesson {
  if (existing.status !== 'approved') throw new Error('Resolve the pending draft before recording evidence');
  if (evidence.kind === 'human_review' || evidence.contentHash !== existing.hash) throw new Error('Evidence must describe the current approved content');
  const next: Lesson = { ...existing, revision: existing.revision + 1, evidence: [...existing.evidence, evidence] };
  validateLesson(next);
  transaction(db, () => {
    const row = db.prepare('SELECT revision, active_revision FROM lesson_current WHERE id=?').get(existing.id) as { revision: number; active_revision: number | null };
    if (row.revision !== existing.revision || row.active_revision !== existing.revision) throw new Error('Lesson changed during evidence recording');
    saveRevision(db, next, 'record_evidence');
    db.prepare('UPDATE lesson_current SET revision=?, active_revision=? WHERE id=?').run(next.revision, next.revision, next.id);
  });
  return next;
}

export function rollback(db: DatabaseSync, id: string, targetRevision: number): Lesson {
  const previous = history(db, id).find(item => item.revision === targetRevision && item.status === 'approved');
  if (!previous) throw new Error('Rollback target must be a previously approved revision');
  const current = currentLesson(db, id)!;
  const now = new Date().toISOString();
  const restored: Lesson = { ...previous, revision: current.revision + 1, status: 'approved', approvedAt: now };
  transaction(db, () => {
    const row = db.prepare('SELECT revision FROM lesson_current WHERE id=?').get(id) as { revision: number };
    if (row.revision !== current.revision) throw new Error('Lesson changed during rollback');
    saveRevision(db, restored, 'rollback', now);
    db.prepare('UPDATE lesson_current SET revision=?, active_revision=?, scope_level=?, stack=?, status=? WHERE id=?').run(restored.revision, restored.revision, restored.scope.level, restored.scope.level === 'stack' ? restored.scope.stack : null, 'approved', id);
    indexActive(db, restored);
  });
  return restored;
}

export function setEnabled(db: DatabaseSync, enabled: boolean) {
  db.prepare("UPDATE settings SET value=? WHERE key='enabled'").run(enabled ? '1' : '0');
}

export function isEnabled(db: DatabaseSync): boolean {
  return (db.prepare("SELECT value FROM settings WHERE key='enabled'").get() as { value: string }).value === '1';
}

export function integrity(db: DatabaseSync) {
  return (db.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
}
