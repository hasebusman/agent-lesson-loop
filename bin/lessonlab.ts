#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { join, resolve } from 'node:path';
import { projectIdentity } from '../src/project.ts';
import { dependencyName, lessonEnvironment, newLesson, parseConflictIds, parseTerms, platformName, reviewDiff, safeText, validExpiry, type LessonScope } from '../src/model.ts';
import { activeLesson, backupDatabase, changeStatus, currentLesson, dataDirectory, deleteAll, deleteLesson, exportProject, history, insertLesson, integrity, invalidRecordCount, isEnabled, openReadStore, openStore, projectLessons, proposeRevision, recordEvidence, rollback, setEnabled } from '../src/store.ts';
import { explain, render, selected, type TaskEnvironment } from '../src/retrieve.ts';
import { changeClaudeIntegration, claudeIntegration } from '../src/integrations.ts';

const usage = `lessonlab <command> [options]

Commands:
  init                       Create the private local store
  capture --title TEXT --lesson TEXT --when TERMS --verify TEXT [optional fields]
                             Draft a correction (TERMS are comma-separated words or phrases)
  review [ID]                Show project lessons or one full lesson; --diff compares a pending draft
  history ID                 Show immutable revisions of one lesson
  approve ID                 Activate a reviewed draft for this Git repository
  attest ID --result STATUS --note TEXT
                             Record a developer-reported check (passed/failed/unknown)
  run-check ID -- COMMAND [ARGS...]
                             Run an explicit check and record its observed result
  reject ID                  Reject a pending draft
  revise ID [fields]         Draft changes to an active lesson, keeping it active until approval
  promote ID --scope LEVEL   Draft a broader stack/global scope (separate approval required)
  retire ID                  Remove an approved lesson from retrieval
  rollback ID --revision N   Restore a previously approved revision
  backup                     Make a consistent private SQLite backup
  export --output PATH        Export this project's revisions and audit as private JSON
  delete ID --yes             Permanently delete one lesson and all store backups
  delete --all --yes          Delete all lessons and local backups
  integrate claude            Preview or enable Claude Code read-only lookup hook
  uninstall claude            Preview or remove only the owned Claude Code hook
  search --task TEXT         Show up to three applicable approved lessons
  explain --task TEXT        Show eligibility reasons for this repository
  disable | enable           Switch off/on all retrieval immediately
  doctor                     Check database integrity and current state

Options:
  --project PATH             Git repository path (default: current directory)
  --stack NAME               Stack context for search, or target of stack promotion
  --requires TERMS           All comma-separated terms must occur in the task
  --conflicts IDS            Reviewed conflict with these lesson IDs in this project
  --clear-conflicts          Remove conflict links in a reviewed revision
  --type NAME                Lesson type for capture or revise
  --result STATUS            Developer-reported result for attest
  --note TEXT                Short developer attestation; never machine evidence
  --expires YYYY-MM-DD        Optional date after which retrieval stops
  --platform NAME             Explicit target platform for a lesson or lookup
  --dependency NAME           Package whose version bounds apply, or lookup context
  --min-version X.Y.Z         Inclusive lower bound when drafting a lesson
  --before-version X.Y.Z      Exclusive upper bound when drafting a lesson
  --dependency-version X.Y.Z  Observed stable version for search/explain
  --clear-environment         Remove environment bounds in a reviewed revision
  --promotion-approval       Explicitly approve a stack/global promotion
  --dry-run                  Preview a delete
  --yes                      Apply integration changes or confirm deletion
  --config PATH              Override Claude settings path for integration work
  --host claude              Include Claude integration state in doctor
  --json                     Machine-readable output for search/explain/review
  --diff                     Show changed decision fields in a pending review

Local data: LESSONLAB_HOME overrides the OS user data directory.
No network access or transcript collection is used. Capture and retrieval do not edit source files.`;

