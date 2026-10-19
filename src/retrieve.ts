import type { DatabaseSync } from 'node:sqlite';
import { compareStableVersions, stableVersion, taskHasTerm, type Lesson } from './model.ts';
import { applicableLessons, candidateLessons, isEnabled, projectLessons } from './store.ts';

export type Explanation = { lesson: Lesson; eligible: boolean; reason: string; rank: number };
export type TaskEnvironment = { platform?: string; dependency?: { name: string; version?: string } };

function scopePriority(lesson: Lesson): number {
  return lesson.scope.level === 'project' ? 3 : lesson.scope.level === 'stack' ? 2 : 1;
}

function specificity(lesson: Lesson): number {
  return scopePriority(lesson) * 100 + lesson.requires.length;
}

// Identical applicability conditions are ambiguous if more than one lesson
// occupies the most specific scope. Broader duplicates are shadowed.
function resolveOverlap(items: Explanation[]): Explanation[] {
  const groups = new Map<string, Explanation[]>();
  for (const item of items) {
    if (!item.eligible) continue;
    const lesson = item.lesson;
    const key = JSON.stringify([[...lesson.triggers].sort(), [...lesson.exclusions].sort()]);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const highest = Math.max(...group.map(item => specificity(item.lesson)));
    const peers = group.filter(item => specificity(item.lesson) === highest);
    for (const item of group) {
      if (peers.length === 1 && item === peers[0]) continue;
      item.eligible = false;
      item.rank = 0;
      item.reason = specificity(item.lesson) < highest
        ? 'shadowed by a more specific lesson'
        : `ambiguous overlap with ${peers.filter(peer => peer.lesson.id !== item.lesson.id).map(peer => peer.lesson.id).join(', ')}`;
    }
  }
  return items;
}

function compare(a: Explanation, b: Explanation): number {
  return Number(b.eligible) - Number(a.eligible) ||
    (a.eligible && b.eligible ? scopePriority(b.lesson) - scopePriority(a.lesson) : 0) ||
    b.rank - a.rank || a.lesson.id.localeCompare(b.lesson.id);
}

function queryTerms(task: string): string {
  // The CLI bounds task text to 1,000 characters. Dropping later or short terms
  // can make search disagree with the deterministic eligibility check.
  const words = [...new Set(task.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [])];
  return words.map(word => `"${word}"`).join(' OR ');
}

function evaluate(lesson: Lesson, task: string, enabled: boolean, lexicalScore = 0, environment?: TaskEnvironment): Explanation {
  if (!enabled) return { lesson, eligible: false, reason: 'disabled', rank: 0 };
  if (lesson.status !== 'approved') return { lesson, eligible: false, reason: lesson.status, rank: 0 };
  if (lesson.expiresAt && Date.now() >= Date.parse(lesson.expiresAt)) return { lesson, eligible: false, reason: 'expired', rank: 0 };
  if (lesson.exclusions.some(term => taskHasTerm(task, term))) return { lesson, eligible: false, reason: 'exception matched', rank: 0 };
  if (lesson.requires.some(term => !taskHasTerm(task, term))) return { lesson, eligible: false, reason: 'required context missing', rank: 0 };
  const matches = lesson.triggers.filter(term => taskHasTerm(task, term));
  if (!matches.length) return { lesson, eligible: false, reason: 'no trigger matched', rank: 0 };
  const needed = lesson.environment;
  if (needed?.platform) {
    if (!environment?.platform) return { lesson, eligible: false, reason: 'platform unknown', rank: 0 };
    if (environment.platform !== needed.platform) return { lesson, eligible: false, reason: 'platform mismatch', rank: 0 };
  }
  if (needed?.dependency) {
    if (!environment?.dependency) return { lesson, eligible: false, reason: 'dependency unknown', rank: 0 };
    if (environment.dependency.name !== needed.dependency.name) return { lesson, eligible: false, reason: 'dependency mismatch', rank: 0 };
    const actual = stableVersion(environment.dependency.version);
    if (!actual) return { lesson, eligible: false, reason: 'dependency version unknown', rank: 0 };
    const min = needed.dependency.minVersion ? stableVersion(needed.dependency.minVersion)! : null;
    const before = needed.dependency.beforeVersion ? stableVersion(needed.dependency.beforeVersion)! : null;
    if (min && compareStableVersions(actual, min) < 0 || before && compareStableVersions(actual, before) >= 0) return { lesson, eligible: false, reason: 'dependency version outside range', rank: 0 };
  }
  return { lesson, eligible: true, reason: `trigger: ${matches.join(', ')}`, rank: matches.length * 100 + lexicalScore };
}

