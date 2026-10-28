# ⛵ wsa-reservation.mteke.com: WSA Reserveringen

Equipment booking site for **Water Sportvereniging Amstelveen (WSA)** on De Poel.

It is built with **Astro + React islands + Tailwind v4 + shadcn/ui**, the same stack and look as
[sail.mteke.com](https://sail.mteke.com). The site is static and hosted on **GitHub Pages**; **Supabase** stores the
data and handles login.

- **Login with Google, Facebook or GitHub.** A login only gives access once an admin has approved it. New accounts
  wait in an approval queue, and admins can also pre-approve email addresses.
- **Three roles:**
  - *Members* can only book and cancel their own bookings.
  - *Admins* manage members and other admins, see statistics (per member × equipment, hours, CSV export) and change the rules.
  - *Super admins* (first one: melihteke@gmail.com) can also create other super admins. Nobody can block, delete or
    change a super admin from the site.
- **Fleet:** 6 Laser Pico · 2 kielboten · 10 waterfietsen · 10 supboards · 10 windsurfplanken.
- **Booking rules** are enforced in Postgres, so the front-end can't bypass them:
  - Bookings last at most **3 hours**, in 30-minute steps.
  - People can book for **today or tomorrow** (Europe/Amsterdam), within opening hours (09:00–21:00 by default;
    admins can change this).
  - **One booking per member at a time.**
  - Capacity is checked per equipment type for the whole time window.
- **Live board** on the home page:
  - Signed-in members see who is on the water now and who is coming up, with equipment icons, through Supabase
    Realtime.
  - Visitors who are not signed in see availability counts only.
- **Taken from the logbook:**
  - Live wind for De Poel (Open-Meteo).
  - Windy.com wind map.
  - Club activity heatmap.
  - Statistics cards.
  - Dark mode.
- **Languages:** Dutch by default (`/`) and English (`/en/`).

## Set up

See **[docs/SETUP.md](docs/SETUP.md)**. It covers the Supabase project and SQL, the Google, Facebook and GitHub
login apps, GitHub Pages, and DNS.

## Project layout

```
supabase/migrations/   0001_schema.sql (tables, RLS, seed) · 0002_functions.sql (booking + admin RPCs) · 0003/0004 (super admin)
supabase/tests/        rules.test.ts: runs the migrations in PGlite and tests every rule and RLS policy
src/i18n/ui.ts         Dutch / English strings, language routing helpers
src/lib/rules.ts       time-slot helpers mirroring the database rules (+ rules.test.ts)
src/lib/auth.ts        Supabase session + profile hook, sign in / out
src/components/        LiveBoard, ReservePage, MyReservationsPage, AdminPage (+ admin/*), LiveWind, ...
src/pages/[...lang]/   every page twice: / (nl) and /en/ (en)
```

## Develop

```powershell
Copy-Item .env.example .env   # PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev     # http://localhost:4321
npm test        # vitest: database rules (PGlite) + UI helpers
npm run build   # astro check + build to dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages.
