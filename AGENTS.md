# Working on this extension

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
- Shared libraries are dev dependencies only for local typechecking and
  tests; the official build preset uses the host's declared shared libraries.
  Do not inline them or silently widen the manifest compatibility ranges.
- Add deterministic Vitest tests for substantive behavior changes. Distinguish
  unit/bundle verification from an actual Ham2K runtime test.
- Follow the user's Jujutsu workflow for commits and pushes. If RTK is
  available, prefix shell commands with `rtk`, or `rtk proxy` for full output.
