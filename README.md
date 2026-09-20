# N1RWJ CWT for Ham2K

CWT exchange suggestions from N1MM CWops call history and previous CWT
contacts, packaged as a personal Ham2K extension (`n1rwj-cwt`).

**This repository is a temporary personal extension until
[Ham2K/extensions PR #1](https://github.com/ham2k/extensions/pull/1) lands.**
It keeps an installable version available while the upstream change is
reviewed, and is not intended to be a long-term fork. That PR is the source
of truth for feature changes; relevant changes made here must also be
applied to its source branch. Version 0.1.2 backports its history-loading
race fix, CWT-only suggestion handling, and English/Spanish prefill and
settings text.

**Based on the official CWT extension by Sebastian Delmont, KI2D, the main
Ham2K developer.** His setup, scheduling, scoring, exchange entry,
translations, ADIF and Cabrillo behavior are preserved. This independent
adaptation uses MPL-2.0. See [provenance](docs/PROVENANCE.md),
[license](LICENSE), and [notices](NOTICE.md).

## Install and use

1. Use a Ham2K build supporting SDK 0.5.0 and the shared-library versions in
   [manifest.json](manifest.json). Native installation, member/nonmember/CWA
   prefills, and saved exchanges were verified in **Power Logger 26.9.0,
   build 169**; see [verification and limits](docs/VERIFICATION.md).
2. Download the `.h2kext` asset from a
   [GitHub release](https://github.com/rwjblue/ham2k-cwops-cwt-ext/releases), or
   build it locally with `mise run check`. Choose **Settings → Features &
   Extensions → Install from file** and select the bundle.
3. **Disable the original CWops CWT extension.** Both handle `cwt` references;
   enabling both creates duplicate handlers.
4. Open **Settings → Accounts, Services & Data Sources → CWops CWT call
   history (N1RWJ) → Refresh**. The default source discovers the current
   CWOPS entry in the N1MM category. Automatic refresh is daily when Ham2K
   is online.
5. Choose a CWT session, configure your sent name/number, and enter a call.
   Suggestions fill the separate native name and number controls. Check what
   was received and correct it as needed.

Log CWT contacts **one callsign at a time**. Ham2K's batch call-list logging
shares the same exchange controls across its calls.

**CWT Prefill** settings show source, file date, download time, record count,
and warnings. Leave the source blank for automatic discovery, or select an
HTTPS N1MM category, CWOPS entry, or direct text URL on `n1mm.hamdocs.com`
or `n1mmwp.hamdocs.com`, then refresh its data-source entry. Local file paths
are unsupported: this host's data-file loader fetches HTTP resources, and
SDK 0.5.0 provides no local import capability for this extension.

## Exchange behavior

Each field uses operator input first (including intentional clearing), then
current-operation CWT history, the selected file, and older compatible CWT
history. Names retain the original host name suggestion as a final fallback.
Generic location guesses are hints only. Missing records or member numbers
never prove nonmembership.

Exact calls precede an unambiguous base call. Names/member numbers/CWA can
follow a portable suffix; nonmember locations require an exact call. Only
explicit CWT references qualify as log history. The received exchange is
stored on the CWT ref and projected to the log, ADIF, and Cabrillo.

Ham2K protects touched controls during lookups and callsign corrections. Use
**Wipe** for a fresh contact to reset those edits. Unknown calls clear previous
untouched suggestions. See [supported syntax and precedence](docs/CALL-HISTORY.md).

The native Data Files cache retains the last successful dataset across failed
refreshes and app restarts. Malformed replacements also leave it intact. This
extension uses local history and an in-memory file index while typing. No
backend is required. Testing with the operating system offline remains pending.

## Develop

Install [mise](https://mise.jdx.dev/), then run:

```sh
mise run install    # pinned Node and locked npm dependencies
mise run format     # apply formatting and safe lint fixes
mise run check      # lint, typecheck, tests, build, official pack validation
```

Individual tasks: `lint`, `typecheck`, `test`, `build`, `pack`. The archive and
SHA-256 file are written to `dist/`. CI runs the same `check` task and uploads
them. `mise run verify-host` inspects the running macOS Ham2K app, or the
latest installed build, without changing it. Pass an explicit `.app` path
to inspect another installation. Failure means its dependencies/contracts
are insufficient.

### Keeping the personal extension aligned

Keep relevant changes synchronized in both directions until PR #1 lands.
For every change made here, apply any upstream-relevant behavior, bug fix,
test, translation, or documentation change to the PR's source branch,
`codex/cwt-call-history`, in `~/src/github/ham2k/extensions`. The upstream CWT
extension lives in `extensions/contests/ham2k-cwt/`. Verify the checkout and
current PR branch before editing, and run the upstream repository's checks
for any changes there. Personal-only identity, packaging, release tooling,
and temporary-repository documentation do not need to be copied upstream;
note that exception when reporting the change.

Backport relevant fixes from `extensions/contests/ham2k-cwt/` in the upstream
PR, adapting imports and tests to this repo's layout and Vitest setup. Keep
the personal `n1rwj-cwt` identity, `n1rwj-cwt_history` data-file key, settings,
export identifiers, licensing notices, and build/release tooling intact so
existing installations retain their data and configuration. Run
`mise run format` and `mise run check` after each backport and bump the personal
version when preparing an updated bundle. Upstream-only packaging changes do
not need a matching personal change.

## Release

Update the version in `manifest.json`, `package.json`, and `package-lock.json`,
then commit and push. Publish a GitHub release with the matching tag, such as
`v0.1.2`, pointing at that commit. The **Release** workflow checks out the tagged
commit, runs `mise run check`, verifies the versions and checksum, and attaches
`n1rwj-cwt-<version>.h2kext` and its `.sha256` file. Published prereleases also
trigger the build. Draft releases do not.

Preview the same process locally without uploading:

```sh
mise run release --dry-run v0.1.2
```

The workflow uses GitHub's built-in token; no extra secret is required.
Existing assets are never overwritten. If an upload fails, inspect the release
assets before retrying; remove an incomplete pair before rerunning the job.
Keep release immutability disabled for this workflow, since it attaches assets
after publication.

## Verification

`src/cwt/` preserves upstream logic; `src/history/` contains pure parsing and
resolution; `src/data/` handles refresh/cache; `src/integration/` connects native
controls. Tests cover fixtures, host-contract models, and the built bundle.
Native installation, data download, member/nonmember/CWA logging, an
unknown-number case, and operator edits/clearing across callsign corrections
have been verified, along with native ADIF/Cabrillo exports and cached
suggestions after a failed refresh and app restart. A native check of version
0.1.1 also confirmed current-operation history overriding a conflicting file
name and a successful refresh after restoring the default source.
OS-offline use and a controlled delayed-lookup race remain unverified;
[VERIFICATION.md](docs/VERIFICATION.md) records the evidence and limits.
