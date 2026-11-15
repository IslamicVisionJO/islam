# Interactive educational scenes — 2026-11-15

Continues source branch `accounts-setup` at `2d9299d`; `main` only contained the initial README. The checkout had no local diff. The requested `educational-boards` and `educational-scenes` files did not exist and are now included by the production builder.

The thirteen activities retain their canonical questions, selected unit/lesson, saved account progress and the existing server-scored online protocol. New scenes include a room with an inspectable drawer and five locks, SVG matching lines, a genuinely animated wheel, reversible memory cards, letter slots, tile styling, category board, bookshelf, word grid, millionaire ladder, a growing tower and rotatable SVG pipes. All styling uses the site's theme variables. Reduced-motion settings are respected.

No content-bank, authentication configuration, migration 005, split SQL or setup-online guide changes are required by these UI changes. The original server determines the online question IDs, shared deadline, receipts and result; visual controls preserve its existing answer payloads.

## Reproduce

```sh
npm ci --cache /tmp/islam-npm-cache
npm run build
npm start
# In another terminal, from this checkout:
npm test
npm run test:games
npm run test:games:online
node tests/scenes.spec.mjs
```

The browser checks use the installed `/usr/bin/chromium`. `scenes.spec.mjs` checks all 13 scenes at 390 and 1280 pixels, matching lines, drawer inspection, pipe rendering, changing wheel rotation, memory flips, building a tower floor, removing placed letters and horizontal overflow. It saves 26 screenshots under ignored `artifacts/scenes/` and writes `test-results/scenes.json`.

The existing educational tests complete all solo games and test incorrect answers, timeouts, keyboard operation, duplicate prevention, scope and restored progress. The online suite uses two isolated browser clients, the actual SQL migrations and a local PostgreSQL-compatible PGlite database, with simulated authentication. It checks all games, custom shared time, reconnection and matching final results. This is local integration evidence, not evidence of hosted Supabase readiness.

A repeat of the online UI suite exposed a test race: it tried to click the manual refresh button as automatic synchronization replaced that button with the completed result. The captured failure showed both players had the same completed server result. The test now waits for automatic synchronization directly, captures the first failure screenshot and stops immediately on failures.

## External verification limits

Both the hosted Supabase domain and Pages domain returned proxy `CONNECT 403` before reaching the service. Environment draft additions were saved for `havrclbzugenqxbarjkl.supabase.co` and `ayoubalbtoosh.github.io`, alongside installation/startup instructions. Saving that draft does not apply it or publish the cloud environment. Review/save the environment settings and publish the environment to activate the reusable configuration. No hosted database reset or SQL reinstallation was performed or requested. Hosted migration presence, real account login and two real hosted players remain unverified until network access and authorized test accounts are available.
