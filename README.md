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

- [Bun](https://bun.sh)

## Run Directly (Bun)

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). 

## Run with Docker

```bash
docker build -t reading-list .
docker run -d -p 3000:3000 -v reading-list-data:/app/data reading-list
```

## Data

All data is stored in `data/reading-list.db`. The `data` directory is created automatically on first run. Back up this file to preserve your reading list.

### Add Item Example

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "title": "Example", "type": "article", "tags": ["tech", "read-later"]}'
```
