# noteion

## Shared community posts (Supabase)

1. Create a [Supabase](https://supabase.com) project and run the SQL in `supabase/migrations/001_community_posts.sql` (SQL Editor → New query → Run).
2. Copy `supabase-config.example.js` to `supabase-config.js` and set `url` and `anonKey` from **Project Settings → API**.
3. Deploy the static site with `supabase-config.js` included. Users sign up / sign in in the app; published tracks sync to `community_posts` and appear on every device.

Leave `url` empty in `supabase-config.js` to keep the original device-local demo (no server).

### Troubleshooting

- **Nothing syncs / sign-in looks like the old local demo** — `anonKey` must be the **anon public** JWT from **Project Settings → API** (long string starting with `eyJ…`), not the project URL. If you do not want the key in git, add before `auth-storage.js`: `<script>window.SONGSHARE_SUPABASE_ANON_KEY="eyJ…";</script>`.
- Open the browser **developer console** (F12 → Console). You should see `[Noteion]` warnings if the key is missing or wrong.
- **“Email not confirmed”** — In Supabase: **Authentication → Providers → Email**, you can disable “Confirm email” for testing, or confirm the link Supabase sends.
- **Table errors** — Run `001_community_posts.sql` in the SQL Editor and confirm **Table Editor → `community_posts`** exists.