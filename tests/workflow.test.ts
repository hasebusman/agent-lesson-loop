import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { projectIdentity } from '../src/project.ts';
import { contentHash } from '../src/model.ts';

const cli = resolve('bin/lessonlab.ts');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lessonlab-test-'));
  const a = join(root, 'project-a');
  const b = join(root, 'project-b');
  mkdirSync(a); mkdirSync(b);
  execFileSync('git', ['init', '-q', a]);
  execFileSync('git', ['init', '-q', b]);
  return { root, a, b, env: { ...process.env, LESSONLAB_HOME: join(root, 'data') } };
}

function run(env: NodeJS.ProcessEnv, ...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
}

function ok(result: ReturnType<typeof run>) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('reviewed lesson stays in its repository, honors exception and disable, and can retire', () => {
  const f = fixture();
  ok(run(f.env, 'init'));
  const draft = ok(run(f.env, 'capture', '--project', f.a,
    '--title', 'Keep existing login UI', '--lesson', 'Fix auth without changing the screen.',
    '--when', 'auth,login', '--except', 'redesign', '--verify', 'Run auth checks'));
  const id = draft.match(/[0-9a-f-]{36}/)?.[0];
  assert.ok(id);
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login auth')), '');
  assert.equal(JSON.parse(ok(run(f.env, 'review', id, '--project', f.a))).status, 'proposed');
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login auth')), /Keep existing login UI/);
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--task', 'Fix login auth')), '');
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Redesign login auth')), '');
  assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Redesign login auth')), /exception matched/);
  ok(run(f.env, 'disable'));
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login auth')), '');
  ok(run(f.env, 'enable'));
  ok(run(f.env, 'retire', id, '--project', f.a));
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login auth')), '');
  assert.equal(JSON.parse(ok(run(f.env, 'review', id, '--project', f.a))).revision, 3);
  assert.equal(JSON.parse(ok(run(f.env, 'doctor'))).integrity, 'ok');
  assert.equal(readFileSync(join(f.root, 'data', 'lessons.sqlite')).length > 0, true);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(f.root, 'data')).mode & 0o777, 0o700);
    assert.equal(statSync(join(f.root, 'data', 'lessons.sqlite')).mode & 0o777, 0o600);
  }
});

test('symlink resolves to same project; another repository has a different identity', () => {
  const f = fixture();
  const alias = join(f.root, 'alias');
  symlinkSync(f.a, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const originalId = projectIdentity(f.a).id;
  assert.equal(projectIdentity(alias).id, originalId);
  const nested = join(f.a, 'src', 'nested');
  mkdirSync(nested, { recursive: true });
  assert.equal(projectIdentity(nested).id, originalId);
  assert.notEqual(originalId, projectIdentity(f.b).id);
  const renamed = join(f.root, 'renamed-a');
  renameSync(f.a, renamed);
  assert.equal(projectIdentity(renamed).id, originalId);
});

test('Git worktrees share the same repository identity', () => {
  const f = fixture();
  writeFileSync(join(f.a, 'README.md'), 'fixture');
  execFileSync('git', ['-C', f.a, 'add', 'README.md']);
  execFileSync('git', ['-C', f.a, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
  const worktree = join(f.root, 'worktree-a');
  execFileSync('git', ['-C', f.a, 'worktree', 'add', '-q', worktree, '-b', 'other']);
  assert.equal(projectIdentity(f.a).id, projectIdentity(worktree).id);
});

test('obvious private values are rejected before any lesson is stored', () => {
  const f = fixture();
  const result = run(f.env, 'capture', '--project', f.a,
    '--title', 'API key', '--lesson', 'Use password=topsecret', '--when', 'auth', '--verify', 'Check tests');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /private data/);
  assert.equal(JSON.parse(ok(run(f.env, 'review', '--project', f.a))).length, 0);
});

test('concurrent first-run captures keep every draft', async () => {
  const f = fixture();
  const captures = Array.from({ length: 8 }, (_, i) => new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, 'capture', '--project', f.a,
      '--title', `Correction ${i}`, '--lesson', `Keep behavior ${i}.`,
      '--when', 'login', '--verify', 'Check behavior'], { env: f.env });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('exit', code => code === 0 ? resolvePromise() : reject(new Error(stderr)));
  }));
  await Promise.all(captures);
  assert.equal(JSON.parse(ok(run(f.env, 'review', '--project', f.a))).length, 8);
});

