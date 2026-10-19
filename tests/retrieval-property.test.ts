import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { newLesson } from '../src/model.ts';
import { projectIdentity } from '../src/project.ts';
import { explain, selected } from '../src/retrieve.ts';
import { changeStatus, insertLesson, openStore } from '../src/store.ts';

test('indexed search agrees with explain for accepted multilingual and phrase triggers', () => {
  const root = mkdtempSync(join(tmpdir(), 'lessonlab-retrieval-'));
  const priorHome = process.env.LESSONLAB_HOME;
  process.env.LESSONLAB_HOME = join(root, 'data');
  let db: ReturnType<typeof openStore>['db'] | undefined;
  try {
    const project = join(root, 'project');
    mkdirSync(project);
    execFileSync('git', ['init', '-q', project]);
    const projectId = projectIdentity(project).id;
    db = openStore().db;
    const triggers = Array.from({ length: 8 }, (_, index) => [
      `alpha_beta${index}`, `north-west${index}`, `café${index}`,
      `東京${index}`, `مرحبا${index}`,
    ]).flat();
    for (const trigger of triggers) {
      const draft = newLesson({ projectId, title: `Rule for ${trigger}`,
        lesson: `Inspect ${trigger} before changing it.`, when: trigger, verify: 'Inspect behavior' });
      insertLesson(db, draft);
      changeStatus(db, draft, 'approved');
    }
    for (const trigger of triggers) {
      const task = `Inspect ${trigger.replaceAll('_', ' ').replaceAll('-', ' ')}`;
      const explained = explain(db, projectId, task).filter(item => item.eligible).map(item => item.lesson.id).sort();
      const found = selected(db, projectId, task).map(item => item.lesson.id).sort();
      assert.deepEqual(found, explained, `indexed lookup lost an eligible trigger: ${trigger}`);
      assert.equal(found.length, 1, `unexpected overlap for ${trigger}`);
    }
  } finally {
    db?.close();
    if (priorHome === undefined) delete process.env.LESSONLAB_HOME;
    else process.env.LESSONLAB_HOME = priorHome;
    rmSync(root, { recursive: true, force: true });
  }
});
