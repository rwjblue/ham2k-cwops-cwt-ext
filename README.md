# N1RWJ CWT for Ham2K

CWT exchange suggestions from N1MM CWops call history and previous CWT
contacts, packaged as a personal Ham2K extension (`n1rwj-cwt`).

**Based on the official CWT extension by Sebastian Delmont, KI2D, the main
Ham2K developer.** His setup, scheduling, scoring, exchange entry,
translations, ADIF and Cabrillo behavior are preserved. This independent
adaptation uses MPL-2.0. See [provenance](docs/PROVENANCE.md),
[license](LICENSE), and [notices](NOTICE.md).

## Install and use

1. Use a Ham2K build supporting SDK 0.5.0 and the shared-library versions in
   [manifest.json](manifest.json). The locally available Next build 109 is
   **too old**; see [verification and limits](docs/VERIFICATION.md).
2. Build with `mise run check`, then choose **Settings → Extensions → Install
   from file…** and select `dist/n1rwj-cwt-0.1.0.h2kext`.
3. **Disable the original CWops CWT extension.** Both handle `cwt` references;
   enabling both creates duplicate handlers.
4. Open **Settings → Data Files** and refresh **CWops CWT call history
   (N1RWJ)**. The default source discovers the current CWOPS entry in the
   N1MM category. Automatic refresh is daily when Ham2K is online.
5. Choose a CWT session, configure your sent name/number, and enter a call.
   Suggestions fill the separate native name and number controls. Check what
   was received and correct it as needed.

Log CWT contacts **one callsign at a time**. Ham2K's batch call-list logging
shares the same exchange controls across its calls.

**CWT Prefill** settings show source, file date, download time, record count,
and warnings. Select another N1MM CWOPS entry URL, direct text URL on either
N1MM host, or absolute local file path, then refresh its Data Files entry.
A local file is the fallback if the download site changes. Mobile file-path
access depends on the host; the default HTTPS source avoids that requirement.

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

The native Data Files cache restores the last successful dataset offline.
Failed downloads and malformed replacements leave it intact. This extension
uses local history and an in-memory file index while typing. No backend is
required.

## Develop

Install [mise](https://mise.jdx.dev/), then run:

```sh
mise run install    # pinned Node and locked npm dependencies
mise run format     # apply formatting and safe lint fixes
mise run check      # lint, typecheck, tests, build, official pack validation
```

Individual tasks: `lint`, `typecheck`, `test`, `build`, `pack`. The archive and
SHA-256 file are written to `dist/`. CI runs the same `check` task and uploads
them. `mise run verify-host` inspects the installed macOS Ham2K app without
changing it; failure means its dependencies/contracts are insufficient.

`src/cwt/` preserves upstream logic; `src/history/` contains pure parsing and
resolution; `src/data/` handles refresh/cache; `src/integration/` connects native
controls. Tests cover fixtures, host-contract models, and the built bundle.
**Native end-to-end use remains unverified** on a compatible app;
[VERIFICATION.md](docs/VERIFICATION.md) records the evidence and limits.