test('concurrent revisions of one lesson cannot overwrite each other', async () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Preserve login',
    '--lesson', 'Keep the existing login behavior.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const revisions = await Promise.all(Array.from({ length: 6 }, (_, i) => new Promise<number>((resolvePromise) => {
    const child = spawn(process.execPath, [cli, 'revise', id, '--project', f.a, '--lesson', `Candidate ${i}.`], { env: f.env, stdio: 'ignore' });
    child.on('exit', code => resolvePromise(code ?? 1));
  })));
  assert.equal(revisions.filter(code => code === 0).length, 1);
  assert.equal(JSON.parse(ok(run(f.env, 'history', id, '--project', f.a))).length, 3);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /existing login behavior/);
});

test('revisions remain inactive until review; rejection preserves the last approved snapshot', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Preserve login',
    '--lesson', 'Keep the login layout.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'revise', id, '--project', f.a, '--lesson', 'Keep the entire login screen.'));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Keep the login layout/);
  ok(run(f.env, 'reject', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Keep the login layout/);
  ok(run(f.env, 'revise', id, '--project', f.a, '--lesson', 'Keep the entire login screen.'));
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /entire login screen/);
  ok(run(f.env, 'rollback', id, '--project', f.a, '--revision', '2'));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Keep the login layout/);
  assert.equal(JSON.parse(ok(run(f.env, 'history', id, '--project', f.a))).length, 7);
});

test('review diff shows exact pending content and scope changes before approval', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Keep login behavior',
    '--lesson', 'Preserve login behavior.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'revise', id, '--project', f.a, '--lesson', 'Preserve the login screen.', '--requires', 'screen'));
  const diff = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a, '--diff')));
  assert.equal(diff.fromRevision, 2);
  assert.equal(diff.toRevision, 3);
  assert.deepEqual(diff.changes, [
    { field: 'lesson', before: 'Preserve login behavior.', after: 'Preserve the login screen.' },
    { field: 'requires', before: [], after: ['screen'] },
  ]);
  assert.equal(run(f.env, 'review', id, '--project', f.b, '--diff').status, 1);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Preserve login behavior/);
  ok(run(f.env, 'reject', id, '--project', f.a));
  ok(run(f.env, 'promote', id, '--project', f.a, '--scope', 'global'));
  const promotion = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a, '--diff')));
  assert.deepEqual(promotion.changes, [
    { field: 'scope', before: { level: 'project' }, after: { level: 'global' } },
  ]);
});

test('cross-project stack promotion needs separate approval and matching stack', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Auth scope',
    '--lesson', 'Keep the login layout.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'promote', id, '--project', f.a, '--scope', 'stack', '--stack', 'react-native'));
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--stack', 'react-native', '--task', 'Fix login')), '');
  assert.equal(run(f.env, 'approve', id, '--project', f.a).status, 1);
  ok(run(f.env, 'approve', id, '--project', f.a, '--promotion-approval'));
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--task', 'Fix login')), '');
  assert.match(ok(run(f.env, 'search', '--project', f.b, '--stack', 'react-native', '--task', 'Fix login')), /Auth scope/);
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--stack', 'nextjs', '--task', 'Fix login')), '');
});

test('a remembered project design choice stays inside its repository', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--type', 'preference',
    '--title', 'Accent choice', '--lesson', 'Use a violet accent for this app.',
    '--when', 'accent,color', '--verify', 'Inspect the app palette'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  assert.deepEqual(JSON.parse(ok(run(f.env, 'review', id, '--project', f.a))).scope, { level: 'project' });
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Update accent color')), /violet accent/);
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--task', 'Update accent color')), '');
  assert.equal(ok(run(f.env, 'search', '--project', f.b, '--stack', 'react-native', '--task', 'Update accent color')), '');
  assert.deepEqual(JSON.parse(ok(run(f.env, 'explain', '--project', f.b, '--task', 'Update accent color', '--json'))), []);
});

