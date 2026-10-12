# Codexora Portal — All 8 Modules Complete 🎉

## Modules 1–7 (recap)
Auth foundation → signup+OTP → CAPTCHA → owner approval → login/reset
password → real client dashboard (project, files/Cloudinary, invoices,
tickets) → real owner dashboard (overview, clients, projects, invoices,
leads).

## Module 8 — Notifications, polish & deployment (just added)

**In-app notifications:**
- New `Notification` model + `GET /api/notifications`,
  `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
  — works for both roles.
- Automatic triggers:
  - Client approved → notifies that client
  - Project stage/milestone updated → notifies that client
  - New invoice created → notifies that client
  - New support ticket → notifies all owners
  - New website lead → notifies all owners
- Real 🔔 bell component on both dashboards: unread badge, dropdown list,
  click-to-mark-read, "mark all read", polls every 30 seconds.

**Responsive polish:**
- Both dashboards now have a working ☰ mobile menu — below 760px, the
  sidebar becomes a slide-in drawer with a tap-to-close backdrop instead
  of just disappearing.

**Deployment:**
- See **DEPLOYMENT.md** for the full walkthrough — MongoDB Atlas network
  access, backend → Render, real reCAPTCHA keys, frontend → Vercel, and
  wiring `portal.codexora.in` through Cloudflare DNS, plus a final
  smoke-test checklist and how to connect your real contact form to the
  new leads endpoint.

## Run it all locally

### Backend
cd backend
cp .env.example .env       # fill in Mongo/JWT/SMTP/reCAPTCHA/Cloudinary
npm install
npm run dev                 # http://localhost:5000

### Frontend
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173

## How to test Module 8
1. As owner: approve a pending client → check the 🔔 bell shows an
   unread notification was created *for the client* (log in as them to
   see it) confirming the "approval" trigger fired.
2. As owner: change a client's project stage from the Clients tab →
   log in as that client → their bell should show the milestone update.
3. As owner: add an invoice for a client → same check, "New invoice"
   notification appears for them.
4. As client: submit a support ticket → log in as owner → bell shows
   "New support ticket."
5. `POST /api/leads` a test lead → as owner, bell shows "New website
   lead."
6. Click a few notifications to mark them read individually, then try
   "Mark all read" — badge count should drop to 0 and stay accurate
   after a refresh.
7. Resize your browser (or open on your phone) under 760px wide on
   either dashboard — tap ☰, confirm the sidebar slides in and tapping
   the dark backdrop closes it again.

## What's genuinely left to do (outside these 8 modules)
- Deploying for real, following DEPLOYMENT.md, including registering
  production reCAPTCHA keys and pointing DNS.
- Optionally wiring your live website's contact form to `POST /api/leads`.
- Anything you want to add later: PDF invoice downloads (PDFKit — you've
  used this before on ClientOS), a "reply" flow on support tickets, or
  richer owner analytics. None of that was in the original 8-module scope,
  so it's fair game for a "Module 9" whenever you want one.

## Fixes applied after Module 8
1. **Backend crash fixed** — `ownerRoutes.js` was importing `listLeads`
   and `updateLeadStatus` from `ownerController.js`, but those two
   functions actually live in `leadController.js`. Corrected the import;
   verified with `node --check` on every backend file.
2. **Login now has a real Client/Owner split** — a role toggle is back
   at the top of `/login`. Picking a tab and signing in with an account
   of the *other* role is now blocked with a clear message telling you
   to switch tabs, instead of silently logging you into the wrong
   dashboard.
3. **CAPTCHA no longer fails silently** — if `VITE_RECAPTCHA_SITE_KEY`
   is missing from the frontend `.env`, or Google's script can't load
   (network/blocked), you'll now see a clear red message explaining
   exactly what's wrong, instead of an empty blank space where the
   widget should be.

**If you were seeing no CAPTCHA on Login/Signup:** almost certainly your
frontend is running without a `.env` file. Run:
    cd frontend
    cp .env.example .env
    npm run dev
The `.env.example` already ships with Google's official test site key,
which works on `localhost` — that alone should make the checkbox appear.
