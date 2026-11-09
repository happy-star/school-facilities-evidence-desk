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

Checked again for a supported resolution that stays on `next@16.4.5` and does not widen the override: `typescript-eslint@8.72.1`, `@typescript-eslint/typescript-estree@8.72.1`, and `eslint-config-next@16.4.5` are still the newest releases. estree still declares `minimatch@^10.2.2`. No 8.x release declares minimatch 11. `minimatch@10.2.6` is still the newest 10.x, and `11.0.1` is still the first patched version. The narrow override stays because that is the available cleanup.

## minimatch 11.0.5 at the one call site

`@typescript-eslint/typescript-estree@8.72.1` loads minimatch only in `dist/useProgramFromProjectService.js`. `filePathMatchedBy` calls `minimatch(relativePath, pattern, { dot: true })`. The relative path is `path.relative(tsconfigRootDir, absoluteFilePath)`. The package does not call `makeRe`, which 11.0.0 removed, and it does not pass `partial`, `windowsPathsNoEscape`, or `optimizationLevel`.

`allowDefaultProject` globs are rejected first when they are `*` or contain `**`, so the `**` fixes in 11.0.0 are outside this call. A direct comparison of 10.2.6 and 11.0.5 with `{ dot: true }` across 506 path/pattern pairs differed in two cases: `a/b/` against `a/b/?(x)` and `a/b/*(x)`. 10.2.6 matched; 11.0.5 did not. That is the empty path-portion change in the 11.0 changelog. `path.relative` does not produce a trailing slash for a file, so those two pairs are not the paths this caller feeds minimatch.

`tests/dependency-compat.test.ts` parses real files with `parseAndGenerateServices` and `projectService.allowDefaultProject`. It checks an exact name, a second pattern, `*` at the root, a dotfile under `*` (the `{ dot: true }` option), one directory segment, a miss, a `#` pattern, an empty list, and the wide-glob rejections. It also checks that the installed estree copy is `11.0.5` and that ESLint's copy is still `3.1.5`.

That file does not prove Windows drive or UNC comparison, `makeRe` compatibility, or every glob option. `npm run lint` also does not prove it: `eslint-config-next`'s TypeScript block sets `sourceType` only and does not enable `projectService`.

## Stylesheet

`src/app/shadcn-tailwind.css` from `@theme inline` through the end is the bytes of `shadcn@4.23.0` `dist/tailwind.css`, SHA-256 `4c371f7a1ff5d219ae2f7ff28bd256b4346fd546fe46fbae22092e57db2f0fae`. The published `LICENSE.md` is MIT, Copyright (c) 2023 shadcn. That text is in the copy's header and named in `NOTICE`. The tarball had no separate copyright inside the CSS itself.

## Remaining risk

The override is outside the declared `^10` range. The evidence above is why it is retained, not a claim of zero risk. A later estree that calls a removed minimatch method, or a glob that depends on the trailing-slash extglob change, would need the pin revisited.

The shadcn CLI is not installed. Regenerating a component would fetch it separately. A new advisory after this run is not in the counts. The live container at http://140.82.0.23:8893/ is still archive `748b91ab1b327162bf26f23d5b872629a1115e9964b026f8a5766fb3dc95968c` and was not rebuilt.