test('a developer test claim remains an attestation and never becomes machine evidence', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Keep login behavior',
    '--lesson', 'Preserve login behavior.', '--when', 'login', '--verify', 'Run login test'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'attest', id, '--project', f.a, '--result', 'passed', '--note', 'I ran the login test'));
  const reviewed = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a)));
  assert.equal(reviewed.evidence.at(-1).kind, 'developer_attestation');
  assert.equal(reviewed.evidence.at(-1).result, 'passed');
  assert.equal(reviewed.evidence.some((item: { kind: string }) => item.kind === 'machine_check'), false);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /developer reported passed/);
});

test('observed checks preserve pass, failure, and unknown outcomes without storing output', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Keep login behavior',
    '--lesson', 'Preserve login behavior.', '--when', 'login', '--verify', 'Run login test'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run({ ...f.env, LESSONLAB_CANARY: 'password=topsecret' }, 'run-check', id, '--project', f.a,
    '--', process.execPath, '-e', 'process.stdout.write(process.env.LESSONLAB_CANARY || "")'));
  const failed = run(f.env, 'run-check', id, '--project', f.a, '--', process.execPath, '-e', 'process.exit(7)');
  assert.equal(failed.status, 1);
  const unknown = run(f.env, 'run-check', id, '--project', f.a, '--', 'missing-lessonlab-command');
  assert.equal(unknown.status, 1);
  const reviewed = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a)));
  const checks = reviewed.evidence.filter((item: { kind: string }) => item.kind === 'machine_check');
  assert.deepEqual(checks.map((item: { result: string }) => item.result), ['passed', 'failed', 'unknown']);
  assert.deepEqual(checks.map((item: { exitCode: number | null }) => item.exitCode), [0, 7, null]);
  assert.equal(checks[0].outputBytes, 'password=topsecret'.length);
  assert.equal(JSON.stringify(reviewed).includes('topsecret'), false);
  assert.equal(readFileSync(join(f.root, 'data', 'lessons.sqlite')).includes(Buffer.from('topsecret')), false);
  const output = join(f.root, 'check-export.json');
  ok(run(f.env, 'export', '--project', f.a, '--output', output));
  assert.equal(readFileSync(output, 'utf8').includes('topsecret'), false);
  const hook = spawnSync(process.execPath, [resolve('bin/hook.ts'), 'claude'], {
    env: f.env, input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: f.a, prompt: 'Fix login' }), encoding: 'utf8',
  });
  assert.equal(hook.status, 0);
  assert.equal(hook.stdout.includes('topsecret'), false);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /observed check unknown/);
});

test('revising lesson content does not present old check results as current proof', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Keep login behavior',
    '--lesson', 'Preserve login behavior.', '--when', 'login', '--verify', 'Run login test'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'run-check', id, '--project', f.a, '--', process.execPath, '-e', 'process.exit(0)'));
  ok(run(f.env, 'revise', id, '--project', f.a, '--lesson', 'Preserve the whole login flow.'));
  ok(run(f.env, 'approve', id, '--project', f.a));
  const reviewed = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a)));
  assert.equal(reviewed.evidence.some((item: { kind: string }) => item.kind === 'machine_check'), false);
  assert.doesNotMatch(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /observed check passed/);
  assert.equal(JSON.parse(ok(run(f.env, 'history', id, '--project', f.a))).some((item: { evidence: { kind: string }[] }) =>
    item.evidence.some(evidence => evidence.kind === 'machine_check')), true);
});

