# HydroSense v2 — deploy on Render

## 1. Put the code on GitHub
Replace the contents of your `akshayace23-maker/HYDROSENSE` repo with the files in this folder
(`backend/`, `public/`, `package.json`, `render.yaml`, `.gitignore`). Delete the old `launcher.js` and
`hydrosense-app.zip`. **Never upload a `.env` file or `node_modules`.**

## 2. Create / update the Render service
Render → your existing `hydrosense` web service → **Settings**:
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`

## 3. Environment variables (Render → Environment)
| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a NEW long random string (generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`). **Do not reuse the old one — it was exposed in GETTING_STARTED.md.** |
| `AUTHORITY_EMAIL_DOMAIN` | `krct.ac.in` |
| `AUTHORITY_INVITE_CODE` | a private phrase you give only to real officers (authority sign-up is closed without it) |
| `GEMINI_API_KEY` | **FREE** AI photo check: get a key at https://aistudio.google.com/apikey (sign in with Google > Create API key; no card). Without any key, a simple built-in colour check runs instead. |
| `ANTHROPIC_API_KEY` | optional paid alternative; if set, it is used instead of Gemini |
| `PUBLIC_BASE_URL` | your Render URL, e.g. `https://hydrosen.onrender.com` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | optional — only if you want real status e-mails |

Save → Render redeploys automatically.

**Privacy note:** on Google's free tier, photos sent for the AI check may be used by Google to improve its products. Photos are stripped of GPS/metadata first, but tell users if that matters to you (paid keys are not used this way).

## 4. Keeping the data
On Render's **free** plan the disk is temporary: reports, accounts and photos are erased on every redeploy and
after the service restarts. For a real launch use a paid instance, add a **Disk** (mount path `/var/data`), and set
`DB_PATH=/var/data/hydrosense.db` and `UPLOAD_DIR=/var/data/uploads`.
Free services also sleep after ~15 minutes without visitors (first load then takes ~30 s).

## 5. First-run checklist
1. Open the site → landing page with the 3D globe; tap **தமிழ்** to switch language.
2. Register a citizen, file a report with a photo; try "Use my current location" and pasting a Google Maps link.
3. Register an authority account (`you@krct.ac.in` + invite code) and update the report's status.
