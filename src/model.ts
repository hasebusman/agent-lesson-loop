import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export type LessonStatus = 'proposed' | 'approved' | 'rejected' | 'retired';
export type LessonType = 'preference' | 'workflow' | 'diagnostic' | 'technical_fact' | 'known_pitfall';
export type LessonScope = { level: 'project' } | { level: 'stack'; stack: string } | { level: 'global' };
export type LessonEnvironment = { platform?: string; dependency?: { name: string; minVersion?: string; beforeVersion?: string } };
export type Evidence =
  | { kind: 'human_review'; result: 'accepted'; at: string }
  | { kind: 'developer_attestation'; result: 'passed' | 'failed' | 'unknown'; note: string; at: string; contentHash: string }
  | { kind: 'machine_check'; result: 'passed' | 'failed' | 'unknown'; command: string[];
      environment: { platform: string; arch: string; node: string }; exitCode: number | null;
      outputBytes: number; at: string; contentHash: string };

export type Lesson = {
  schemaVersion: 2;
  id: string;
  revision: number;
  status: LessonStatus;
  type: LessonType;
  projectId: string;
  scope: LessonScope;
  environment?: LessonEnvironment;
  title: string;
  lesson: string;
  triggers: string[];
  requires: string[];
  exclusions: string[];
  verify: string;
  sourceKind: 'manual_correction_attestation';
  createdAt: string;
  approvedAt: string | null;
  expiresAt: string | null;
  supersedes: string[];
  hash: string;
  evidence: Evidence[];
  confidence: 'draft' | 'reviewed';
};

const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:sk-|gh[pousr]_|github_pat_|AKIA)[A-Za-z0-9_-]{12,}\b/,
  /\b(?:password|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /https?:\/\/[^\s/@]+:[^\s/@]+@/i,
];

export function safeText(value: unknown, field: string, max = 500): string {
  if (typeof value !== 'string') throw new Error(`${field} must be text`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\r\n\x00-\x1f\x7f]/.test(trimmed)) throw new Error(`${field} must be one line, 1-${max} characters`);
  if (secretPatterns.some(pattern => pattern.test(trimmed))) throw new Error(`${field} looks like private data; rewrite it without secrets or identifiers`);
  return trimmed;
}

export function parseTerms(value: unknown, field: string, required = false): string[] {
  if (typeof value !== 'string' && !(value === undefined && !required)) throw new Error(`${field} must be comma-separated terms`);
  const terms = value === undefined ? [] : value.split(',').map(x => safeText(x, field, 80).toLowerCase());
  if (required && terms.length === 0) throw new Error(`${field} needs at least one term`);
  if (terms.length > 12 || terms.some(x => !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(x))) throw new Error(`${field} supports up to 12 plain words or phrases`);
  return [...new Set(terms)];
}

export function contentHash(value: Pick<Lesson, 'type' | 'scope' | 'title' | 'lesson' | 'triggers' | 'exclusions' | 'verify' | 'expiresAt'> & { requires?: string[]; environment?: LessonEnvironment }): string {
  // Empty required terms preserve hashes of pre-existing schema-v2 records.
  const fields: unknown[] = [value.type, value.scope, value.title, value.lesson, value.triggers, value.exclusions, value.verify, value.expiresAt];
  if (value.requires?.length) fields.push(value.requires);
  if (value.environment) fields.push(value.environment);
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex');
}

export function stableVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts as [number, number, number] : null;
}

export function compareStableVersions(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function platformName(value: unknown): string {
  const platform = safeText(value, 'platform', 80).toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/.test(platform)) throw new Error('platform must be a plain name');
  return platform;
}

export function dependencyName(value: unknown): string {
  const name = safeText(value, 'dependency', 100).toLowerCase();
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error('dependency must be a package name');
  return name;
}

export function lessonEnvironment(input: { platform?: unknown; dependency?: unknown; minVersion?: unknown; beforeVersion?: unknown }): LessonEnvironment | undefined {
  const hasAny = Object.values(input).some(value => value !== undefined);
  if (!hasAny) return undefined;
  const environment: LessonEnvironment = {};
  if (input.platform !== undefined) environment.platform = platformName(input.platform);
  if (input.dependency !== undefined) {
    const name = dependencyName(input.dependency);
    if (input.minVersion === undefined && input.beforeVersion === undefined) throw new Error('dependency needs a version range');
    const dependency: NonNullable<LessonEnvironment['dependency']> = { name };
    if (input.minVersion !== undefined) {
      if (!stableVersion(input.minVersion)) throw new Error('min-version must be stable MAJOR.MINOR.PATCH');
      dependency.minVersion = input.minVersion as string;
    }
    if (input.beforeVersion !== undefined) {
      if (!stableVersion(input.beforeVersion)) throw new Error('before-version must be stable MAJOR.MINOR.PATCH');
      dependency.beforeVersion = input.beforeVersion as string;
    }
    if (dependency.minVersion && dependency.beforeVersion && compareStableVersions(stableVersion(dependency.minVersion)!, stableVersion(dependency.beforeVersion)!) >= 0) throw new Error('version range must increase');
    environment.dependency = dependency;
  } else if (input.minVersion !== undefined || input.beforeVersion !== undefined) throw new Error('version range needs a dependency');
  return environment;
}