test('identical applicability abstains on same-scope overlap and prefers project scope', () => {
  const f = fixture();
  const create = (title: string, lesson: string) => {
    const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', title,
      '--lesson', lesson, '--when', 'login', '--verify', 'Inspect login'));
    const id = draft.match(/[0-9a-f-]{36}/)![0];
    ok(run(f.env, 'approve', id, '--project', f.a));
    return id;
  };
  const first = create('Keep the screen', 'Preserve the login layout.');
  const second = create('Change the screen', 'Change the login layout.');
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), '');
  assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Fix login')), /ambiguous overlap/);
  ok(run(f.env, 'retire', second, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Keep the screen/);
  ok(run(f.env, 'promote', first, '--project', f.a, '--scope', 'global'));
  ok(run(f.env, 'approve', first, '--project', f.a, '--promotion-approval'));
  const local = ok(run(f.env, 'capture', '--project', f.b, '--title', 'Local login advice',
    '--lesson', 'Inspect the local login behavior.', '--when', 'login', '--verify', 'Inspect login'));
  const localId = local.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', localId, '--project', f.b));
  const result = ok(run(f.env, 'search', '--project', f.b, '--task', 'Fix login'));
  assert.match(result, /Local login advice/);
  assert.doesNotMatch(result, /Keep the screen/);
});

test('required subtask context suppresses a related but different task', () => {
  const f = fixture();
  const capture = (project: string, requires?: string) => {
    const args = ['capture', '--project', project, '--title', 'Keep auth screen',
      '--lesson', 'Preserve the screen during auth changes.', '--when', 'auth', '--verify', 'Inspect screen'];
    if (requires) args.push('--requires', requires);
    const draft = ok(run(f.env, ...args));
    const id = draft.match(/[0-9a-f-]{36}/)![0];
    ok(run(f.env, 'approve', id, '--project', project));
    return id;
  };
  capture(f.a, 'screen');
  capture(f.b);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth screen')), /Keep auth screen/);
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth API')), '');
  assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Fix auth API')), /required context missing/);
  assert.match(ok(run(f.env, 'search', '--project', f.b, '--task', 'Fix auth API')), /Keep auth screen/);
});

test('older schema-v2 records without required terms retain their content hash', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Existing auth rule',
    '--lesson', 'Keep the existing auth behavior.', '--when', 'auth', '--verify', 'Inspect auth'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const db = new DatabaseSync(join(f.root, 'data', 'lessons.sqlite'));
  const row = db.prepare('SELECT data FROM lesson_revisions WHERE id=? AND revision=2').get(id) as { data: string };
  const previousShape = JSON.parse(row.data);
  delete previousShape.requires;
  db.prepare('UPDATE lesson_revisions SET data=? WHERE id=? AND revision=2').run(JSON.stringify(previousShape), id);
  db.close();
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth')), /Existing auth rule/);
});

