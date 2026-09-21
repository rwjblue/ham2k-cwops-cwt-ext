# Publishing N1RWJ extensions

GitHub releases remain the archive of installable `.h2kext` files and their
SHA-256 checksums. After those assets upload successfully, the **Release**
workflow submits the exact same bundles to the
[Ham2K extension catalog](https://catalog.ham2k.net/docs). The catalog reviews
each submission before operators can install it from the catalog.

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

All extensions and shared workspaces retain one synchronized version:

```sh
mise run release:prepare 0.3.0
mise run format
mise run release v0.3.0 --dry-run
```

Commit the prepared files and push them, then publish a GitHub release tagged
`v0.3.0` at that tested commit. The workflow checks out the release commit,
runs `check`, and attaches the exact current bundle/checksum pairs. Drafts
do not trigger it. Keep GitHub release immutability disabled because these
assets are attached after publication.

The separate `catalog` job then downloads the GitHub release assets to a
temporary directory. It checks synchronized versions and every checksum
before submitting any bundle, and limits publication to `n1rwj-*` keys.
Archives larger than 16 MiB are refused. It uses the pinned official
`h2kext-publish` from `@ham2k/extension-tools`, passing existing archives so
they are never rebuilt or repackaged for the catalog. GitHub's release body
becomes the catalog release notes.

Normal releases use `stable`; GitHub prereleases and SemVer prerelease
versions use `unstable`. To preview an **existing** published GitHub release
from a checkout with the same version and extensions:

```sh
mise run release:catalog v0.3.0 --dry-run
```

This downloads and validates assets but needs no catalog token and submits
nothing. Unlike `release --dry-run`, it reads GitHub's published assets rather
than building the working tree. To submit locally, omit `--dry-run`:

```sh
mise run release:catalog v0.3.0
mise run release:catalog v0.3.0 n1rwj-mst
mise run release:catalog v0.3.0 --channel bleeding
```

The optional extension key limits submission to one extension. All release
assets are still validated first. The channel override accepts `stable`,
`unstable`, or `bleeding`; prereleases cannot target `stable`.

### Catalog documentation discrepancy

As checked on September 21, 2026, the catalog's publishing page and parts of
its UI still call channels `prod`, `next`, and `dev`. The installed official
tools use `stable`, `unstable`, and `bleeding`, and the current
[Ham2K channel migration](https://github.com/Ham2K/halo/commit/2bc24917da9559640437c96c6bcc5d7d915cb8c0)
explicitly changes the app to request `stable`. This automation follows that
official publisher contract. Public API probes hit a Cloudflare challenge,
so authenticated submission and the deployed server's channel acceptance
still need verification during the first real publication.

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

If the catalog job failed before any submissions (for example, because the
secret was missing), configure the secret and use GitHub Actions' **Re-run
failed jobs**. This preserves the successful GitHub upload job. Do not rerun
all jobs blindly: the GitHub uploader deliberately refuses to overwrite
existing release assets. If an archive was rejected, inspect the reason and
the version's review history before deciding whether it can be resubmitted
or needs a new version.

These are repository release tooling and personal packaging changes, exempt
from the temporary CWT behavior synchronization with the upstream extension.
