# Reading List

A minimal, self-hosted reading list manager. Save articles, videos, PDFs, and podcasts with tags for easy filtering.

## Features

- Save links with title, type (article/video/pdf/podcast), and tags
- Filter by tags and type
- Mark items as read/unread
- Built-in reader with highlights and notes
- Notes & highlights view
- Import from Readwise CSV
- Clean, minimal interface
- Single binary deployment with Bun

## iOS app

The native iOS client, IPA releases, and AltStore/SideStore source now live in [reading-list-ios](https://github.com/taxon221/reading-list-ios).

## Requirements

- Docker Compose
- [Bun](https://bun.sh)

## Environment

Create a `.env` with:

```bash
AUTH_MODE=app
BOOTSTRAP_ADMIN_EMAIL=you@example.com
APP_PUBLIC_URL=https://reading-list.example.com
```

`BOOTSTRAP_ADMIN_EMAIL` is the one email allowed to claim the original admin account. Other authenticated users are created automatically as non-admins on first access.

For Cloudflare Access mode, switch to:

```bash
AUTH_MODE=cloudflare
CLOUDFLARE_ACCESS_TEAM_DOMAIN=https://your-team.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUD=your-access-audience
```

## Run with Docker Compose

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Docker publishes the app on loopback; put your HTTPS reverse proxy or tunnel in front of it and set `TRUST_PROXY=true` so rate limits see real client addresses. For app sign-in, follow the setup instructions below before enrolling a passkey.

With `AUTH_MODE=local`, localhost requests use `LOCAL_DEV_AUTH_EMAIL` as the current user for development. This path checks the actual connection peer and only listens on loopback. It is intended for direct Bun development; use app or Cloudflare auth in Docker.

If `APP_PUBLIC_URL` is set, the app uses it for sign-in and sign-out links in the UI.
The account menu shows your current account and sign-in actions.

## Cloudflare Access Deployment

For deployment behind Cloudflare Access, the app verifies `Cf-Access-Jwt-Assertion` and maps the verified email claim to a local user.

With `AUTH_MODE=cloudflare`, direct local requests return `401` unless they include a valid Cloudflare Access JWT.

## Run Directly (Bun)

```bash
bun install
bun run dev
```

## Data

Library data and account credentials are stored in `data/reading-list.db`; uploaded PDFs and EPUBs are stored in `data/uploads/`. Use `bun run backup` or back up the complete data directory while the app is stopped.

## RSS subscriptions

Paste a feed URL into Add → Add RSS feed, for example:

```text
https://example.com/feed.xml
```

Adding a RSS feed follows it from that point onward. Existing posts already in the feed are marked as seen and are not added to the reading list. Future RSS items are imported as articles with only these default tags: `newsletter` and `rss`.

To manually refresh saved RSS subscriptions, use Refresh RSS in the account menu. To refresh from a scheduler/cron job, run:

```bash
bun run rss:import
```

### API Example

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Jwt-Assertion: <access-jwt>" \
  -d '{"url": "https://example.com", "title": "Example", "type": "article", "tags": ["tech", "read-later"]}'
```

## App sign-in (recommended)

Use `AUTH_MODE=app`, `BOOTSTRAP_ADMIN_EMAIL=you@example.com`, and a stable
`APP_PUBLIC_URL=https://reading.example.com`. HTTPS is required except on localhost.
Cloudflare Tunnel/DNS can still serve the app; remove an Access gate from this app's
hostname when using app sign-in so readers do not encounter two login flows.
Existing Cloudflare mode remains supported, including its existing API clients.

Run `bun run auth:setup` on the server (or `docker compose exec reading-list bun run auth:setup`).
Open the private, one-use link within 24 hours and create your first passkey. This
claims the existing bootstrap account and keeps its library. Download the recovery
codes shown after registration and store them privately. No email service is needed.
Owners invite additional readers from Account. Hosted registration is invitation-only.
Create an invitation, copy the private link, and share it with that reader; no
email is sent automatically. Settings shows Pending, Accepted, Expired, or Revoked
with timestamps. Pending links can be revoked; creating a replacement invalidates
the old link. Acceptance creates a passkey for the invited account and opens its
own empty library. Existing readers' items are never shared through an invitation.

For direct local development with `AUTH_MODE=app`, `APP_HOST=127.0.0.1`, and
`APP_PUBLIC_URL=http://localhost:3000`, opening the app guides you through the
owner's first passkey and recovery codes automatically. This attaches to the
configured `BOOTSTRAP_ADMIN_EMAIL` and preserves its library. Local setup requires
an actual loopback connection without forwarding headers, and closes as soon as
the account has a passkey or recovery codes. Docker and hosted setups use the
private setup link above.

Sessions persist for 30 days. Account lists your devices and lets you revoke each
session, add another passkey, and replace recovery codes. Adding credentials,
creating invitations, and replacing codes require a sign-in within the last ten
minutes. Each recovery code works once; recovery signs out all existing sessions.
If you lose every passkey and recovery code, run `bun run auth:setup -- you@example.com`
on the server to issue a new enrollment link and revoke existing sessions. Remove
lost passkeys after recovery. Keep enrollment links and backups private.

Passkeys are tied to your hostname. Choose your public URL before enrolling.
Native clients using Cloudflare JWTs must continue using Cloudflare mode until
updated for app-owned authentication; a new browser sign-in does not convert an
existing Cloudflare token into an app session.

## Saving and snapshots

Links save before metadata is fetched. Duplicate URLs (including common tracking
parameters and fragments) open the existing item. New articles capture a cleaned
snapshot in the background; older articles get a snapshot on first read. Existing
snapshots remain stable so highlights are not tied to a changing source page.
A failed capture leaves the saved link available through Open original.
Set `ARTICLE_CAPTURE_ON_SAVE=false` to capture only when opening an article.

Unread, In progress, and All are available directly above the filters. Browser Back
closes an opened reader, and `/#item=123` links directly to a saved item.

Unfinished links, files and notes are kept on the device for up to 24 hours and
restored for the same account after sign-in. Unauthenticated share requests are
held privately for 15 minutes (files up to 25 MB). A Cloudflare gate can intercept a
share request before it reaches the app; use app sign-in for this recovery flow.
Failed progress saves are retried after reconnecting.

Reader engines are pinned dependencies and served locally. Run `bun run vendor`
after installing dependencies; start/dev do this automatically. Thumbnails and
article images are fetched by the server with private-address protection and a
bounded per-account cache, rather than contacting third-party favicon services.

## Export, backup, and restore

Account → Export complete library downloads a ZIP containing items, notes,
highlights, tags, feeds and seen entries, saved views, article snapshots, cached
images, and uploaded PDFs/EPUBs. It excludes authentication credentials. The
separate highlights export is readable Markdown. Browser exports are limited to
512 MB of uploaded files; use an operator backup for larger libraries.

For a complete server backup, including accounts, authentication data and uploads:

```sh
bun run backup
# Or choose a private destination:
bun run backup -- /path/to/private/reading-list-backup.zip
```

This uses SQLite's consistent `VACUUM INTO` snapshot, then copies its referenced
uploads. If an upload disappears during the backup, it fails rather than producing
an incomplete archive. Pause writes for a backup while actively deleting files.
To restore, stop the app, delete any `reading-list.db-wal` and `reading-list.db-shm`
files, extract `reading-list.db` and `uploads/` into `DATA_DIR` (default `data/`),
and restart. Keep full backups private: they include credentials.
Never restore a database over a running instance.

The database alone does **not** include uploaded PDFs/EPUBs. Back up the whole data
directory while the app is stopped, or use the backup command above.
