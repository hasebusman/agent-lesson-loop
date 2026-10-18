import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { newLesson } from '../src/model.ts';
import { projectIdentity } from '../src/project.ts';
import { selected, render } from '../src/retrieve.ts';
import { changeStatus, insertLesson, openStore } from '../src/store.ts';
import { mobile, oldFacts } from './fixtures.ts';

const root = mkdtempSync(join(tmpdir(), 'lessonlab-eval-'));
const a = join(root, 'react-native-a');
const b = join(root, 'other-project-b');
mkdirSync(a); mkdirSync(b);
execFileSync('git', ['init', '-q', a]);
execFileSync('git', ['init', '-q', b]);
process.env.LESSONLAB_HOME = join(root, 'data');
const db = openStore().db;

try {
  const aId = projectIdentity(a).id;
  const bId = projectIdentity(b).id;
  const ids = new Map<string, string>();
  for (const [term, title, action, exception] of mobile) {
    const draft = newLesson({ projectId: aId, title, lesson: action, when: term, except: exception, verify: `Check ${term} behavior` });
    insertLesson(db, draft);
    changeStatus(db, draft, 'approved');
    ids.set(term, draft.id);
  }
  for (const term of oldFacts) {
    const draft = newLesson({ projectId: aId, title: `Old ${term} workaround`, lesson: `Use the old ${term} workaround.`, when: term,
      verify: 'Check installed version', type: 'technical_fact', expires: '2020-01-01' });
    insertLesson(db, draft);
    changeStatus(db, draft, 'approved');
  }

  const cases = [
    ...mobile.map(([term]) => ({ kind: 'relevant_mobile', projectId: aId, task: `Fix ${term} behavior`, expected: [ids.get(term)!] })),
    ...oldFacts.map(term => ({ kind: 'expired_version', projectId: aId, task: `Fix ${term} behavior`, expected: [] as string[] })),
    ...mobile.slice(0, 5).map(([term, , , exception]) => ({ kind: 'explicit_exception', projectId: aId, task: `${exception} ${term} behavior`, expected: [] as string[] })),
    ...mobile.slice(5, 10).map(([term]) => ({ kind: 'other_project', projectId: bId, task: `Fix ${term} behavior`, expected: [] as string[] })),
  ];
  let truePositive = 0, falsePositive = 0, falseNegative = 0, correctSuppression = 0;
  const durations: number[] = [];
  let maxContextChars = 0;
  for (const item of cases) {
    const start = performance.now();
    const found = selected(db, item.projectId, item.task);
    durations.push(performance.now() - start);
    const actual = found.map(x => x.lesson.id);
    truePositive += actual.filter(id => item.expected.includes(id)).length;
    falsePositive += actual.filter(id => !item.expected.includes(id)).length;
    falseNegative += item.expected.filter(id => !actual.includes(id)).length;
    if (!item.expected.length && !actual.length) correctSuppression++;
    maxContextChars = Math.max(maxContextChars, render(found).length);
  }
  durations.sort((x, y) => x - y);
  const negative = cases.filter(x => !x.expected.length).length;
  const report = {
    corpus: 'synthetic-v1', cases: cases.length,
    groups: { relevant_mobile: 15, expired_version: 5, explicit_exception: 5, other_project: 5 },
    retrieval: { truePositive, falsePositive, falseNegative, correctSuppression, negativeCases: negative,
      precision: truePositive / (truePositive + falsePositive || 1), recall: truePositive / (truePositive + falseNegative || 1),
      suppressionRate: correctSuppression / negative },
    lookupMs: { p50: durations[Math.floor(durations.length * 0.5)], p95: durations[Math.ceil(durations.length * 0.95) - 1] },
    maxContextChars,
    runtime: process.version, platform: process.platform,
    limitations: 'Synthetic retrieval only; no model coding outcome or host runtime was measured.',
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.close();
  rmSync(root, { recursive: true, force: true });
}