test('a narrower subtask lesson shadows a general one only after approval', () => {
  const f = fixture();
  const capture = (title: string, requires?: string) => {
    const args = ['capture', '--project', f.a, '--title', title,
      '--lesson', `Advice for ${title}.`, '--when', 'auth', '--verify', 'Inspect auth'];
    if (requires) args.push('--requires', requires);
    const draft = ok(run(f.env, ...args));
    const id = draft.match(/[0-9a-f-]{36}/)![0];
    ok(run(f.env, 'approve', id, '--project', f.a));
    return id;
  };
  capture('General auth');
  const narrow = capture('Auth screen', 'screen');
  const before = ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth screen'));
  assert.match(before, /Auth screen/);
  assert.doesNotMatch(before, /General auth/);
  ok(run(f.env, 'revise', narrow, '--project', f.a, '--requires', 'layout'));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth screen')), /Auth screen/);
  ok(run(f.env, 'approve', narrow, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth screen')), /General auth/);
  const after = ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix auth layout'));
  assert.match(after, /Auth screen/);
  assert.doesNotMatch(after, /General auth/);
});

test('expired technical facts are suppressed', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Old workaround',
    '--lesson', 'Use the old workaround.', '--when', 'firebase', '--verify', 'Check version',
    '--type', 'technical_fact', '--expires', '2020-01-01'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix firebase')), '');
  assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Fix firebase')), /expired/);
});

test('version-bound technical facts abstain on missing, mismatched, and prerelease context', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--type', 'technical_fact',
    '--title', 'Firebase iOS workaround', '--lesson', 'Use the version-ten workaround.',
    '--when', 'firebase', '--verify', 'Run the iOS build', '--platform', 'ios',
    '--dependency', 'firebase', '--min-version', '10.0.0', '--before-version', '11.0.0'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const query = ['--project', f.a, '--task', 'Fix firebase'];
  assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Fix typography')), /no trigger matched/);
  assert.equal(ok(run(f.env, 'search', ...query)), '');
  assert.match(ok(run(f.env, 'explain', ...query)), /platform unknown/);
  assert.equal(ok(run(f.env, 'search', ...query, '--platform', 'android', '--dependency', 'firebase', '--dependency-version', '10.4.0')), '');
  assert.match(ok(run(f.env, 'explain', ...query, '--platform', 'android', '--dependency', 'firebase', '--dependency-version', '10.4.0')), /platform mismatch/);
  assert.match(ok(run(f.env, 'explain', ...query, '--platform', 'ios')), /dependency unknown/);
  assert.match(ok(run(f.env, 'explain', ...query, '--platform', 'ios', '--dependency', 'firebase')), /dependency version unknown/);
  assert.equal(ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '9.9.9')), '');
  assert.match(ok(run(f.env, 'explain', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '9.9.9')), /dependency version outside range/);
  const selected = ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '10.4.0'));
  assert.match(selected, /Firebase iOS workaround/);
  assert.match(selected, /ENV ios; firebase >=10.0.0 <11.0.0/);
  assert.equal(ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '11.0.0')), '');
  assert.match(ok(run(f.env, 'explain', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '10.4.0-beta.1')), /dependency version unknown/);

  ok(run(f.env, 'revise', id, '--project', f.a, '--platform', 'ios', '--dependency', 'firebase', '--min-version', '11.0.0', '--before-version', '12.0.0'));
  const diff = JSON.parse(ok(run(f.env, 'review', id, '--project', f.a, '--diff')));
  assert.deepEqual(diff.changes.map((change: { field: string }) => change.field), ['environment']);
  assert.match(ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '10.4.0')), /Firebase iOS workaround/);
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.equal(ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '10.4.0')), '');
  assert.match(ok(run(f.env, 'search', ...query, '--platform', 'ios', '--dependency', 'firebase', '--dependency-version', '11.1.0')), /Firebase iOS workaround/);

  ok(run(f.env, 'revise', id, '--project', f.a, '--clear-environment'));
  assert.equal(ok(run(f.env, 'search', ...query)), '');
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', ...query)), /Firebase iOS workaround/);
});

test('invalid version bounds are rejected and existing lessons remain readable', () => {
  const f = fixture();
  const invalid = run(f.env, 'capture', '--project', f.a, '--type', 'technical_fact',
    '--title', 'Bad range', '--lesson', 'Use a workaround.', '--when', 'firebase', '--verify', 'Build',
    '--dependency', 'firebase', '--min-version', '11.0.0', '--before-version', '10.0.0');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /version range/);
  assert.equal(JSON.parse(ok(run(f.env, 'review', '--project', f.a))).length, 0);
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Stable preference',
    '--lesson', 'Keep the existing UI.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Stable preference/);
});

test('invalid calendar expiry is rejected before capture', () => {
  const f = fixture();
  const result = run(f.env, 'capture', '--project', f.a, '--title', 'Calendar fact',
    '--lesson', 'Check the installed version.', '--when', 'firebase', '--verify', 'Inspect version',
    '--expires', '2026-02-31');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /valid YYYY-MM-DD date/);
  assert.equal(JSON.parse(ok(run(f.env, 'review', '--project', f.a))).length, 0);
});

