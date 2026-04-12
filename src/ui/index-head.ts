export function renderIndexHead() {
	return `
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="Personal reading list manager" />
      <meta name="theme-color" content="#111111" />
      <title>Reading List</title>
      <link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials" />
      <link rel="apple-touch-icon" href="/static/icon-180.png" />
      <link rel="icon" type="image/png" sizes="192x192" href="/static/icon-192.png" />
      <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2'><path d='M4 19.5A2.5 2.5 0 0 1 6.5 17H20'/><path d='M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z'/></svg>" />
      <link rel="stylesheet" href="/static/styles.css" />
    </head>`;
}