export function explain(db: DatabaseSync, projectId: string, task: string, stack?: string, environment?: TaskEnvironment): Explanation[] {
  const enabled = isEnabled(db);
  const query = queryTerms(task);
  const ranks = new Map<string, number>();
  if (enabled && query) {
    const rows = db.prepare(`SELECT f.id, bm25(lesson_fts) AS score
      FROM lesson_fts f JOIN lesson_current c ON c.id=f.id
      WHERE c.active_revision IS NOT NULL AND ((c.scope_level='project' AND c.project_id=?)
        OR (c.scope_level='stack' AND c.stack=?) OR c.scope_level='global')
        AND triggers MATCH ?`).all(projectId, stack || '', query) as { id: string; score: number }[];
    for (const row of rows) ranks.set(row.id, -row.score);
  }
  const visible = new Map<string, Lesson>();
  for (const lesson of projectLessons(db, projectId)) visible.set(lesson.id, lesson);
  for (const lesson of applicableLessons(db, projectId, stack)) visible.set(lesson.id, lesson);
  return resolveOverlap([...visible.values()].map(lesson => evaluate(lesson, task, enabled, ranks.get(lesson.id) || 0, environment))).sort(compare);
}

export function selected(db: DatabaseSync, projectId: string, task: string, stack?: string, environment?: TaskEnvironment) {
  if (!isEnabled(db)) return [];
  const query = queryTerms(task);
  if (!query) return [];
  return resolveOverlap(candidateLessons(db, projectId, stack, query).map(item => evaluate(item.lesson, task, true, item.score, environment)))
    .filter(item => item.eligible)
    .sort(compare)
    .slice(0, 3);
}

export function render(items: Explanation[]): string {
  const lines = ['Advisory lessons from your approved local store. Current user instructions take precedence.'];
  let used = lines[0].length;
  for (const item of items) {
    const l = item.lesson;
    const latestCheck = [...l.evidence].reverse().find(e => e.kind === 'machine_check' && e.contentHash === l.hash);
    const latestAttestation = [...l.evidence].reverse().find(e => e.kind === 'developer_attestation' && e.contentHash === l.hash);
    const outcome = latestCheck?.kind === 'machine_check' ? `; observed check ${latestCheck.result}`
      : latestAttestation?.kind === 'developer_attestation' ? `; developer reported ${latestAttestation.result}` : '';
    const bound = l.environment?.dependency;
    const environment = l.environment ? `\nENV ${l.environment.platform || 'any platform'}${bound ? `; ${bound.name} ${bound.minVersion ? `>=${bound.minVersion}` : ''}${bound.minVersion && bound.beforeVersion ? ' ' : ''}${bound.beforeVersion ? `<${bound.beforeVersion}` : ''}` : ''}` : '';
    const entry = `WHY ${l.title}\nWHEN ${l.triggers.join(', ')}\nREQUIRES ${l.requires.join(', ') || 'none recorded'}${environment}\nDO ${l.lesson}\nEXCEPT ${l.exclusions.join(', ') || 'none recorded'}\nVERIFY ${l.verify}\nEVIDENCE human approved correction attestation${outcome}; ${l.id} revision ${l.revision}`;
    if (used + entry.length > 1200) continue;
    lines.push(entry);
    used += entry.length;
  }
  return lines.length === 1 ? '' : lines.join('\n\n');
}
