# BabyTrak 👶

A small, self-hosted web app to track your baby's **breast feeds**, **bottle feeds**, **medications**, **milestones**,
and **diapers** . Runs entirely on your own machine or VPS.
Add entries from your phone or iPad over the local network or setup tailscale for remote access.

## Stack

- **Frontend:** React + Vite, React Router, [Recharts](https://recharts.org) for
  charts, [Bootstrap Icons](https://icons.getbootstrap.com) (via `react-bootstrap-icons`)
- **Backend:** Node + Express
- **Database:** SQLite (via `better-sqlite3`) — a single file at `data/babytrak.sqlite`, perfect for one user with small relational data. No separate DB server to run.

The Express server serves the built React app, so in production it's **one process**.

## Project layout

```
BabyTrak/
├── server/          Express API + SQLite
│   ├── index.js     server entry (serves API + built client)
│   ├── db.js        SQLite connection + schema
│   └── routes.js    REST API
├── client/          React + Vite app
│   └── src/
│       ├── pages/   Track, Dashboard, History
│       ├── forms/   Breast / Bottle / Diaper entry forms
│       └── components/
└── data/            SQLite file lives here (created on first run, git-ignored)
```

## Setup

Requires Node 18+ (developed on Node 24).

```bash
npm install          # installs server + client deps
```

## Development (hot reload)

Runs the API on :3001 and Vite on :5173 (Vite proxies `/api` to the server):

```bash
npm run dev
```

Then open the Vite URL it prints. From another device on your network, use
`http://<your-box-ip>:5173`.

## Production (single process — recommended for the Linux box)

```bash
npm run build        # builds the React app into client/dist
npm start            # serves API + app on http://<your-box-ip>:3001
```

Open `http://<your-box-ip>:3001` from your phone/iPad. (Tip: "Add to Home Screen"
for an app-like experience.)

Set a custom port with `PORT=8080 npm start`.

### Run it on boot (optional)

A simple systemd unit:

```ini
# /etc/systemd/system/babytrak.service
[Unit]
Description=BabyTrak
After=network.target

[Service]
WorkingDirectory=/path/to/BabyTrak
ExecStart=/usr/bin/node server/index.js
Environment=PORT=3001
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now babytrak
```

## Data & backups

Everything lives in `data/babytrak.sqlite`. To back up, just copy that file
(stop the server first, or copy the `.sqlite`, `.sqlite-wal`, and `.sqlite-shm`
files together).

## Features

- **Multiple babies:** add as many babies as you like (name, birthdate, gender,
  weight, height in lb/kg & in/cm). Switch the active baby from the pill in the
  header; the whole app — entries, history, and charts — is scoped to that baby,
  and the selection is remembered. The UI greets you with the baby's name and age,
  and the whole app re-themes to the baby's gender — **pink for a girl, blue for a
  boy**, and a neutral slate when unspecified.
- **Feeding (one entry, three kinds):** tap **Feed** and choose **Breast**,
  **Bottle**, or **Both** (a combo feed).
  - *Breast:* start time, independent left/right **stopwatch** (only one side runs
    at a time, like real nursing) *or* manual minute entry, milk type, comment.
    End time is computed from total nursing duration.
  - *Bottle:* amount in **ml or oz**, breast-milk / formula, comment.
  - *Both:* nursing time **and** a bottle amount in a single combo entry.
- **Pumping:** start time, **duration** (stopwatch or manual) and **volume
  collected** (ml or oz), comment.
- **Diapers:** time, **wet / dirty / both**, comment.
- **History:** timeline grouped by day, with delete.
- **Dashboard:** stat cards + charts (feeds per day, bottle volume, diapers
  wet/dirty, milk source split) over 7 / 14 / 30 days.

## API (for reference)

| Method | Path | Notes |
|--------|------|-------|
| GET/POST | `/api/babies` | list / create |
| PUT/DELETE | `/api/babies/:id` | update / delete (cascades to entries) |
| GET/POST/DELETE | `/api/feedings?babyId=N` | feeds (type breast/bottle/both), scoped to baby |
| GET/POST/DELETE | `/api/pumps` | pumping sessions |
| GET/POST | `/api/diapers` | list / create |
| DELETE | `/api/diapers/:id` | delete |
| GET | `/api/timeline` | combined, newest-first |
| GET | `/api/stats?days=N` | daily aggregates for charts |

(`PUT /:id` is also implemented on each resource for future editing.)