export function validExpiry(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('expires must be a valid YYYY-MM-DD date');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('expires must be a valid YYYY-MM-DD date');
  return `${value}T00:00:00.000Z`;
}

export function newLesson(input: { projectId: string; title: unknown; lesson: unknown; when: unknown; requires?: unknown; except?: unknown; verify: unknown; type?: unknown; expires?: unknown; platform?: unknown; dependency?: unknown; minVersion?: unknown; beforeVersion?: unknown }): Lesson {
  const type = input.type === undefined ? 'workflow' : input.type;
  if (!['preference', 'workflow', 'diagnostic', 'technical_fact', 'known_pitfall'].includes(String(type))) throw new Error('type is invalid');
  const lesson: Lesson = {
    schemaVersion: 2, id: randomUUID(), revision: 1, status: 'proposed', type: type as LessonType, projectId: input.projectId, scope: { level: 'project' },
    environment: lessonEnvironment({ platform: input.platform, dependency: input.dependency, minVersion: input.minVersion, beforeVersion: input.beforeVersion }),
    title: safeText(input.title, 'title', 120),
    lesson: safeText(input.lesson, 'lesson'),
    triggers: parseTerms(input.when, 'when', true),
    requires: parseTerms(input.requires, 'requires'),
    exclusions: parseTerms(input.except, 'except'),
    verify: safeText(input.verify, 'verify', 300),
    sourceKind: 'manual_correction_attestation',
    createdAt: new Date().toISOString(), approvedAt: null,
    expiresAt: validExpiry(input.expires), supersedes: [], hash: '', evidence: [], confidence: 'draft',
  };
  lesson.hash = contentHash(lesson);
  return lesson;
}

export function upgradeLesson(raw: Record<string, unknown>): Lesson {
  if (raw.schemaVersion === 2) return {
    ...raw,
    requires: raw.requires === undefined ? [] : raw.requires,
    evidence: Array.isArray(raw.evidence) ? raw.evidence : raw.approvedAt ? [{ kind: 'human_review', result: 'accepted', at: raw.approvedAt }] : [],
    confidence: raw.confidence === 'reviewed' || raw.approvedAt ? 'reviewed' : 'draft',
  } as unknown as Lesson;
  const scope: LessonScope = { level: 'project' };
  const lesson: Lesson = {
    schemaVersion: 2,
    id: String(raw.id), revision: Number(raw.revision), status: raw.status as LessonStatus,
    type: 'workflow', projectId: String(raw.projectId), scope,
    title: String(raw.title), lesson: String(raw.lesson),
    triggers: raw.triggers as string[], requires: [], exclusions: raw.exclusions as string[],
    verify: String(raw.verify), sourceKind: 'manual_correction_attestation',
    createdAt: String(raw.createdAt), approvedAt: raw.approvedAt ? String(raw.approvedAt) : null,
    expiresAt: null, supersedes: [], hash: '',
    evidence: raw.status === 'approved' && raw.approvedAt ? [{ kind: 'human_review', result: 'accepted', at: String(raw.approvedAt) }] : [],
    confidence: raw.status === 'approved' ? 'reviewed' : 'draft',
  };
  lesson.hash = contentHash(lesson);
  return lesson;
}