function parse(args: string[]) {
  const [command, ...rest] = args;
  const separator = command === 'run-check' ? rest.indexOf('--') : -1;
  if (command === 'run-check' && separator < 0) throw new Error('run-check needs -- followed by a command and arguments');
  const options = separator < 0 ? rest : rest.slice(0, separator);
  const checkCommand = separator < 0 ? [] : rest.slice(separator + 1);
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (let i = 0; i < options.length; i++) {
    const part = options[i];
    if (!part.startsWith('--')) { positional.push(part); continue; }
    if (!['--project', '--title', '--lesson', '--when', '--requires', '--except', '--conflicts', '--clear-conflicts', '--verify', '--task', '--json', '--diff', '--type', '--result', '--note', '--expires', '--platform', '--dependency', '--min-version', '--before-version', '--dependency-version', '--clear-environment', '--stack', '--scope', '--revision', '--promotion-approval', '--output', '--all', '--yes', '--dry-run', '--config', '--host'].includes(part)) throw new Error(`Unknown option ${part}`);
    if (flags.has(part)) throw new Error(`Repeated option ${part}`);
    if (['--json', '--diff', '--clear-environment', '--clear-conflicts', '--promotion-approval', '--all', '--yes', '--dry-run'].includes(part)) { flags.set(part, true); continue; }
    const value = options[++i];
    if (!value || value.startsWith('--')) throw new Error(`${part} needs a value`);
    flags.set(part, value);
  }
  return { command, positional, flags, checkCommand };
}

function required(flags: Map<string, string | boolean>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== 'string') throw new Error(`${name} is required`);
  return value;
}

function conflictIds(db: ReturnType<typeof openStore>['db'], value: unknown, projectId: string, selfId?: string): string[] {
  const ids = parseConflictIds(value);
  for (const id of ids) {
    const target = activeLesson(db, id);
    if (id === selfId || !target || target.projectId !== projectId) throw new Error('conflict target must be another approved lesson in this project');
  }
  return ids;
}

