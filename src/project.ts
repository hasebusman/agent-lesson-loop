import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function projectIdentity(directory: string) {
  const cwd = realpathSync(resolve(directory));
  let common: string;
  let root: string;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('Project must be inside a Git repository. Pass --project with its path.');
  }
  const gitDirectory = realpathSync(resolve(cwd, common));
  const { dev, ino } = statSync(gitDirectory, { bigint: true });
  // Some filesystems report no stable inode. Prefer isolation by canonical path
  // there, even though a repository move will then change its identity.
  const id = createHash('sha256').update(ino === 0n ? `path:${gitDirectory}` : `inode:${dev}:${ino}`).digest('hex');
  return { id, root: realpathSync(root) };
}
