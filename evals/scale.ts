import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { newLesson } from '../src/model.ts';
import { projectIdentity } from '../src/project.ts';
import { selected } from '../src/retrieve.ts';
import { changeStatus, insertLesson, openStore } from '../src/store.ts';

const root = mkdtempSync(join(tmpdir(), 'lessonlab-scale-'));
const project = join(root, 'project');
mkdirSync(project);
execFileSync('git', ['init', '-q', project]);
process.env.LESSONLAB_HOME = join(root, 'data');
const db = openStore().db;
try {
  const projectId = projectIdentity(project).id;
  const count = 10_000;
  const setupStart = performance.now();
  for (let i = 0; i < count; i++) {
    const lesson = newLesson({ projectId, title: `Rule ${i}`, lesson: `Keep behavior ${i} stable.`, when: `feature${i}`,
      verify: `Check feature${i}` });
    insertLesson(db, lesson);
    changeStatus(db, lesson, 'approved');
  }
  const setupMs = performance.now() - setupStart;
  const durations: number[] = [];
  for (let i = 0; i < 50; i++) {
    const start = performance.now();
    selected(db, projectId, `Fix feature${(i * 199) % count}`);
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const hookPath = fileURLToPath(new URL('../bin/hook.ts', import.meta.url));
  const hookDurations: number[] = [];
  const estimatedContextTokens: number[] = [];
  let maxContextChars = 0;
  for (let i = 0; i < 50; i++) {
    const payload = JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: project,
      prompt: `Fix feature${(i * 199) % count}` });
    const start = performance.now();
    const result = spawnSync(process.execPath, [hookPath, 'claude'], { input: payload, encoding: 'utf8', timeout: 5000 });
    hookDurations.push(performance.now() - start);
    if (result.status !== 0 || !result.stdout) throw new Error(`Hook failed during scale evaluation: ${result.stderr || result.error || result.status}`);
    const context = JSON.parse(result.stdout).hookSpecificOutput?.additionalContext;
    if (typeof context !== 'string' || !context.includes(`Rule ${(i * 199) % count}`)) throw new Error('Hook returned the wrong lesson during scale evaluation');
    maxContextChars = Math.max(maxContextChars, context.length);
    // Anthropic's four-English-characters-per-token rule is a rough estimate,
    // not a tokenizer count or a safe upper bound for arbitrary lesson text.
    estimatedContextTokens.push(Math.ceil(context.length / 4));
  }
  hookDurations.sort((a, b) => a - b);
  estimatedContextTokens.sort((a, b) => a - b);
  console.log(JSON.stringify({ corpus: 'synthetic-scale', lessons: count, queries: durations.length,
    setupMs, lookupMs: { p50: durations[24], p95: durations[47] },
    hookProcessMs: { p50: hookDurations[24], p95: hookDurations[47] }, maxContextChars,
    estimatedContextTokens: { p50: estimatedContextTokens[24], p95: estimatedContextTokens[47], max: estimatedContextTokens.at(-1),
      method: 'ceil(rendered context UTF-16 code units / 4); rough English-text heuristic, not Claude tokenizer output' },
    runtime: process.version, platform: process.platform, arch: process.arch,
    limitations: 'Synthetic English corpus and local subprocess timing; no live host scheduling, model response, or model-specific token count.' }, null, 2));
} finally {
  db.close();
  rmSync(root, { recursive: true, force: true });
}
