# Reading List

A minimal, self-hosted reading list manager. Save articles, videos, PDFs, and podcasts with tags for easy filtering.

## Features

- Save links with title, type (article/video/pdf/podcast), and tags
- Filter by tags
- Mark items as read/unread
- Clean, minimal interface
- SQLite database (no external dependencies)
- Single binary deployment with Bun

## Requirements

- [Bun](https://bun.sh) v1.0 or later

## Quick Start

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Run the development server**

   ```bash
   bun run dev
   ```

3. **Open in browser**

   Navigate to [http://localhost:3000](http://localhost:3000)

## Production

### Option 1: Direct Run

```bash
bun run start
```

### Option 2: With Custom Port

```bash
PORT=8080 bun run start
```

### Option 3: Docker

Build and run with Docker:

```bash
docker build -t reading-list .
docker run -d -p 3000:3000 -v reading-list-data:/app/data reading-list
```

### Option 4: Systemd Service

Create `/etc/systemd/system/reading-list.service`:

```ini
[Unit]
Description=Reading List App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/reading-list
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable reading-list
sudo systemctl start reading-list
```

## Deployment with a Domain

### Using Caddy (Recommended)

Install [Caddy](https://caddyserver.com) and create a Caddyfile:

```
yourdomain.com {
    reverse_proxy localhost:3000
}
```

Caddy automatically handles HTTPS certificates.

### Using Nginx

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Use [Certbot](https://certbot.eff.org/) for HTTPS:

```bash
sudo certbot --nginx -d yourdomain.com
```

## Data

All data is stored in `data/reading-list.db` (SQLite). The `data` directory is created automatically on first run. Back up this file to preserve your reading list.

For Docker deployments, the data directory is mounted as a volume to persist data between container restarts.

## API Endpoints

| Method | Endpoint         | Description              |
| ------ | ---------------- | ------------------------ |
| GET    | `/api/items`     | Get all items            |
| GET    | `/api/items?tag=x` | Get items filtered by tag |
| POST   | `/api/items`     | Add new item             |
| PATCH  | `/api/items/:id` | Update item (read status) |
| DELETE | `/api/items/:id` | Delete item              |
| GET    | `/api/tags`      | Get all tags             |

### Add Item Example

```bash
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "title": "Example", "type": "article", "tags": ["tech", "read-later"]}'
```

## Project Structure

```
reading-list-app/
├── src/
│   ├── index.ts      # Server entry point
│   └── db.ts         # Database setup
├── public/
│   ├── index.html    # Main page
│   └── static/
│       ├── styles.css
│       └── app.js
├── package.json
├── Dockerfile
└── README.md
```

## License

MIT