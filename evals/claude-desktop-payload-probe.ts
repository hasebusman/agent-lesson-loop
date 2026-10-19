#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

// Smoke-test metadata only. Never persist the prompt, session ID, or directory.
try {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk.toString();
    if (raw.length > 64 * 1024) process.exit(0);
  }
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const summary = {
    event: payload.hook_event_name === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'other',
    keys: Object.keys(payload).sort(),
    promptType: typeof payload.prompt,
    cwdType: typeof payload.cwd,
    promptLength: typeof payload.prompt === 'string' ? payload.prompt.length : null,
  };
  appendFileSync(process.argv[2], JSON.stringify(summary) + '\n', { mode: 0o600 });
} catch {
  // The probe must never affect the user's prompt.
}
