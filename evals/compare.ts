import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newLesson } from '../src/model.ts';
import { projectIdentity } from '../src/project.ts';
import { selected } from '../src/retrieve.ts';
import { changeStatus, insertLesson, openStore } from '../src/store.ts';

// Synthetic paired comparison: same generalized correction and task, with
// and without an all-required subtask term. It measures retrieval only.
const root = mkdtempSync(join(tmpdir(), 'lessonlab-compare-'));
const genericProject = join(root, 'generic');
const conditionedProject = join(root, 'conditioned');
mkdirSync(genericProject); mkdirSync(conditionedProject);
execFileSync('git', ['init', '-q', genericProject]);
execFileSync('git', ['init', '-q', conditionedProject]);
process.env.LESSONLAB_HOME = join(root, 'data');
const db = openStore().db;

try {
  const topics = ['auth', 'profile', 'billing', 'upload', 'session'];
  const genericId = projectIdentity(genericProject).id;
  const conditionedId = projectIdentity(conditionedProject).id;
  for (const topic of topics) {
    for (const [projectId, requires] of [[genericId, undefined], [conditionedId, 'screen']] as const) {
      const draft = newLesson({ projectId, title: `Preserve ${topic} screen`,
        lesson: `Keep the ${topic} screen while changing behavior.`, when: topic,
        requires, verify: `Inspect ${topic} screen` });
      insertLesson(db, draft);
      changeStatus(db, draft, 'approved');
    }
  }
  const result = (projectId: string) => {
    let truePositive = 0, falsePositive = 0, falseNegative = 0, correctSuppression = 0;
    for (const topic of topics) {
      for (const [task, expected] of [[`Fix ${topic} screen`, true], [`Fix ${topic} API`, false]] as const) {
        const found = selected(db, projectId, task);
        if (expected && found.length) truePositive++;
        if (expected && !found.length) falseNegative++;
        if (!expected && found.length) falsePositive++;
        if (!expected && !found.length) correctSuppression++;
      }
    }
    return { truePositive, falsePositive, falseNegative, correctSuppression,
      precision: truePositive / (truePositive + falsePositive || 1),
      recall: truePositive / (truePositive + falseNegative || 1) };
  };
  console.log(JSON.stringify({ corpus: 'synthetic-subtask-v1', casesPerVariant: 10,
    generic: result(genericId), requiredContext: result(conditionedId),
    runtime: process.version, platform: process.platform,
    limitations: 'Constructed same-word/different-subtask examples; retrieval only, no coding outcome or natural-language generalization measured.' }, null, 2));
} finally {
  db.close();
  rmSync(root, { recursive: true, force: true });
}
