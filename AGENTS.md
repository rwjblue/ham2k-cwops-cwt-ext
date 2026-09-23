# Working on this extension monorepo

commit-message-default: auto

- This repository is the permanent home for N1RWJ extensions. Only the
  personal CWT extension is temporary until
  [Ham2K/extensions PR #1](https://github.com/ham2k/extensions/pull/1) lands.
  That PR is the source of truth for CWT behavior. For CWT-relevant behavior,
  fixes, tests, translations, and documentation here (including shared-code
  changes that affect CWT), also update the PR source branch, currently
  `codex/cwt-call-history`, in `~/src/github/ham2k/extensions`. Verify the
  checkout and current PR source branch before editing; never update its
  target `main` instead. Read upstream instructions and run relevant checks.
  Upstream CWT lives in `extensions/contests/ham2k-cwt/`; backport relevant
  changes here while the personal extension is in use. MST, SST, general
  monorepo tooling, and personal packaging/identity are exempt; explain the
  exemption when reporting those changes.
- Each independently installable extension lives in `extensions/<group>/<key>/`
  with its manifest, package, source, and tests. Shared sandbox code lives in
  `packages/<name>/src/`. Keep contest exchange semantics outside the generic
  N1MM parser and downloader. MST serials are per contact, never history hints;
  SST locations are state/province or DX, never CWops member numbers.
- Node runs TypeScript automation using built-in type stripping. Use explicit
  `.ts` imports, type-only imports, and erasable syntax. Extension runtime code
  still requires the official ES2020 bundle because Ham2K runs a JS sandbox.
- Read `node_modules/@ham2k/extension-sdk/AGENTS.md` and the relevant SDK
  `docs/` sections before changing a hook. Run `mise run install` first when
  dependencies are absent. Published `dist/index.d.ts` is the typed contract;
  verify behavior against host source where possible.
- Use TypeScript, plain functions, and small modules. Keep parsing and exchange
  precedence pure; keep host, storage, and network adapters thin. Do not copy
  SDK internals or invent host methods. The sandbox is ES2020 without Node,
  DOM, or global fetch.
- Preserve explicit operator corrections and clearing. Missing CWops data
  never proves nonmembership; a location guess must never become a member
  number. Do not fetch data or read a full log per keystroke.
- Keep the personal extension key `n1rwj-cwt` distinct from the original.
  Keep CWT reference and exchange/export conventions compatible. Preserve
  Sebastian Delmont's upstream copyright, attribution, and MPL-2.0 license.
  The separately published SDK and build tools use MIT; retain their notices.
- All automation lives in executable file-based `mise/tasks/` scripts. Use
  `mise run format` to apply formatting and `mise run check` for the same
  lint, typecheck, test, build, and official packaging checks used in CI.
  Follow the task skill: complex tasks use TypeScript with local task dependency
  installation and their own strict typecheck. Root npm scripts are unnecessary.
- Shared libraries are dev dependencies only for local typechecking and
  tests; the official build preset uses the host's declared shared libraries.
  Do not inline them or silently widen the manifest compatibility ranges.
- Add deterministic Vitest tests for substantive behavior changes. Distinguish
  unit/bundle verification from an actual Ham2K runtime test.
- Keep one synchronized release version and one authored release notes file.
  Use `mise run release:notes <tag> --create` to scaffold, then review the diff
  and run `mise run release:notes <tag>` to validate and preview. Follow
  `docs/PUBLISHING.md`: root dependency updates are universal shared changes;
  shared workspace changes belong to every affected consumer. Every extension
  needs its own section, explicitly stating no extension-specific changes when
  applicable. Use that same file for the GitHub release body; the catalog
  extracts each extension's section plus shared changes.
- Follow the user's Jujutsu workflow for commits and pushes. If RTK is
  available, prefix shell commands with `rtk`, or `rtk proxy` for full output.
