# noteion

## Shared community posts (Supabase)

1. Create a [Supabase](https://supabase.com) project and run the SQL in `supabase/migrations/001_community_posts.sql` (SQL Editor → New query → Run).
2. Copy `supabase-config.example.js` to `supabase-config.js` and set `url` and `anonKey` from **Project Settings → API**.
3. Deploy the static site with `supabase-config.js` included. Users sign up / sign in in the app; published tracks sync to `community_posts` and appear on every device.

Leave `url` empty in `supabase-config.js` to keep the original device-local demo (no server).