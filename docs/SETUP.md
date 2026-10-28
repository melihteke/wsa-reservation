# Setup guide: wsa-reservation.mteke.com

This guide takes the site from this repository to a live booking system:
**Supabase** (database + login) → **OAuth apps** (Google, Facebook, GitHub) → **GitHub Pages** + **DNS**.

> Placeholders: `<ref>` is your Supabase project ref (the `xxxx` in `https://xxxx.supabase.co`).

## 1. Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

   - Name: `wsa-reservation`. Region: **West EU (Ireland)** or **Central EU (Frankfurt)** (the privacy page says the data is in the EU).
2. **SQL Editor** → **New query**, then paste and run **in order**:

   1. [`supabase/migrations/0001_schema.sql`](../supabase/migrations/0001_schema.sql): tables, row level security, fleet seed
      (6 Laser Pico, 2 kielboten, 10 waterfietsen, 10 supboards, 10 windsurfplanken) and opening hours 09:00–21:00.
   2. [`supabase/migrations/0002_functions.sql`](../supabase/migrations/0002_functions.sql): booking rules and admin functions.
   3. [`supabase/migrations/0003_superadmin_role.sql`](../supabase/migrations/0003_superadmin_role.sql): adds the super admin role.
      Run it **as a separate query**: Postgres can't use a new role value in the same run that adds it.
   4. [`supabase/migrations/0004_superadmin.sql`](../supabase/migrations/0004_superadmin.sql): super admin rules. It also makes
      `melihteke@gmail.com` the first super admin, whether that account already exists or signs in later.

   With the Supabase CLI you can run `supabase link --project-ref <ref>` and then `supabase db push` instead.
3. **First super admin.** `0004_superadmin.sql` already sets this up for `melihteke@gmail.com`. To use another email,
   run this:

   ```sql
   insert into public.allowed_emails (email, role) values ('your.email@gmail.com', 'superadmin')
   on conflict (email) do update set role = 'superadmin';
   update public.profiles set role = 'superadmin', status = 'approved' where lower(email) = 'your.email@gmail.com';
   ```
4. **Database → Publications → `supabase_realtime`**: check that `reservations` is listed. The migration adds it,
   and the live board uses it.
5. **Project Settings → API**: copy the **Project URL** and the **anon / publishable key**. Both are public by design,
   because all protection is done by row level security and the database functions.

## 2. Auth URLs

**Authentication → URL Configuration**

| Setting       | Value                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Site URL      | `https://wsa-reservation.mteke.com`                                                                                                 |
| Redirect URLs | `https://wsa-reservation.mteke.com/**https://melihteke.github.io/wsa-reservation/**` (before DNS works)`http://localhost:4321/**` |

Every provider below uses the same **callback URL**: `https://<ref>.supabase.co/auth/v1/callback`.

## 3. Login providers

Enable each provider under **Authentication → Sign In / Providers** and paste in its client ID and secret.

### Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project named `WSA Reservations`.
2. **APIs & Services → OAuth consent screen**: choose External, app name `WSA Reserveringen`, add your support email,
   and set the authorised domains `mteke.com` and `supabase.co`. The scopes are `email`, `profile` and `openid`. Publish the app.
3. **Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**.
   - Authorised JavaScript origins: `https://wsa-reservation.mteke.com`.
   - Authorised redirect URIs: `https://<ref>.supabase.co/auth/v1/callback`.
4. Copy the client ID and secret into Supabase → **Google**.

### GitHub

1. Go to GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - Homepage URL: `https://wsa-reservation.mteke.com`.
   - Authorization callback URL: `https://<ref>.supabase.co/auth/v1/callback`.
2. Generate a client secret and copy the ID and secret into Supabase → **GitHub**.

### Facebook

