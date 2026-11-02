# Working on Reading List

Setup, development, and testing requests are local by default. Do not deploy,
connect to production hosts, restart production services, or change production
authentication unless the user explicitly requests production work.

The local app uses `http://localhost:3000` with `AUTH_MODE=app` and
`APP_HOST=127.0.0.1`. Keep local data and environment files separate from production.
