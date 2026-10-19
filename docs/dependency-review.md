# Dependency review

Checked 2026-10-19 against `package-lock.json` and the installed dependency tree, after commit `07ce16f` passed local checks and [three-OS CI](https://github.com/hasebusman/agent-lesson-loop/actions/runs/39200574089).

The CLI has **no runtime npm dependencies**. Development tooling is pinned by the lockfile: `typescript` 7.0.2 (Apache-2.0), `@types/node` 24.19.2 (MIT), and its `undici-types` 7.24.6 dependency (MIT). TypeScript's platform-specific optional packages are Apache-2.0 according to the lockfile. The project itself is Apache-2.0. These licenses are compatible with distributing this source repository; verify the dependency notices again if packaged binaries are published.

`npm audit --json` reported zero vulnerabilities across 23 lockfile packages (including optional platform packages). This is a point-in-time advisory result, not a guarantee that the dependencies or shipped code are vulnerability-free. Weekly Dependabot checks cover npm and GitHub Actions; CI uses SHA-pinned actions and a read-only workflow token. No build artifact is published yet, so artifact provenance and checksums remain a release task.

The review does not qualify the live Claude/Cursor adapters, certify prompt-injection resistance, or establish that the heuristic secret filter catches every private value. Those checks remain open in the [project checklist](../PROJECT_CHECKLIST.md) and [threat model](threat-model.md).
