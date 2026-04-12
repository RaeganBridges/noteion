# noteion

## Shared community posts (Supabase)

1. Create a [Supabase](https://supabase.com) project and run the SQL in `supabase/migrations/001_community_posts.sql` (SQL Editor → New query → Run).
2. **Do not edit `supabase-config.js` by hand.** Copy `.env.example` to `.env`, set `SUPABASE_ANON_KEY` from **Project Settings → API** (anon public), then run:
   ```bash
   npm run sup
   ```
   That command (`sup`) regenerates `supabase-config.js` from `.env`. The `.env` file is gitignored so the key is not committed.
3. Optional one-liner without a `.env` file: `SUPABASE_ANON_KEY=eyJ... npm run sup`
4. Deploy the static site including the generated `supabase-config.js`. Users sign up / sign in in the app; published tracks sync to `community_posts`.

Leave `anonKey` empty and skip `npm run sup` to keep the original device-local demo (no server).

### Troubleshooting

- **Nothing syncs / sign-in looks like the old local demo** — `anonKey` must be the **anon public** JWT from **Project Settings → API** (long string starting with `eyJ…`), not the project URL. If you do not want the key in git, add before `auth-storage.js`: `<script>window.SONGSHARE_SUPABASE_ANON_KEY="eyJ…";</script>`.
- If you ever committed an anon key to a public repo, **rotate** it in Supabase (Settings → API → reset anon key) and use the new value only in local or private config.
- Open the browser **developer console** (F12 → Console). You should see `[Noteion]` warnings if the key is missing or wrong.
- **“Email not confirmed”** — In Supabase: **Authentication → Providers → Email**, you can disable “Confirm email” for testing, or confirm the link Supabase sends.
- **Table errors** — Run `001_community_posts.sql` in the SQL Editor and confirm **Table Editor → `community_posts`** exists.