# Dependency audit

npm 10.9.9. The advisory database was reachable. Counts below are from `npm audit --json` on this branch, not from a suppressed audit.

## Counts

| Scope | Before this cleanup | After `npm ci` |
| --- | ---: | ---: |
| Full tree | 13 (2 low, 11 moderate), exit 1 | 0, exit 0 |
| `npm audit --omit=dev` | 6 (2 low, 4 moderate), exit 1 | 0, exit 0 |
| High or critical | 0 | 0 |

`npm audit fix` and `npm audit fix --force` were not used. Next.js stays `16.4.5` with `eslint-config-next@16.4.5`.

## What changed

`shadcn@4.23.0` was a direct dependency. Application TypeScript does not import it, no script calls the CLI, and `components.json` has an empty `registries` object. The one build use was `@import "shadcn/tailwind.css"` in `src/app/globals.css`. That file is now a local copy, `src/app/shadcn-tailwind.css`, with the package's MIT status recorded in `NOTICE`. Files under `src/components/` and `components.json` are unchanged.

That removal drops the only parents of `deepmerge@4.3.1`:

- `shadcn@4.23.0` → `deepmerge@4.3.1`
- `shadcn@4.23.0` → `@shadcn/registry@0.2.1` → `deepmerge@4.3.1`

It also drops `shadcn` → `ts-morph@26.0.0` → `@ts-morph/common` → `minimatch@10.2.6`.

GitHub advisory [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) still has no patched `deepmerge` release. `4.3.1` remains the latest 4.x and is inside `>=4.2.0 <=4.3.1`. Uninstalling the unused CLI is the cleanup, not a downgrade.

The other `minimatch@10.2.6` copy was dev-only:

`eslint-config-next@16.4.5` → `typescript-eslint@8.72.1` → `@typescript-eslint/typescript-estree@8.72.1` → `minimatch@^10.2.2`

[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) is `>=7.0.0 <11.0.1`, first patched version `11.0.1`. `minimatch@10.2.6` is still the newest 10.x. `typescript-eslint@8.72.1` is still the newest 8.x and still declares `minimatch@^10.2.2`. There is no newer `eslint-config-next` than `16.4.5`.

`package.json` overrides only that one edge to `minimatch@11.0.5`. ESLint's own `minimatch@3.1.5` is outside the advisory range and is not overridden. The estree call site is `minimatch(filePath, pattern, { dot: true })`. `11.0.5` still exports that function.

## Remaining risk

The override is outside `@typescript-eslint/typescript-estree`'s declared `^10` range. It is pinned to `11.0.5` and covered by `npm run lint` on this tree. A later typescript-eslint release that needs a removed minimatch option would need the override revisited.

The shadcn CLI is no longer installed. Regenerating a component would fetch that CLI separately; build, test, and the public server do not do that.

A new advisory published after this run is not included. The live container at http://140.82.0.23:8893/ is still archive `748b91ab1b327162bf26f23d5b872629a1115e9964b026f8a5766fb3dc95968c` and was not rebuilt.
