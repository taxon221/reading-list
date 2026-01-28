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
- SQLite database (no external dependencies)
- Single binary deployment with Bun

## Requirements

- [Bun](https://bun.sh)

## Run Directly (Bun)

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). For production, run:

```bash
bun run start
```

## Run with Docker

```bash
docker build -t reading-list .
docker run -d -p 3000:3000 -v reading-list-data:/app/data reading-list
```

## Data

All data is stored in `data/reading-list.db` (SQLite). The `data` directory is created automatically on first run. Back up this file to preserve your reading list.

For Docker deployments, the data directory is mounted as a volume to persist data between container restarts.

## API Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/items` | Get items (supports `tags` and `types` query params) |
| GET | `/api/items/:id` | Get a single item |
| POST | `/api/items` | Add new item |
| PATCH | `/api/items/:id` | Update item fields (`is_read`, `title`, `notes`) |
| PUT | `/api/items/:id` | Replace item (url/title/type/tags/notes) |
| DELETE | `/api/items/:id` | Delete item |
| GET | `/api/tags` | Get all tags |
| GET | `/api/fetch-meta` | Fetch metadata for a URL (`?url=`) |
| GET | `/api/proxy` | Reader proxy for external content (`?url=`) |
| POST | `/api/import/readwise` | Import Readwise CSV (`multipart/form-data` file field: `file`) |
| GET | `/api/highlights` | Get all highlights |
| GET | `/api/items/:id/highlights` | Get highlights for an item |
| POST | `/api/items/:id/highlights` | Create highlight (selected_text, note) |
| PATCH | `/api/highlights/:id` | Update highlight note |
| DELETE | `/api/highlights/:id` | Delete highlight |

### Add Item Example

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "title": "Example", "type": "article", "tags": ["tech", "read-later"]}'
```

## Project Structure

```
./
├── src/
│   ├── index.ts      # Server entry point
│   └── db.ts         # Database setup
├── public/
│   ├── index.html
│   ├── manifest.webmanifest
│   └── static/
│       ├── app.js
│       ├── styles.css
│       ├── icon.svg
│       ├── icon-180.png
│       ├── icon-192.png
│       └── icon-512.png
├── LICENSE
├── package.json
├── Dockerfile
└── README.md
```