1. Go to [developers.facebook.com](https://developers.facebook.com/apps) → **Create app** → use case
   **Authenticate and request data from users with Facebook Login**.
2. **Use cases → Facebook Login → Customize**: add the `email` permission (`public_profile` is already there).
3. **Facebook Login → Settings**: set Valid OAuth Redirect URIs to `https://<ref>.supabase.co/auth/v1/callback`.
4. **App settings → Basic**. Facebook won't let the app go Live ("Currently ineligible for submission") until
   these fields are filled in:

   | Field                  | Value                                                                                                                                                                                                                                            |
   | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | App domains            | `mteke.com`                                                                                                                                                                                                                                    |
   | App icon (1024 x 1024) | Upload [`docs/app-icon-1024.png`](app-icon-1024.png)                                                                                                                                                                                            |
   | Privacy policy URL     | `https://wsa-reservation.mteke.com/privacy/`                                                                                                                                                                                                   |
   | User data deletion     | Choose **Data deletion instructions URL**, then `https://wsa-reservation.mteke.com/data-deletion/`. Keep the trailing `/`: without it GitHub Pages answers with a redirect, which Meta rejects. Meta also rejects the privacy URL here |
   | Category               | **Lifestyle** (or **Sports** if it is in the list)                                                                                                                                                                                   |

   Click **Save changes**. Facebook opens both URLs to check them, so wait until the site's HTTPS certificate works
   (**Enforce HTTPS** can be ticked in GitHub Pages) before you save them.
5. Switch **App Mode** at the top from **Development** to **Live**, then copy the App ID and App secret into
   Supabase → **Facebook**.

> Supabase links identities that share the same verified email, so one person who signs in with Google and then
> with GitHub stays one member. If a provider does create a second account, the database approves it automatically
> as long as an approved account with the same email already exists.

## 4. GitHub repository and Pages

1. Create the repository `melihteke/wsa-reservation` and push this folder:

   ```powershell
   git remote add origin https://github.com/melihteke/wsa-reservation.git
   git push -u origin main
   ```
2. **Settings → Secrets and variables → Actions → Variables** (these are variables, not secrets):

   - `PUBLIC_SUPABASE_URL` = `https://<ref>.supabase.co`
   - `PUBLIC_SUPABASE_ANON_KEY` = the anon / publishable key
3. **Settings → Pages**:

   - Source: **GitHub Actions**.
   - Custom domain: `wsa-reservation.mteke.com`. The repository already contains `public/CNAME`.
   - Turn on **Enforce HTTPS** once the certificate has been issued.
4. Every push to `main` runs the tests and then builds and deploys the site (see `.github/workflows/deploy.yml`).
   You can also start it by hand under **Actions → Deploy to GitHub Pages → Run workflow**.

## 5. DNS (mteke.com)

At the DNS provider for `mteke.com`, add:

| Type  | Name                | Value                   |
| ----- | ------------------- | ----------------------- |
| CNAME | `wsa-reservation` | `melihteke.github.io` |

Optionally, verify the domain under GitHub → **Settings → Pages → Verified domains** to protect it against takeover.

## 6. Daily use

- **Roles:**

  | Role                  | Can do                                                                                                                                                                                               |
  | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **Member**      | Book (one at a time), cancel or end their own booking, see who is on the water.                                                                                                                      |
  | **Admin**       | Everything a member can, plus: approve, block or delete members **and other admins**, make members admins, see statistics, change settings.                                                    |
  | **Super admin** | Everything an admin can, plus: create other **super admins**. Nobody can block, delete or change a super admin, and admins can't cancel a super admin's bookings or remove their pre-approval. |

  A super admin can only be changed or removed in the Supabase SQL editor.
- **New members** sign in with Google, Facebook or GitHub and land on *Wacht op goedkeuring*.

  - An admin approves them under **Beheer → Leden**.
  - An admin can also pre-approve an email address under **E-mail vooraf goedkeuren**, so that person gets access right away.
- **Remove someone:**

  - **Blokkeren** keeps the member's history for the statistics and cancels their upcoming bookings.
  - **Verwijderen** deletes the login, the profile and all of the member's bookings.
- **Rules** are set under **Beheer → Instellingen**:

  - Opening hours, maximum duration and how many days ahead people can book.
  - Fleet size: you can also take equipment out of service.

## Local development

```powershell
Copy-Item .env.example .env   # fill in URL + anon key
npm install
npm run dev                   # http://localhost:4321
npm test                      # booking rules + RLS (PGlite) and UI time helpers
npm run build                 # astro check + static build into dist/
```
