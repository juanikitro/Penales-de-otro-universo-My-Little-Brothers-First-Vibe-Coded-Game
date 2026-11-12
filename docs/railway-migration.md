# Railway migration

Public URL: https://penales.juanikitro.com

Build the Dockerfile from migration/railway. It copies only the six public game files and the HTTP server; no npm install or external runtime dependency. PORT is supplied by Railway; HOST=0.0.0.0 in the container. Local serve.cjs keeps its localhost default.

Acceptance: 25 rule tests, JavaScript syntax, HTTP assets and 404 behavior, desktop/mobile game, sound, powers and fullscreen. User acceptance is required before removing Vercel; no fixed observation period. Vercel remains available until then.

Rollback before removing Vercel: restore the prior DNS record (initially this subdomain inherits the Vercel wildcard) or use the original vercel.app URL. The game stores no server-side data.
