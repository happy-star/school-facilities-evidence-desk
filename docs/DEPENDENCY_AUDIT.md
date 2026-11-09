# Dependency audit

Audit command: `npm audit --json` on the lockfile at public commit `d4d983051a55bd1219b0dcf2acc55cbc5e89b16a`, then again after this change. npm was 10.9.9. The audit registry was reachable. This is not a claim that the tree has zero vulnerabilities.

## Counts

| Scope | Before | After |
| --- | ---: | ---: |
| Full tree | 13 (2 low, 11 moderate) | 13 (2 low, 11 moderate) |
| `npm audit --omit=dev` | 6 (2 low, 4 moderate) | 6 (2 low, 4 moderate) |
| High or critical | 0 | 0 |

No dependency range and no lockfile entry changed. `npm audit fix` without `--force` does not offer a version that clears these advisories. Its dry run also wanted to add unrelated optional platform packages. That was not applied. `npm audit fix --force` was not run.

## Advisories

Two distinct advisories account for all 13 package entries.

### deepmerge prototype pollution — low

- URL: https://github.com/advisories/GHSA-gcqx-w48m-w2h4
- Installed: `deepmerge@4.3.1`
- Vulnerable range reported by npm: `>=4.2.0 <=4.3.1`
- Registry latest in the 4.x line: `4.3.1`. No patched 4.x release was published.
- Package paths:
  - `shadcn@4.23.0` → `deepmerge@4.3.1`
  - `shadcn@4.23.0` → `@shadcn/registry@0.2.1` → `deepmerge@4.3.1`
- `shadcn` is a direct `dependencies` entry, so `--omit=dev` still counts this chain (2 low entries: `deepmerge`, `@shadcn/registry`; `shadcn` itself is counted moderate because it also depends on `ts-morph`).
- Application source under `src/` and `scripts/` does not import `shadcn`, `@shadcn/registry`, or `deepmerge`. The public server does not invoke the shadcn CLI. The pollution routine is reachable only if that CLI merges untrusted objects.

### minimatch glob amplification — moderate

- URL: https://github.com/advisories/GHSA-g3hv-75wg-m249
- Vulnerable range reported by npm: `>=7.0.0 <11.0.1`
- Installed copies in range: `minimatch@10.2.6`
- Not in range: the top-level `minimatch@3.1.5` used by ESLint 9.
- Package paths:
  - dev: `eslint-config-next@16.4.5` → `typescript-eslint@8.72.1` → `@typescript-eslint/typescript-estree@8.72.1` → `minimatch@10.2.6`
  - package tree, not request path: `shadcn@4.23.0` → `ts-morph@26.0.0` → `@ts-morph/common@0.27.0` → `minimatch@10.2.6`
- The 11 moderate entries are this one advisory counted once for each package npm walks through those two chains.
- `typescript-eslint@8.72.1` is the newest 8.x release and still depends on `minimatch@^10.2.2`. `@ts-morph/common@0.29.0` (pulled by `ts-morph@28`) still depends on `minimatch@^10.0.1`. No in-range update removes the advisory.
- ESLint sees local project files. The desk does not pass a visitor's question to minimatch.

## Decisions not taken

- Do not install `shadcn@1.0.0`. npm marks that as the `--force` fix and as a semver-major change. The direct dependency is `shadcn@^4.23.0`. `1.0.0` is an older major line, not a patch.
- Do not install `eslint-config-next@15.5.29`. That is the other `--force` fix. This app uses `next@16.4.5` and `eslint-config-next@16.4.5`. Downgrading the lint config across a major would split it from the framework.
- Do not override `minimatch` to `11.0.5`. The fixed release is a new major above the `^10` ranges declared by `@typescript-eslint/typescript-estree` and `@ts-morph/common`. That override is a breaking migration and was left for a later decision.
- Do not move `shadcn` between dependency groups in this change. It would not remove the advisory while the package remains installed, and it would not change the public server's import graph.

Remaining risk is the two unfixed advisories above. Both sit outside the page, ask, synthetic, import, and clear routes. After `npm run build`, `.next/standalone` contained no `deepmerge`, `minimatch`, `shadcn`, or `ts-morph` files. The running public container on port 8893 was not rebuilt from this change.