test('backup, export, dry-run and deletion preserve privacy boundaries', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Layout',
    '--lesson', 'Keep existing layout.', '--when', 'login', '--verify', 'Inspect layout'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const backup = ok(run(f.env, 'backup')).replace('Backup saved: ', '');
  assert.ok(existsSync(backup));
  const output = join(f.root, 'export.json');
  ok(run(f.env, 'export', '--project', f.a, '--output', output));
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).lessons[0].revisions.length, 2);
  assert.equal(run(f.env, 'export', '--project', f.a, '--output', output).status, 1);
  ok(run(f.env, 'delete', id, '--project', f.a, '--dry-run'));
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Layout/);
  assert.equal(run(f.env, 'delete', id, '--project', f.a).status, 1);
  ok(run(f.env, 'delete', id, '--project', f.a, '--yes'));
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), '');
  assert.equal(existsSync(join(f.root, 'data', 'backups')), false);
});

test('v1 store migrates transactionally and keeps a private backup', () => {
  const f = fixture();
  mkdirSync(join(f.root, 'data'));
  const db = new DatabaseSync(join(f.root, 'data', 'lessons.sqlite'));
  db.exec(`CREATE TABLE lesson_revisions (id TEXT NOT NULL, revision INTEGER NOT NULL, project_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('proposed','approved','retired')), data TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(id, revision)) STRICT;
    CREATE TABLE lesson_current (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, project_id TEXT NOT NULL,
      status TEXT NOT NULL, FOREIGN KEY(id, revision) REFERENCES lesson_revisions(id, revision)) STRICT;
    CREATE TABLE audit (event_id INTEGER PRIMARY KEY, lesson_id TEXT NOT NULL, revision INTEGER NOT NULL,
      action TEXT NOT NULL, occurred_at TEXT NOT NULL,
      FOREIGN KEY(lesson_id, revision) REFERENCES lesson_revisions(id, revision)) STRICT;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    INSERT INTO settings VALUES ('enabled','1');
    CREATE VIRTUAL TABLE lesson_fts USING fts5(id UNINDEXED, title, lesson, triggers);
    PRAGMA user_version=1;`);
  const id = '00000000-0000-4000-8000-000000000001';
  const projectId = projectIdentity(f.a).id;
  const old = { id, revision: 2, status: 'approved', projectId, title: 'Old login lesson',
    lesson: 'Keep the login layout.', triggers: ['login'], exclusions: [], verify: 'Inspect login',
    sourceKind: 'manual_correction_attestation', createdAt: '2026-01-01T00:00:00Z', approvedAt: '2026-01-02T00:00:00Z' };
  db.prepare('INSERT INTO lesson_revisions VALUES (?,?,?,?,?,?)').run(id, 2, projectId, 'approved', JSON.stringify(old), old.createdAt);
  db.prepare('INSERT INTO lesson_current VALUES (?,?,?,?)').run(id, 2, projectId, 'approved');
  db.prepare('INSERT INTO audit(lesson_id,revision,action,occurred_at) VALUES (?,?,?,?)').run(id, 2, 'approved', old.approvedAt);
  db.prepare('INSERT INTO lesson_fts(id,title,lesson,triggers) VALUES (?,?,?,?)').run(id, old.title, old.lesson, 'login');
  db.close();
  assert.match(run(f.env, 'search', '--project', f.a, '--task', 'Fix login').stderr, /explicit CLI migration/);
  ok(run(f.env, 'init'));
  assert.equal(JSON.parse(ok(run(f.env, 'doctor'))).schema, 2);
  assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Old login lesson/);
  const backups = readdirSync(join(f.root, 'data', 'backups'));
  assert.equal(backups.length, 1);
  const restoredHome = join(f.root, 'restored-data');
  mkdirSync(restoredHome);
  copyFileSync(join(f.root, 'data', 'backups', backups[0]), join(restoredHome, 'lessons.sqlite'));
  const restoredEnv = { ...f.env, LESSONLAB_HOME: restoredHome };
  ok(run(restoredEnv, 'init'));
  assert.equal(JSON.parse(ok(run(restoredEnv, 'doctor'))).schema, 2);
  assert.match(ok(run(restoredEnv, 'search', '--project', f.a, '--task', 'Fix login')), /Old login lesson/);
});

