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

## Requirements

- Docker Compose
- [Bun](https://bun.sh)

## Environment

Create a `.env` with:

```bash
AUTH_MODE=local
BOOTSTRAP_ADMIN_EMAIL=you@example.com
LOCAL_DEV_AUTH_EMAIL=you@example.com
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

Open [http://localhost:3000](http://localhost:3000).

With `AUTH_MODE=local`, localhost requests use `LOCAL_DEV_AUTH_EMAIL` as the current user for development. This path only applies on loopback hosts.

If `APP_PUBLIC_URL` is set, the app uses it for sign-in and sign-out links in the UI.
The header badge reflects `AUTH_MODE`: `local` for localhost dev auth, `cloudflare` for Cloudflare Access mode.

## Cloudflare Access Deployment

For deployment behind Cloudflare Access, the app verifies `Cf-Access-Jwt-Assertion` and maps the verified email claim to a local user.

With `AUTH_MODE=cloudflare`, direct local requests return `401` unless they include a valid Cloudflare Access JWT.

## Run Directly (Bun)

```bash
bun install
bun run dev
```

## Data

All data is stored in `data/reading-list.db`. The `data` directory is created automatically on first run. Back up this file to preserve your reading list.

### API Example

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -H "Cf-Access-Jwt-Assertion: <access-jwt>" \
  -d '{"url": "https://example.com", "title": "Example", "type": "article", "tags": ["tech", "read-later"]}'
```
