# Deploying the Codexora Portal to portal.codexora.in

## 1. MongoDB Atlas
- In Atlas → Network Access, add `0.0.0.0/0` (allow from anywhere) —
  Render's outbound IPs aren't fixed on the free tier.
- Copy your production connection string for `MONGO_URI`.

## 2. Backend → Render
1. Push the `backend/` folder to a GitHub repo (or the repo root, with
   Render's "Root Directory" set to `backend`).
2. New → Web Service → connect the repo.
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Root directory:** `backend` (if monorepo)
3. Add every variable from `backend/.env.example` under Environment,
   with real production values:
   - `MONGO_URI` — Atlas connection string
   - `JWT_SECRET` — a long random string (generate with
     `openssl rand -hex 32`)
   - `CLIENT_URL` — your production frontend URL, e.g.
     `https://portal.codexora.in` (this drives CORS — get it exactly
     right or the frontend can't call the API)
   - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` — your Gmail App Password.
     **If emails silently fail in production, switch `SMTP_PORT` to
     `2525`** — this is the same Render-free-tier SMTP block you hit
     before on the Complaint Management System project.
   - `RECAPTCHA_SECRET_KEY` — see step 4, do NOT ship the test key to
     production.
   - `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`
4. Deploy. Confirm `https://<your-render-app>.onrender.com/api/health`
   returns `{ status: "ok" }`.
5. (Optional) Add a custom domain in Render, e.g. `api.codexora.in`, and
   point a CNAME at it via Cloudflare — cleaner than the `.onrender.com`
   URL, and means you can swap hosts later without changing the
   frontend's env var.

## 3. Get real reCAPTCHA keys
The test keys in `.env.example` only work on `localhost`. Before
production:
1. Go to https://www.google.com/recaptcha/admin
2. Register a new site, type **reCAPTCHA v2 "I'm not a robot" Checkbox**,
   domain `portal.codexora.in`.
3. Put the **Site key** in the frontend's `VITE_RECAPTCHA_SITE_KEY` and
   the **Secret key** in the backend's `RECAPTCHA_SECRET_KEY`.

## 4. Frontend → Vercel
1. Push `frontend/` (same repo, root directory `frontend` if monorepo).
2. New Project → import the repo → Vercel auto-detects Vite.
3. Add environment variables:
   - `VITE_API_URL` — your Render backend URL + `/api`, e.g.
     `https://api.codexora.in/api`
   - `VITE_RECAPTCHA_SITE_KEY` — the real site key from step 3
4. Deploy. Vercel gives you a `*.vercel.app` URL first — confirm
   `/login` loads and the CAPTCHA widget renders before moving on.

## 5. DNS via Cloudflare (portal.codexora.in)
1. In Vercel → your project → Settings → Domains → add
   `portal.codexora.in`. Vercel will show you the exact CNAME target it
   needs (usually `cname.vercel-dns.com`).
2. In Cloudflare's DNS tab for `codexora.in`, add:
   - Type: `CNAME`, Name: `portal`, Target: (what Vercel gave you),
     Proxy status: **DNS only** (grey cloud) at first — switch to
     proxied (orange cloud) only after confirming it works, since
     Vercel needs to issue its own SSL certificate first.
3. Wait for DNS propagation (usually minutes, can take longer), then
   revisit Vercel's Domains tab — it should show "Valid Configuration."
4. Go back to Render and update `CLIENT_URL` to
   `https://portal.codexora.in` exactly (no trailing slash), then
   redeploy the backend so CORS allows the real domain.
5. If you gave the backend a custom domain too (`api.codexora.in`),
   add that CNAME in Cloudflare as well, pointing at Render's target,
   and update the frontend's `VITE_API_URL` to match — then redeploy
   the frontend.

## 6. Final smoke test on the real domain
- Sign up a fresh test client on `https://portal.codexora.in/signup` —
  confirm the OTP email arrives, CAPTCHA works, approval flow works.
- Log in as the seeded owner and as the newly approved client.
- Upload a deliverable, add an invoice, submit a support ticket, submit
  a test lead via `POST https://api.codexora.in/api/leads` — confirm
  notifications appear for both roles.
- Open the site on a phone — confirm the ☰ menu opens the sidebar as an
  overlay and the backdrop tap-to-close works.

## Optional: connect your real contact form
Point codexorasolutions.online's contact form at
`POST https://api.codexora.in/api/leads` (fields: `name`, `email`,
`phone`, `businessName`, `message`) instead of — or in addition to —
the Google Sheets/Apps Script flow, so leads show up directly in the
owner dashboard's **Website leads** tab.