test('Claude integration previews, installs idempotently, and removes only its own hook', () => {
  const f = fixture();
  const config = join(f.root, 'settings.json');
  const original = { model: 'example', hooks: { Stop: [{ hooks: [{ type: 'command', command: '/other/tool' }] }] } };
  writeFileSync(config, JSON.stringify(original));
  assert.equal(JSON.parse(ok(run(f.env, 'integrate', 'claude', '--config', config))).changed, true);
  assert.deepEqual(JSON.parse(readFileSync(config, 'utf8')), original);
  ok(run(f.env, 'integrate', 'claude', '--config', config, '--yes'));
  assert.equal(JSON.parse(ok(run(f.env, 'integrate', 'claude', '--config', config, '--yes'))).changed, false);
  const installed = JSON.parse(readFileSync(config, 'utf8'));
  assert.equal(installed.hooks.UserPromptSubmit.length, 1);
  assert.deepEqual(installed.hooks.Stop, original.hooks.Stop);
  ok(run(f.env, 'init'));
  assert.equal(JSON.parse(ok(run(f.env, 'doctor', '--host', 'claude', '--config', config))).claude.installed, true);
  assert.equal(JSON.parse(ok(run(f.env, 'uninstall', 'claude', '--config', config))).changed, true);
  ok(run(f.env, 'uninstall', 'claude', '--config', config, '--yes'));
  assert.deepEqual(JSON.parse(readFileSync(config, 'utf8')), original);
  assert.equal(JSON.parse(ok(run(f.env, 'uninstall', 'claude', '--config', config, '--yes'))).changed, false);
  assert.ok(readdirSync(f.root).some(name => name.includes('.bak')));
});

test('Claude hook renders approved lessons, never stores prompts, and fails open', () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Login layout',
    '--lesson', 'Keep the login screen.', '--when', 'login', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const payload = { hook_event_name: 'UserPromptSubmit', cwd: f.a, session_id: 'abc', prompt: 'Fix login' };
  const call = spawnSync(process.execPath, [resolve('bin/hook.ts'), 'claude'], { env: f.env, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(call.status, 0);
  assert.match(JSON.parse(call.stdout).hookSpecificOutput.additionalContext, /Login layout/);
  assert.equal(JSON.parse(ok(run(f.env, 'history', id, '--project', f.a))).length, 2);
  ok(run(f.env, 'disable'));
  const disabled = spawnSync(process.execPath, [resolve('bin/hook.ts'), 'claude'], { env: f.env, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(disabled.status, 0);
  assert.equal(disabled.stdout, '');
  const malformed = spawnSync(process.execPath, [resolve('bin/hook.ts'), 'claude'], { env: f.env, input: '{', encoding: 'utf8' });
  assert.equal(malformed.status, 0);
  assert.equal(malformed.stdout, '');
});

test('Claude hook does not initialize an absent store', () => {
  const f = fixture();
  const payload = { hook_event_name: 'UserPromptSubmit', cwd: f.a, prompt: 'Fix login' };
  const call = spawnSync(process.execPath, [resolve('bin/hook.ts'), 'claude'],
    { env: f.env, input: JSON.stringify(payload), encoding: 'utf8' });
  assert.equal(call.status, 0);
  assert.equal(call.stdout, '');
  assert.equal(existsSync(join(f.root, 'data')), false);
});

test('read-only CLI lookup does not create an absent store', () => {
  const f = fixture();
  assert.equal(run(f.env, 'search', '--project', f.a, '--task', 'Fix login').status, 1);
  assert.equal(run(f.env, 'doctor').status, 1);
  assert.equal(existsSync(join(f.root, 'data')), false);
});

test('lookup and review commands work without store write permission', { skip: process.platform === 'win32' }, () => {
  const f = fixture();
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Keep login screen',
    '--lesson', 'Preserve the login screen.', '--when', 'login', '--except', 'redesign', '--verify', 'Inspect login'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login'));
  const directory = join(f.root, 'data');
  const database = join(directory, 'lessons.sqlite');
  chmodSync(directory, 0o500);
  chmodSync(database, 0o400);
  try {
    assert.match(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), /Keep login screen/);
    assert.match(ok(run(f.env, 'explain', '--project', f.a, '--task', 'Redesign login')), /exception matched/);
    assert.equal(JSON.parse(ok(run(f.env, 'review', id, '--project', f.a))).title, 'Keep login screen');
    assert.equal(JSON.parse(ok(run(f.env, 'history', id, '--project', f.a))).length, 2);
    const output = join(f.root, 'readonly-store-export.json');
    ok(run(f.env, 'export', '--project', f.a, '--output', output));
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).lessons.length, 1);
    assert.equal(JSON.parse(ok(run(f.env, 'doctor'))).integrity, 'ok');
    assert.equal(statSync(directory).mode & 0o777, 0o500);
    assert.equal(statSync(database).mode & 0o777, 0o400);
  } finally {
    chmodSync(directory, 0o700);
    chmodSync(database, 0o600);
  }
});

