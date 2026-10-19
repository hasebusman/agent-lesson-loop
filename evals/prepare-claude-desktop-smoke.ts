#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeClaudeIntegration } from '../src/integrations.ts';
import { newLesson } from '../src/model.ts';
import { projectIdentity } from '../src/project.ts';
import { changeStatus, insertLesson, openStore } from '../src/store.ts';

const checkout = resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = mkdtempSync(join(platform() === 'darwin' ? '/private/tmp' : tmpdir(), 'lessonlab-claude-desktop-'));
chmodSync(root, 0o700);
const data = join(root, 'data');
process.env.LESSONLAB_HOME = data;
const probeLog = join(root, 'hook-payload-shapes.jsonl');
const probePath = fileURLToPath(new URL('./claude-desktop-payload-probe.ts', import.meta.url));

function project(name: string) {
  const path = join(root, name);
  mkdirSync(join(path, '.claude'), { recursive: true });
  writeFileSync(join(path, 'README.md'), '# Lesson Lab desktop smoke fixture\n\nThis project contains only synthetic test data.\n');
  writeFileSync(join(path, '.gitignore'), '.claude/\n');
  execFileSync('git', ['init', '-q', path]);
  execFileSync('git', ['-C', path, 'add', 'README.md', '.gitignore']);
  execFileSync('git', ['-C', path, '-c', 'user.name=Lesson Lab Smoke',
    '-c', 'user.email=smoke@example.invalid', 'commit', '-qm', 'Synthetic smoke fixture']);
  return { path, settings: join(path, '.claude', 'settings.local.json') };
}

const skill = project('skill-project');
const hook = project('hook-project');
const skillDirectory = join(skill.path, '.claude', 'skills', 'learn-from-corrections');
mkdirSync(skillDirectory, { recursive: true });
copyFileSync(join(checkout, 'skills', 'learn-from-corrections', 'SKILL.md'), join(skillDirectory, 'SKILL.md'));
writeFileSync(skill.settings, JSON.stringify({ disableAllHooks: true,
  env: { LESSONLAB_HOME: data } }, null, 2) + '\n', { mode: 0o600 });
writeFileSync(hook.settings, JSON.stringify({
  env: { LESSONLAB_HOME: data },
  hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: process.execPath,
    args: [probePath, probeLog], timeout: 5 }] }] },
}, null, 2) + '\n', { mode: 0o600 });
changeClaudeIntegration('install', hook.settings, false);

const db = openStore().db;
const titles: Record<string, string> = {};
try {
  for (const [name, path] of [['skill', skill.path], ['hook', hook.path]]) {
    const title = `Synthetic smoke ${randomUUID().slice(0, 8)}`;
    const draft = newLesson({ projectId: projectIdentity(path).id, title,
      lesson: 'Preserve the existing sign-in screen while repairing auth behavior.',
      when: 'auth,login', requires: 'screen', except: 'redesign',
      verify: 'Inspect the sign-in screen and run the auth checks.' });
    insertLesson(db, draft);
    changeStatus(db, draft, 'approved');
    titles[name] = title;
  }
} finally { db.close(); }

console.log(JSON.stringify({ root, data, skillProject: skill.path, hookProject: hook.path,
  hookSettings: hook.settings, probeLog, expectedSkillTitle: titles.skill,
  expectedHookTitle: titles.hook, cli: join(checkout, 'bin', 'lessonlab.ts') }, null, 2));
