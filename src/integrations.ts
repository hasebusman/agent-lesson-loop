import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Settings = { hooks?: Record<string, unknown>; [key: string]: unknown };
const hookPath = fileURLToPath(new URL('../bin/hook.ts', import.meta.url));
const owned = { type: 'command', command: process.execPath, args: [hookPath, 'claude'], timeout: 5 };

export function claudeConfigPath(path?: string): string {
  return resolve(path || join(homedir(), '.claude', 'settings.json'));
}

function readConfig(path: string): { raw: string | null; config: Settings } {
  if (!existsSync(path)) return { raw: null, config: {} };
  if (lstatSync(path).isSymbolicLink()) throw new Error('Claude settings cannot be a symlink');
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Claude settings must be a JSON object');
  return { raw, config: parsed as Settings };
}

function isOwned(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.type === 'command' && item.command === owned.command && JSON.stringify(item.args) === JSON.stringify(owned.args);
}

export function claudeIntegration(pathArg?: string) {
  const path = claudeConfigPath(pathArg);
  const { config } = readConfig(path);
  const groups = config.hooks?.UserPromptSubmit;
  if (groups !== undefined && !Array.isArray(groups)) throw new Error('Claude UserPromptSubmit hooks must be an array');
  const installed = (groups as unknown[] | undefined || []).some(group =>
    !!group && typeof group === 'object' && Array.isArray((group as { hooks?: unknown }).hooks) &&
    (group as { hooks: unknown[] }).hooks.some(isOwned));
  return { path, installed, hookPath, runtimeVerified: false };
}

export function changeClaudeIntegration(action: 'install' | 'uninstall', pathArg?: string, dryRun = true) {
  const path = claudeConfigPath(pathArg);
  const { raw, config } = readConfig(path);
  const hooks = config.hooks || {};
  if (typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error('Claude hooks must be an object');
  const groups = hooks.UserPromptSubmit || [];
  if (!Array.isArray(groups)) throw new Error('Claude UserPromptSubmit hooks must be an array');
  const exists = groups.some(group => !!group && typeof group === 'object' && Array.isArray(group.hooks) && group.hooks.some(isOwned));
  if (action === 'install' && !exists) groups.push({ hooks: [owned] });
  if (action === 'uninstall' && exists) {
    hooks.UserPromptSubmit = groups.map(group => {
      if (!group || typeof group !== 'object' || !Array.isArray(group.hooks)) return group;
      return { ...group, hooks: group.hooks.filter((item: unknown) => !isOwned(item)) };
    }).filter(group => !group || typeof group !== 'object' || !Array.isArray(group.hooks) || group.hooks.length > 0);
  } else hooks.UserPromptSubmit = groups;
  if (Array.isArray(hooks.UserPromptSubmit) && hooks.UserPromptSubmit.length === 0) delete hooks.UserPromptSubmit;
  if (Object.keys(hooks).length) config.hooks = hooks;
  else delete config.hooks;
  const changed = action === 'install' ? !exists : exists;
  const preview = { action, path, changed, ownedEntry: owned, backup: changed && raw !== null, dryRun };
  if (!changed || dryRun) return preview;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (raw !== null && readFileSync(path, 'utf8') !== raw) throw new Error('Claude settings changed during integration; retry');
  if (raw !== null) writeFileSync(`${path}.lessonlab-${randomUUID()}.bak`, raw, { flag: 'wx', mode: 0o600 });
  const temp = `${path}.lessonlab-${randomUUID()}.tmp`;
  const mode = raw !== null ? statSync(path).mode & 0o777 : 0o600;
  try {
    writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode });
    if (raw !== null && readFileSync(path, 'utf8') !== raw) throw new Error('Claude settings changed during integration; retry');
    renameSync(temp, path);
    chmodSync(path, mode);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return preview;
}