export function validateLesson(lesson: Lesson): void {
  if (lesson.schemaVersion !== 2 || !/^[0-9a-f-]{36}$/.test(lesson.id) || !Number.isSafeInteger(lesson.revision) || lesson.revision < 1) throw new Error('Invalid lesson identity');
  if (!/^[0-9a-f]{64}$/.test(lesson.projectId)) throw new Error('Invalid project identity');
  if (!['proposed', 'approved', 'rejected', 'retired'].includes(lesson.status)) throw new Error('Invalid lesson status');
  if (!['preference', 'workflow', 'diagnostic', 'technical_fact', 'known_pitfall'].includes(lesson.type)) throw new Error('Invalid lesson type');
  if (!lesson.scope || !['project', 'stack', 'global'].includes(lesson.scope.level)) throw new Error('Invalid lesson scope');
  if (lesson.scope.level === 'stack') safeText(lesson.scope.stack, 'stack', 80);
  if (lesson.environment !== undefined) {
    if (!lesson.environment || typeof lesson.environment !== 'object' || Array.isArray(lesson.environment) ||
      Object.keys(lesson.environment).some(key => key !== 'platform' && key !== 'dependency')) throw new Error('Invalid environment');
    const dependency = lesson.environment.dependency;
    if (dependency && (typeof dependency !== 'object' || Array.isArray(dependency) ||
      Object.keys(dependency).some(key => !['name', 'minVersion', 'beforeVersion'].includes(key)))) throw new Error('Invalid environment dependency');
    const normalized = lessonEnvironment({ platform: lesson.environment.platform, dependency: dependency?.name,
      minVersion: dependency?.minVersion, beforeVersion: dependency?.beforeVersion });
    if (!isDeepStrictEqual(normalized, lesson.environment)) throw new Error('Invalid environment');
  }
  safeText(lesson.title, 'title', 120);
  safeText(lesson.lesson, 'lesson');
  safeText(lesson.verify, 'verify', 300);
  if (!Array.isArray(lesson.triggers) || !Array.isArray(lesson.requires) || !Array.isArray(lesson.exclusions)) throw new Error('Invalid applicability terms');
  parseTerms(lesson.triggers.join(','), 'when', true);
  if (lesson.requires.length) parseTerms(lesson.requires.join(','), 'requires');
  if (lesson.exclusions.length) parseTerms(lesson.exclusions.join(','), 'except');
  if (lesson.expiresAt !== null && (typeof lesson.expiresAt !== 'string' || Number.isNaN(Date.parse(lesson.expiresAt)))) throw new Error('Invalid expiry');
  if (lesson.sourceKind !== 'manual_correction_attestation' || !Array.isArray(lesson.evidence)) throw new Error('Invalid provenance');
  for (const e of lesson.evidence) {
    if (!e || typeof e !== 'object' || typeof e.at !== 'string' || Number.isNaN(Date.parse(e.at))) throw new Error('Invalid evidence timestamp');
    if (e.kind === 'human_review') {
      if (e.result !== 'accepted') throw new Error('Invalid review evidence');
    } else if (e.kind === 'developer_attestation') {
      if (!['passed', 'failed', 'unknown'].includes(e.result) || !/^[0-9a-f]{64}$/.test(e.contentHash)) throw new Error('Invalid developer attestation');
      safeText(e.note, 'attestation note', 300);
    } else if (e.kind === 'machine_check') {
      if (!['passed', 'failed', 'unknown'].includes(e.result) || !/^[0-9a-f]{64}$/.test(e.contentHash)) throw new Error('Invalid machine check');
      if (!Number.isSafeInteger(e.outputBytes) || e.outputBytes < 0) throw new Error('Invalid output byte count');
      if (!Array.isArray(e.command) || !e.command.length || e.command.length > 64) throw new Error('Invalid check command');
      for (const arg of e.command) safeText(arg, 'command argument', 300);
      if (!e.environment || typeof e.environment !== 'object') throw new Error('Invalid check environment');
      safeText(e.environment.platform, 'platform', 80);
      safeText(e.environment.arch, 'architecture', 80);
      safeText(e.environment.node, 'runtime', 80);
      if (e.exitCode !== null && (!Number.isSafeInteger(e.exitCode) || e.exitCode < 0)) throw new Error('Invalid check exit code');
      if (e.result === 'passed' && e.exitCode !== 0 || e.result === 'failed' && (e.exitCode === null || e.exitCode === 0) || e.result === 'unknown' && e.exitCode !== null) throw new Error('Check result disagrees with exit code');
    } else throw new Error('Invalid evidence kind');
  }
  if (lesson.status === 'approved' && !lesson.evidence.some(e => e.kind === 'human_review')) throw new Error('Approved lesson has no human review');
  if (contentHash(lesson) !== lesson.hash) throw new Error('Lesson content hash mismatch');
}

export function taskHasTerm(task: string, term: string): boolean {
  const normalized = task.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const needle = term.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return (` ${normalized} `).includes(` ${needle} `);
}

const reviewFields = ['title', 'lesson', 'type', 'scope', 'environment', 'triggers', 'requires', 'exclusions', 'verify', 'expiresAt'] as const;

export function reviewDiff(before: Lesson | null, draft: Lesson) {
  return {
    id: draft.id,
    fromRevision: before?.revision ?? null,
    toRevision: draft.revision,
    changes: reviewFields.flatMap(field => {
      const oldValue = before?.[field] ?? null;
      const newValue = draft[field] ?? null;
      return isDeepStrictEqual(oldValue, newValue) ? [] : [{ field, before: oldValue, after: newValue }];
    }),
  };
}
