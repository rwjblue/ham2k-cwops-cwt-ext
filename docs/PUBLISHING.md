# Publishing N1RWJ extensions

GitHub releases remain the archive of installable `.h2kext` files and their
SHA-256 checksums. After those assets upload successfully, the **Release**
workflow attempts to submit the exact same bundles to the
[Ham2K extension catalog](https://catalog.ham2k.net/docs). The catalog reviews
each submission before operators can install it from the catalog.

## Current release status

[v0.4.0](https://github.com/rwjblue/ham2k-n1rwj-extensions/releases/tag/v0.4.0)
was published from signed commit `bf6fa7a4b0afb415628c98ae88c259aa943e8d66`
on September 23, 2026 at 17:58 UTC. All four extension bundles and their
four checksum files are available on GitHub. The
[GitHub upload job succeeded](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35899278672/job/107310987750),
and downloaded assets passed `mise run release:catalog v0.4.0 --dry-run`.

The [catalog job succeeded](https://github.com/rwjblue/ham2k-n1rwj-extensions/actions/runs/35899278672/job/107311193350):
all four uploads to `stable` were accepted as **pending review** at 17:59 UTC
on September 23, with extension-specific release notes. This confirms submission,
not catalog approval or installation availability. See the
[release notes](releases/v0.4.0.md) and
[published artifact verification](VERIFICATION.md#release-040-publication--2026-09-23).

Earlier v0.2.1, v0.3.0, and v0.3.1 runs failed with HTTP 403 from a Cloudflare
challenge. The v0.3.2 retry and v0.3.3/v0.3.4 publications succeeded; inspect each earlier
version's submission history before retrying it.

## Configure the token

The catalog account needs the approved `n1rwj-*` namespace grant and a token
from the [publisher dashboard](https://catalog.ham2k.net/publish).

Copy `.env.local.example` to `.env.local` if the local file does not already
exist. Uncomment its `H2K_CATALOG_TOKEN=` line and paste the token after `=`.
Mise loads this file automatically for tasks and activated shells. The file
is ignored by version control, and mise marks the token for output redaction.
Ordinary checks and GitHub uploads do not require this token.

Once the local token is filled in, install it as this repository's GitHub
Actions secret:

```sh
mise run release:catalog-secret
```

This uses the authenticated `gh` CLI and passes the token on standard input.
Alternatively, create a repository Actions secret named `H2K_CATALOG_TOKEN`
in GitHub's settings. CI exposes it only to the catalog submission step.
The local file and GitHub secret are independent: rerun the task after
rotating the local token. A missing secret fails the catalog job explicitly;
the already uploaded GitHub release assets remain available.

## Prepare and publish a release

All extensions and shared workspaces retain one synchronized version, including
extensions with no behavior changes. Choose an unused version; for example:

```sh
mise run release:prepare 0.3.5
mise run release:notes v0.3.5 --create
# Edit docs/releases/v0.3.5.md after reviewing changes since the previous release.
mise run release:notes v0.3.5
mise run format
mise run release v0.3.5 --dry-run
```

Commit the prepared files using the repository's signed Jujutsu workflow and
push them, then publish a GitHub release tagged `v0.3.5` at that tested commit.
Use `docs/releases/v0.3.5.md` as its body (`gh release create` accepts
`--notes-file docs/releases/v0.3.5.md`), so GitHub and the catalog share one
authored document.
The workflow checks out the release commit, runs `check`, and attaches the
exact current bundle/checksum pairs. Drafts do not trigger it. Keep GitHub
release immutability disabled because these assets are attached after
publication.

The separate `catalog` job then downloads the GitHub release assets to a
temporary directory. It checks synchronized versions and every checksum
before submitting any bundle, and limits publication to `n1rwj-*` keys.
Archives larger than 16 MiB are refused. It uses the pinned official
`h2kext-publish` from `@ham2k/extension-tools`, passing existing archives so
they are never rebuilt or repackaged for the catalog. Each catalog entry gets
only its extension's section and the shared changes from GitHub's release body.

### One release document, separate catalog audiences

`release:notes <tag> --create` creates `docs/releases/<tag>.md` from the
discovered extensions and refuses to overwrite an existing file. It scaffolds
headings and author prompts; it does not infer user-facing changes from commit
subjects or assume untouched extension directories mean unchanged behavior.
Review the release diff and replace every `[TODO: ...]` prompt. Run
`release:notes <tag>` to validate the whole document and preview every catalog
entry, or add an extension key to preview just that entry. `--file <path>`
supports a different source file. These previews need no release, network,
catalog token, or version bump.

Use these level-two headings (extension keys are stable, exact identifiers):

```markdown
# v0.3.5 — Better maps and dependency updates

A short overview for readers of the GitHub release.

## Shared changes

- Updated the root SDK dependency used by all extension builds.

## n1rwj-cwt

No extension-specific changes for CWT.

## n1rwj-mst

No extension-specific changes for ICWC MST.

## n1rwj-rbn

- Improved receiver map coverage.

## n1rwj-sst

No extension-specific changes for K1USN SST.

## Repository notes

Build verification and installation details for the GitHub release.
```

This is a format example, not a claim about the next release's contents.

- The title and introductory summary appear only on GitHub. Put any actual
  universal changes in **Shared changes**, even if the summary mentions them.
- Treat root dependency updates (including root development/build dependencies
  and transitive dependency updates in the root lockfile) as universal and put
  them in **Shared changes**. A synchronized version bump alone is not a
  dependency update. Omit the shared section when there are no universal changes.
- Describe extension changes under that extension's key. For shared workspace
  code, include the note under every affected consumer, following transitive
  usage; a contest-only shared library change need not appear for RBN. Use
  **Shared changes** only if every extension is affected.
- Every extension requires a nonempty section. Explicitly write
  `No extension-specific changes for <name>.` after reviewing its own changes
  and shared consumers. With no shared changes this is the entire catalog note;
  with shared changes it is followed by those updates. All versions still advance.
- **Repository notes** is optional and stays on GitHub, for tooling,
  validation, installation details, and other repository context. Use `###`
  for subsections within any audience and inline Markdown links so each
  extracted section is self-contained. HTML author comments are omitted.

Catalog publication validates every extension's section before downloading
or submitting anything, even when selecting a single extension. Missing,
empty, unknown, or duplicate sections and unfinished scaffold prompts fail
explicitly. The publisher never falls back to broadcasting the whole document.
Older unstructured release bodies must be reorganized into this format before
retrying with this tooling; preview first, and retain their existing release
facts and archives. Historical release files are not automatically rewritten.

Normal releases use `stable`; GitHub prereleases and SemVer prerelease
versions use `unstable`. To preview an **existing** published GitHub release
from a checkout with the same version and extensions:

```sh
mise run release:catalog v0.3.5 --dry-run
```

This downloads and validates assets and prints the exact notes for each
catalog entry, but needs no catalog token and submits nothing. Unlike
`release --dry-run`, it reads GitHub's published assets rather
than building the working tree. After resolving any catalog outage and
checking for earlier accepted submissions, omit `--dry-run` to submit locally.
The following are alternative commands; choose the one matching the intended
scope and channel:

```sh
mise run release:catalog v0.3.5
mise run release:catalog v0.3.5 n1rwj-mst
mise run release:catalog v0.3.5 --channel bleeding
```

The optional extension key limits submission to one extension. All release
assets are still validated first. The channel override accepts `stable`,
`unstable`, or `bleeding`; prereleases cannot target `stable`.

### Catalog documentation discrepancy

As checked on September 21, 2026, the catalog's publishing page and parts of
its UI still call channels `prod`, `next`, and `dev`. The pinned official
tools use `stable`, `unstable`, and `bleeding`; inspected host source also
requests `stable`. This automation follows the official publisher contract.
The authenticated v0.2.1, v0.3.0, and v0.3.1 upload attempts were blocked by
Cloudflare before catalog validation. The successful v0.3.2 retry established
that the deployed catalog accepts `stable`; the other channels remain unverified.

## Review and recovery

An accepted upload is a submission, usually **pending review**, rather than
proof that the extension is installable. Check the publisher dashboard for
review results. Once a version is approved, its bytes are frozen: code or
packaging changes require a new version. Reuse the existing GitHub archive
when submitting that version to another channel.

The official publisher makes no automatic retries. Release notes use a
second request, so a notes failure can leave the bundle already submitted.
If publishing stops midway, earlier submissions remain. Inspect the
dashboard before retrying; fix notes there if that was the only failure,
and use the optional extension key to submit only the remaining extensions.

If the catalog job failed before any submissions, resolve the specific cause
(for example, a missing secret or an API challenge) and use GitHub
Actions' **Re-run failed jobs**. This preserves the successful GitHub upload
job. Do not rerun all jobs blindly: the GitHub uploader deliberately refuses
to overwrite existing release assets. If an archive was rejected, inspect
the reason and the version's review history before deciding whether it can
be resubmitted or needs a new version.

These are repository release tooling and personal packaging changes, exempt
from the temporary CWT behavior synchronization with the upstream extension.