test('secret canaries cannot be captured and tampered stored content is suppressed', () => {
  const f = fixture();
  const canaries = [
    'password=topsecret',
    'ghp_abcdefghijklmnopqrst1234567890',
    'gho_abcdefghijklmnopqrst1234567890',
    'ghs_abcdefghijklmnopqrst1234567890',
    'person@example.com',
    '-----BEGIN PRIVATE KEY-----',
  ];
  for (const canary of canaries) {
    const result = run(f.env, 'capture', '--project', f.a, '--title', 'Secret test',
      '--lesson', canary, '--when', 'login', '--verify', 'Check');
    assert.equal(result.status, 1, canary);
  }
  const dbPath = join(f.root, 'data', 'lessons.sqlite');
  const bytes = readFileSync(dbPath);
  for (const canary of canaries) assert.equal(bytes.includes(Buffer.from(canary)), false);

  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Safe login',
    '--lesson', 'Keep layout.', '--when', 'login', '--verify', 'Inspect layout'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT data FROM lesson_revisions WHERE id=? AND revision=2').get(id) as { data: string };
  const poisoned = JSON.parse(row.data);
  poisoned.lesson = 'password=topsecret';
  poisoned.hash = contentHash(poisoned);
  db.prepare('UPDATE lesson_revisions SET data=? WHERE id=? AND revision=2').run(JSON.stringify(poisoned), id);
  db.close();
  assert.equal(ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login')), '');
  assert.equal(JSON.parse(ok(run(f.env, 'doctor'))).invalidRecords, 1);
});

test('capture and retrieval do not modify the source repository', () => {
  const f = fixture();
  writeFileSync(join(f.a, 'README.md'), 'source fixture');
  execFileSync('git', ['-C', f.a, 'add', 'README.md']);
  execFileSync('git', ['-C', f.a, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
  const draft = ok(run(f.env, 'capture', '--project', f.a, '--title', 'Read only',
    '--lesson', 'Keep layout.', '--when', 'login', '--verify', 'Inspect layout'));
  const id = draft.match(/[0-9a-f-]{36}/)![0];
  ok(run(f.env, 'approve', id, '--project', f.a));
  ok(run(f.env, 'search', '--project', f.a, '--task', 'Fix login'));
  assert.equal(execFileSync('git', ['-C', f.a, 'status', '--porcelain'], { encoding: 'utf8' }), '');
});

test('SQLite rolls back a process killed during a write transaction', { skip: process.platform === 'win32' }, () => {
  const f = fixture();
  ok(run(f.env, 'init'));
  const dbPath = join(f.root, 'data', 'lessons.sqlite');
  const script = "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"BEGIN IMMEDIATE;UPDATE settings SET value='0' WHERE key='enabled'\");process.kill(process.pid,'SIGKILL')";
  spawnSync(process.execPath, ['-e', script, dbPath], { env: f.env });
  assert.equal(JSON.parse(ok(run(f.env, 'doctor'))).enabled, true);
});