function main() {
  const { command, positional, flags, checkCommand } = parse(process.argv.slice(2));
  if (!command || command === 'help' || command === '--help') { console.log(usage); return; }
  if (!['init', 'capture', 'review', 'history', 'approve', 'attest', 'run-check', 'reject', 'revise', 'promote', 'retire', 'rollback', 'backup', 'export', 'delete', 'integrate', 'uninstall', 'search', 'explain', 'disable', 'enable', 'doctor'].includes(command)) throw new Error(`Unknown command ${command}`);
  if (command === 'integrate' || command === 'uninstall') {
    if (positional.length !== 1 || positional[0] !== 'claude') throw new Error('Only Claude Code has a supported read-only hook; Cursor uses the portable skill');
    console.log(JSON.stringify(changeClaudeIntegration(command === 'integrate' ? 'install' : 'uninstall', flags.get('--config') as string | undefined, !flags.has('--yes')), null, 2));
    return;
  }
  const readOnly = ['search', 'explain', 'review', 'history', 'doctor', 'export'].includes(command);
  const { db, path } = readOnly
    ? { db: openReadStore(), path: join(dataDirectory(), 'lessons.sqlite') }
    : openStore();
  try {
    if (command === 'init') { console.log(`Local store ready: ${path}`); return; }
    if (command === 'backup') { console.log(`Backup saved: ${backupDatabase(db)}`); return; }
    if (command === 'doctor') {
      console.log(JSON.stringify({ path, integrity: integrity(db), invalidRecords: invalidRecordCount(db), enabled: isEnabled(db), schema: 2, runtime: process.version, claude: flags.get('--host') === 'claude' ? claudeIntegration(flags.get('--config') as string | undefined) : undefined }, null, 2));
      return;
    }
    if (command === 'disable' || command === 'enable') {
      setEnabled(db, command === 'enable');
      console.log(`Retrieval ${command === 'enable' ? 'enabled' : 'disabled'}.`);
      return;
    }
    if (command === 'delete' && flags.has('--all')) {
      if (!flags.has('--yes') && !flags.has('--dry-run')) throw new Error('delete --all requires --yes');
      if (flags.has('--dry-run')) console.log('Would delete all stored lessons, audit history, and local backups.');
      else { deleteAll(db); console.log('All stored lessons and local backups deleted. External exports remain your responsibility.'); }
      return;
    }
    const project = projectIdentity(String(flags.get('--project') || process.cwd()));
    if (command === 'export') {
      const output = resolve(required(flags, '--output'));
      writeFileSync(output, JSON.stringify(exportProject(db, project.id), null, 2), { flag: 'wx', mode: 0o600 });
      console.log(`Project export saved: ${output}`);
      return;
    }
    if (command === 'delete') {
      if (positional.length !== 1) throw new Error('delete needs one lesson ID or --all');
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      if (!flags.has('--yes') && !flags.has('--dry-run')) throw new Error('delete requires --yes');
      if (flags.has('--dry-run')) console.log(`Would delete ${existing.id}, all its revisions and audit, and every local backup of this store (including other projects).`);
      else { deleteLesson(db, existing.id); console.log(`Deleted ${existing.id} and every local backup of this store (including other projects). External exports remain your responsibility.`); }
      return;
    }
    if (command === 'capture') {
      if (flags.has('--clear-environment') || flags.has('--clear-conflicts') || flags.has('--dependency-version')) throw new Error('capture uses bounds and conflict IDs, not lookup version or clear flags');
      const lesson = newLesson({ projectId: project.id, title: required(flags, '--title'), lesson: required(flags, '--lesson'), when: required(flags, '--when'), requires: flags.get('--requires'), except: flags.get('--except'), verify: required(flags, '--verify'), type: flags.get('--type'), expires: flags.get('--expires'),
        conflicts: flags.has('--conflicts') ? conflictIds(db, flags.get('--conflicts'), project.id).join(',') : undefined,
        platform: flags.get('--platform'), dependency: flags.get('--dependency'), minVersion: flags.get('--min-version'), beforeVersion: flags.get('--before-version') });
      insertLesson(db, lesson);
      console.log(`Draft ${lesson.id} saved for ${project.root}. Run lessonlab review ${lesson.id}, then lessonlab approve ${lesson.id}.`);
      return;
    }
    if (command === 'review') {
      const value = positional[0] ? currentLesson(db, positional[0]) : projectLessons(db, project.id);
      if (positional[0] && (!value || (value as { projectId: string }).projectId !== project.id)) throw new Error('Lesson not found in this project');
      if (flags.has('--diff')) {
        if (!positional[0] || Array.isArray(value) || value?.status !== 'proposed') throw new Error('review --diff needs one pending draft ID');
        console.log(JSON.stringify(reviewDiff(activeLesson(db, value.id), value), null, 2));
      } else console.log(JSON.stringify(value, null, 2));
      return;
    }
    if (command === 'history') {
      if (positional.length !== 1) throw new Error('history needs one lesson ID');
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      console.log(JSON.stringify(history(db, existing.id), null, 2));
      return;
    }
    if (command === 'attest' || command === 'run-check') {
      if (positional.length !== 1) throw new Error(`${command} needs one lesson ID`);
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      if (command === 'attest') {
        const result = required(flags, '--result');
        if (result !== 'passed' && result !== 'failed' && result !== 'unknown') throw new Error('result must be passed, failed, or unknown');
        const note = safeText(required(flags, '--note'), 'attestation note', 300);
        const updated = recordEvidence(db, existing, { kind: 'developer_attestation', result, note, at: new Date().toISOString(), contentHash: existing.hash });
        console.log(`Developer attestation ${result} recorded for ${updated.id} revision ${updated.revision}.`);
        return;
      }
      if (!checkCommand.length || checkCommand.length > 64) throw new Error('run-check needs 1-64 command arguments');
      const argv = checkCommand.map(arg => safeText(arg, 'command argument', 300));
      const observed = spawnSync(argv[0], argv.slice(1), { cwd: project.root, shell: false, timeout: 120_000, killSignal: 'SIGKILL', maxBuffer: 262_144, encoding: 'buffer' });
      const exitCode = observed.error || observed.signal ? null : observed.status;
      const result = exitCode === null ? 'unknown' : exitCode === 0 ? 'passed' : 'failed';
      const outputBytes = (observed.stdout?.length || 0) + (observed.stderr?.length || 0);
      const updated = recordEvidence(db, existing, {
        kind: 'machine_check', result, command: argv,
        environment: { platform: platform(), arch: arch(), node: process.version },
        exitCode, outputBytes, at: new Date().toISOString(), contentHash: existing.hash,
      });
      console.log(`Observed check ${result} (exit ${exitCode === null ? 'unknown' : exitCode}) recorded for ${updated.id} revision ${updated.revision}. Output was not retained.`);
      if (result !== 'passed') process.exitCode = 1;
      return;
    }
    if (command === 'approve' || command === 'reject' || command === 'retire') {
      if (positional.length !== 1) throw new Error(`${command} needs one lesson ID`);
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      if (command === 'approve' && existing.scope.level !== 'project' && !flags.has('--promotion-approval')) throw new Error('Broader scope requires --promotion-approval after reviewing the draft');
      const changed = changeStatus(db, existing, command === 'approve' ? 'approved' : command === 'reject' ? 'rejected' : 'retired');
      console.log(`${changed.status} ${changed.id} revision ${changed.revision}`);
      return;
    }
    if (command === 'revise' || command === 'promote') {
      if (positional.length !== 1) throw new Error(`${command} needs one lesson ID`);
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      const environmentFlags = ['--platform', '--dependency', '--min-version', '--before-version'];
      if (command === 'revise' && !['--title', '--lesson', '--when', '--requires', '--except', '--conflicts', '--clear-conflicts', '--verify', '--type', '--expires', '--clear-environment', ...environmentFlags].some(x => flags.has(x))) throw new Error('revise needs at least one changed field');
      if (command === 'revise' && flags.has('--clear-environment') && environmentFlags.some(x => flags.has(x))) throw new Error('clear-environment cannot be combined with environment bounds');
      if (command === 'revise' && flags.has('--clear-conflicts') && flags.has('--conflicts')) throw new Error('clear-conflicts cannot be combined with conflict IDs');
      if (command === 'revise' && flags.has('--dependency-version')) throw new Error('revise uses bounds, not a lookup version');
      const draft = proposeRevision(db, existing.id, active => {
        if (command === 'promote') {
          const level = required(flags, '--scope');
          if (level !== 'stack' && level !== 'global') throw new Error('scope must be stack or global');
          const scope: LessonScope = level === 'stack' ? { level, stack: safeText(required(flags, '--stack'), 'stack', 80).toLowerCase() } : { level };
          return { ...active, scope };
        }
        const type = flags.get('--type');
        if (type !== undefined && !['preference', 'workflow', 'diagnostic', 'technical_fact', 'known_pitfall'].includes(String(type))) throw new Error('type is invalid');
        return { ...active,
          title: flags.has('--title') ? safeText(flags.get('--title'), 'title', 120) : active.title,
          lesson: flags.has('--lesson') ? safeText(flags.get('--lesson'), 'lesson') : active.lesson,
          triggers: flags.has('--when') ? parseTerms(flags.get('--when'), 'when', true) : active.triggers,
          requires: flags.has('--requires') ? parseTerms(flags.get('--requires'), 'requires') : active.requires,
          exclusions: flags.has('--except') ? parseTerms(flags.get('--except'), 'except') : active.exclusions,
          conflicts: flags.has('--clear-conflicts') ? [] : flags.has('--conflicts') ? conflictIds(db, flags.get('--conflicts'), project.id, active.id) : active.conflicts,
          verify: flags.has('--verify') ? safeText(flags.get('--verify'), 'verify', 300) : active.verify,
          type: (type || active.type) as typeof active.type,
          expiresAt: flags.has('--expires') ? validExpiry(flags.get('--expires')) : active.expiresAt,
          environment: flags.has('--clear-environment') ? undefined : environmentFlags.some(x => flags.has(x))
            ? lessonEnvironment({ platform: flags.get('--platform'), dependency: flags.get('--dependency'), minVersion: flags.get('--min-version'), beforeVersion: flags.get('--before-version') })
            : active.environment,
        };
      });
      console.log(`Draft revision ${draft.revision} of ${draft.id} saved. Review before approval.`);
      return;
    }
    if (command === 'rollback') {
      if (positional.length !== 1) throw new Error('rollback needs one lesson ID');
      const existing = currentLesson(db, positional[0]);
      if (!existing || existing.projectId !== project.id) throw new Error('Lesson not found in this project');
      const revision = Number(required(flags, '--revision'));
      if (!Number.isInteger(revision) || revision < 1) throw new Error('revision must be a positive integer');
      const restored = rollback(db, existing.id, revision);
      console.log(`restored ${restored.id} revision ${restored.revision}`);
      return;
    }
    if (command === 'search' || command === 'explain') {
      const task = safeText(required(flags, '--task'), 'task', 1000);
      if (flags.has('--min-version') || flags.has('--before-version') || flags.has('--clear-environment')) throw new Error('search/explain take a dependency-version, not lesson bounds');
      if (flags.has('--dependency-version') && !flags.has('--dependency')) throw new Error('dependency-version needs a dependency');
      const environment: TaskEnvironment = {
        platform: flags.has('--platform') ? platformName(flags.get('--platform')) : undefined,
        dependency: flags.has('--dependency') ? { name: dependencyName(flags.get('--dependency')), version: flags.has('--dependency-version') ? safeText(flags.get('--dependency-version'), 'dependency-version', 80) : undefined } : undefined,
      };
      if (command === 'explain') {
        const result = explain(db, project.id, task, flags.get('--stack') as string | undefined, environment).map(x => ({ id: x.lesson.id, title: x.lesson.title, eligible: x.eligible, reason: x.reason }));
        console.log(JSON.stringify(result, null, 2));
      } else {
        const result = selected(db, project.id, task, flags.get('--stack') as string | undefined, environment);
        console.log(flags.has('--json') ? JSON.stringify(result.map(x => x.lesson), null, 2) : render(result));
      }
    }
  } finally { db.close(); }
}

try { main(); } catch (error) {
  console.error(`lessonlab: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
