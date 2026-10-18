#!/usr/bin/env node
import { projectIdentity } from '../src/project.ts';
import { openReadStore } from '../src/store.ts';
import { render, selected } from '../src/retrieve.ts';

async function input(limit = 64 * 1024): Promise<string | null> {
  let value = '';
  for await (const chunk of process.stdin) {
    value += chunk.toString();
    if (value.length > limit) return null;
  }
  return value;
}

async function main() {
  if (process.argv[2] !== 'claude') return;
  const raw = await input();
  if (!raw) return;
  const event = JSON.parse(raw) as Record<string, unknown>;
  if (event.hook_event_name !== 'UserPromptSubmit' || typeof event.prompt !== 'string' || typeof event.cwd !== 'string') return;
  if (!event.prompt.trim() || event.prompt.length > 1000) return;
  const db = openReadStore();
  try {
    const project = projectIdentity(event.cwd);
    const context = render(selected(db, project.id, event.prompt));
    if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } }));
  } finally { db.close(); }
}

// A read-only advisory hook must never interrupt the developer's prompt.
main().catch(() => {});
