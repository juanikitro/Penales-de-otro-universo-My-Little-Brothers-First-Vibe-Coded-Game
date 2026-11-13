# Railway migration

Production files recovered byte-for-byte from Vercel deployment dpl_13wL7upLrBh6PfC84gjrxJjyzpN7 on 2026-11-12. Main previously contained an older game. Source hashes were checked before importing all 21 public files.

Dockerfile serves only an explicit whitelist with Node, as non-root. PORT defaults to 8080 in Docker and HOST to 0.0.0.0. Configure Railway Dockerfile path Dockerfile, healthcheck /, timeout 60 seconds, ON_FAILURE retry 3. Config applied directly to Railway; legacy railway.json is not used.

Deploy migration/railway and verify the effective commit. Public URL penales.juanikitro.com; DNS remains on Vercel. No persistent data or scheduled jobs detected. Rollback is redeploying the previous verified game artifact; keep Vercel until owner validation.

Acceptance: 25 rules tests; all 21 public responses match recovered hashes; no browser errors; character and difficulty selection, match start, shot/keeper turns, powers, results/rematch, fullscreen and mobile landscape. Owner performs final gameplay validation. No fixed observation interval. Do not retire the origin before owner confirmation.
