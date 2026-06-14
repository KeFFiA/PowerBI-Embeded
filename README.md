# Power BI Embedded — Separate Visuals & Slicers, One Shared Filter Context

A production-style reference implementation for embedding **individual Power BI
visuals and slicers as separate website widgets** while keeping them on **one
shared report filter context** — including cross-filtering.

- **Backend:** Node.js + Express + TypeScript. Authenticates to Microsoft Entra
  ID with a service principal, mints short-lived Power BI **embed tokens**, and
  returns a safe embed config. No client secret ever reaches the browser.
- **Frontend:** Vite + React + TypeScript using `powerbi-client`. Reusable
  components: `PowerBIAnalyticsProvider`, `PowerBIVisual`, `PowerBISlicer`,
  `PowerBIKpi`, `PowerBIVisualGrid`.
- **Everything builds and runs inside Docker.** Nothing is installed on the host.

> **TL;DR of the hard technical truth:** Power BI's native cross-**highlighting**
> only works *within a single report embed*. The recommended approach is to embed
> **one report page** and treat it as a canvas (`shared-canvas`). If you must place
> visuals in arbitrary, non-adjacent DOM containers, this repo also implements a
> `separate-visuals` mode that re-creates cross-**filtering** via a sync layer —
> with documented limitations. Read [The core question](#the-core-question).

---

## Quick start (Docker only — clean host)

```bash
cd powerbi-embed

# 1) Provide runtime config (placeholders are pre-seeded so it builds as-is)
cp .env .env                      # fill in Entra ID values
cp backend/allowlist.example.json backend/allowlist.json   # fill in workspace/report ids

# 2) Build images — installs ALL dependencies inside the images
sudo docker compose build

# 3) Run
sudo docker compose up

# open http://localhost:8080
```

To hand the built images to a teammate without a registry:

```bash
sudo docker save powerbi-embed-backend:latest powerbi-embed-frontend:latest \
  | gzip > powerbi-embed-images.tar.gz
# teammate:
gunzip -c powerbi-embed-images.tar.gz | sudo docker load
```

---

## The core question

> *"I want separate visual blocks and separate slicers, but they must share one
> filter context and cross-filter each other."*

Here is exactly what Power BI does and does not support.

| You embed… | API config | Shares filter context with siblings? | Native cross-highlight? | Separate DOM container per visual? |
|---|---|---|---|---|
| **Full report** (all pages) | `type:'report'` | Yes (within the report) | Yes | No — one iframe |
| **A report page** | `type:'report'` + `pageName` | Yes (within the page) | **Yes** | No — one iframe |
| **An individual visual** | `type:'visual'` + `pageName` + `visualName` | **No — it is an isolated instance** | **No** | **Yes** |
| **A slicer** | `type:'visual'` (slicer visual) | No (isolated) | n/a | Yes |

**The trap:** embedding each visual with `type:'visual'` *looks* like what you
want (separate DOM blocks), but **each one is an independent embed instance with
its own filter state**. A slicer in one instance cannot natively drive a visual
in another instance, and clicking a bar in one chart will not highlight another.
This is the "accidentally isolated instances" failure the task warns about.

### Why this limitation exists

A Power BI visual is not a free-standing component — it is rendered by the Power
BI report runtime *inside the report's iframe*. The JavaScript API can **embed**
a visual into a container and can **read/apply filters** on it, but it cannot
lift an existing live visual out of its report iframe and re-parent its DOM into
your page while keeping it wired to the same in-memory filter/highlight bus. So
you cannot have **both** (a) truly independent DOM containers **and** (b) native
cross-highlighting at the same time.

### The two supported strategies (both implemented here)

**1. `shared-canvas` (recommended — full native behavior).**
Embed **one report page** in a single iframe and style it as the dashboard
canvas: transparent background, hidden filter/navigation panes, custom layout.
All visuals and slicers live in the same instance, so cross-filtering **and**
cross-highlighting are 100% native and free. You design the widget arrangement
*inside the Power BI report page* (and can use the **Custom Layout API** to
resize/show/hide visuals from code). The website draws headers, spacing, and
chrome around the single canvas.

- Pros: native cross-highlight, zero sync code, best performance (one embed).
- Cons: visual placement is constrained to the report page layout (you can't
  scatter visuals into arbitrary, far-apart corners of your HTML).

**2. `separate-visuals` (each visual in its own card — filtering re-created).**
The provider embeds the report **once** (hidden) as the shared context, then
each `PowerBIVisual` / `PowerBISlicer` is embedded as `type:'visual'` into its
own card. Because these are isolated instances, the provider runs a **filter-sync
coordinator**: it listens to the `dataSelected` event on every embed, converts
the selection into explicit `Basic "In"` filters, and applies them to the
sibling visuals. Slicer changes propagate the same way.

- Pros: every visual is a true, independently placeable DOM widget.
- Cons: this reproduces cross-**filtering**, not native cross-**highlighting**
  (the partial fade effect). There is added latency per interaction, and complex
  selections (measure-based highlights, drill state) are not perfectly mirrored.

This repo defaults the demo to `separate-visuals` because that is the layout the
task describes; switch the provider's `strategy` prop to `shared-canvas` for
guaranteed native behavior.

---

## Architecture

```
Browser (React + powerbi-client)
  │  1. POST /api/embed/token   { reportKey, pageName, visualNames, [rls] }
  ▼
nginx (frontend container)  ──proxy /api──►  Express backend container
                                              │  2. MSAL client-credentials
                                              ▼
                                       Microsoft Entra ID  ──► AAD access token
                                              │  3. GET report + POST GenerateToken
                                              ▼
                                       Power BI REST API   ──► embed token (short-lived)
  ◄───────────────── 4. { embedUrl, accessToken (embed), expiration, … } ──────────────
  │
  5. powerbi.embed(...) once → shared report; visuals embedded into cards;
     filters synchronized; token auto-refreshed before expiry.
```

- **Secret isolation:** `AAD_CLIENT_SECRET` lives only in the backend container's
  environment. The browser receives only the embed token.
- **Allowlist:** the backend refuses any workspace/report/page/visual not present
  in `allowlist.json`. The frontend's requested ids are never trusted directly.
- **Token lifecycle:** embed tokens are short-lived. The provider schedules a
  refresh ~2 minutes before `expiration`, re-fetches, and calls `setAccessToken`
  on the master report and every child embed — no flicker, no re-embed.

### Repo layout

```
powerbi-embed/
├── docker-compose.yml          # backend + frontend, builds deps inside images
├── .env.example                # backend secrets/config (copy to .env)
├── backend/
│   ├── Dockerfile              # multi-stage: build TS → minimal runtime
│   ├── allowlist.example.json  # which reports/pages/visuals are embeddable
│   └── src/
│       ├── index.ts            # express app (helmet, cors, rate-limit)
│       ├── config.ts           # zod-validated env + allowlist loader
│       ├── auth.ts             # MSAL client-credentials (Entra ID)
│       ├── powerbi.ts          # REST: get report, GenerateToken (RLS-aware)
│       ├── allowlist.ts        # request validation against allowlist
│       ├── routes/embed.ts     # POST /api/embed/token, GET /api/embed/reports
│       └── middleware/errorHandler.ts
└── frontend/
    ├── Dockerfile              # build with vite → serve via nginx (+ /api proxy)
    ├── nginx.conf
    └── src/
        ├── api/embed.ts                       # calls the backend
        ├── config/dashboard.config.ts         # visual-name → widget-block map
        ├── powerbi/
        │   ├── PowerBIAnalyticsProvider.tsx   # embeds report once, shares context
        │   ├── PowerBIContext.ts              # usePowerBI()
        │   ├── useVisualEmbed.ts              # per-visual embed + registration
        │   ├── filterSync.ts                  # selection → filters → siblings
        │   ├── PowerBIVisual / Slicer / Kpi   # widget components
        │   ├── PowerBIVisualGrid.tsx          # responsive layout
        │   └── WidgetCard.tsx                 # title/loading/error/refresh/fullscreen
        └── styles/cards.css                   # responsive dashboard cards
```

---

## Component API

```tsx
<PowerBIAnalyticsProvider
  reportKey="sales-analytics"     // friendly key from the backend allowlist
  pageName="ReportSection..."     // the canvas page
  visualNames={[...]}             // allowlist hint sent to the backend
  strategy="separate-visuals"     // or "shared-canvas"
>
  <PowerBIVisualGrid blocks={dashboardConfig.blocks} />
  {/* or place individual widgets anywhere: */}
  <PowerBISlicer visualName="..." title="Region" />
  <PowerBIKpi    visualName="..." title="Sales KPI" />
  <PowerBIVisual visualName="..." title="Revenue" />
</PowerBIAnalyticsProvider>
```

The provider: fetches the embed config, embeds the report **once**, loads the
page, exposes the report/page/visual context, manages the shared instance,
preserves filtering, and handles loading/errors/token-expiration/cleanup. Each
widget component renders into its own card with loading + error + refresh +
(optional) fullscreen, is responsive, and accepts `className`/`style` for custom
card styling.

**Finding `visualName` values:** they are *internal* names, not display titles.
Run the app and click **"Print visual names → console"** (the `VisualInspector`
in `App.tsx`), which calls `report.getPages()` → `page.getVisuals()` and logs
`name` + `title` + `type` for every visual. Copy the `name` into
`dashboard.config.ts`.

---

## Power BI setup checklist

1. **Create the report** in Power BI Desktop; publish to a workspace.
2. **Design one page as the canvas:** add the slicers and visuals you want
   (Date, Region, Category slicers; Sales KPI, Revenue chart, Map, Table,
   Funnel). For `shared-canvas`, arrange them as you want them to appear.
3. **Name visuals clearly:** select each visual → *General* → *Properties* →
   *Title*, and ideally set the *Alt text*/name so they're identifiable. Record
   the internal `name` via the inspector (step in Component API).
4. **Get the workspace (group) ID:** open the workspace in the Power BI Service;
   the URL is `app.powerbi.com/groups/<workspaceId>/...`.
5. **Get the report ID:** open the report; URL is `.../reports/<reportId>/...`.
6. **Get page names:** internal page names look like `ReportSection<hash>`; read
   them with `report.getPages()` (the inspector prints them).
7. **Register an Entra ID app:** Azure Portal → *App registrations* → *New*.
   Note the **tenant id** and **client (application) id**.
8. **Create a client secret:** *Certificates & secrets* → *New client secret*.
   Copy the **value** immediately into `.env` as `AAD_CLIENT_SECRET`.
9. **Configure the service principal for Power BI:** Power BI Admin portal →
   *Tenant settings* → enable **"Service principals can use Power BI APIs"** and
   add your app (or its security group). No Power BI admin? Ask yours.
10. **Add the service principal to the workspace:** workspace → *Access* → add
    the app as **Member** (or Contributor). Without this you get 401/403.
11. **Capacity:** for production embed-for-your-customers (app-owns-data), the
    workspace must be on an **embedded/Premium/Fabric capacity** (A/EM/P/F SKU).
    Dev/testing works on Pro for limited render volume.
12. **(If using RLS)** define roles in Power BI Desktop, set `rls.enabled` +
    `roles` in `allowlist.json`, and pass an effective identity (see security).
13. **Test token generation:** `sudo docker compose up`, then watch backend logs
    for `Issued embed token`. Hit `GET /api/embed/reports` to confirm config.
14. **Test interactions:** change a slicer and confirm visuals update; click a
    chart and confirm cross-filtering. If not, re-read the strategy section.

---

## Security notes

- **Embed token is backend-only.** Generated via `POST .../GenerateToken` using
  an AAD token from the client-credentials flow. The browser never sees the AAD
  token or the client secret.
- **No secrets on the frontend.** The frontend only ever receives the embed
  token, embed URL, and ids it already asked for.
- **Allowlist validation.** `allowlist.json` is the source of truth; requested
  report/workspace/page/visual values are validated against it (`allowlist.ts`).
- **CORS** is an explicit origin allowlist (`CORS_ALLOWED_ORIGINS`); no wildcard
  with credentials. Behind the bundled nginx the browser is same-origin anyway.
- **Rate limiting + helmet** are enabled by default.
- **RLS / effective identity.** Supported via `rls` in the request and
  `identities` in `GenerateToken`. **Important:** in production the identity MUST
  come from a server-trusted session/JWT, *never* from values the browser can
  set. The allowlist additionally constrains which roles can be requested.
- **Do not use "Publish to web."** It is anonymous/public and unsuitable for
  private analytics. This solution uses secure embed tokens instead.

---

## Common Power BI Embedded errors & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 Unauthorized` from REST | Service principal not enabled, or wrong tenant/client/secret | Enable "Service principals can use Power BI APIs"; verify `.env`; recreate secret |
| `403 Forbidden` on GenerateToken | SP not a member of the workspace | Add the app to workspace **Access** as Member/Contributor |
| `PowerBIEntityNotFound` / 404 on report | Wrong report/workspace id, or report in a different workspace | Recheck ids from the Service URL; confirm the SP can see that workspace |
| `TokenExpired` / visuals blank after a while | Embed token lifetime elapsed | Handled here via scheduled refresh; check the backend stays reachable |
| Visual renders but **slicer doesn't affect it** | You embedded isolated `type:'visual'` instances expecting native sync | Use `shared-canvas`, or rely on the `separate-visuals` filter-sync layer |
| `This visual can't be displayed` in a card | Wrong `visualName` (used the title, not internal name) or wrong `pageName` | Use the inspector to get the internal `name`/page name |
| Capacity / throttling errors in prod | No embedded capacity, or over-utilized | Assign workspace to an A/EM/P/F capacity; scale the SKU |
| CORS error in browser console | Origin not in `CORS_ALLOWED_ORIGINS`, or calling backend cross-origin | Add the origin, or serve via the bundled nginx (`/api` proxy = same origin) |
| `LoadReportFailed` with correct ids | Embed token generated for a different report/dataset, or RLS misconfig | Ensure token is for the same report; verify RLS roles/identity |
| Mixed-content / iframe blocked | Serving over http with strict policies | Serve over https in production; Power BI requires a secure context for some features |

---

## Notes on production hardening

- Put the backend behind HTTPS (terminate TLS at your ingress/load balancer).
- Replace the request-body RLS identity with your authenticated session.
- Pin `CORS_ALLOWED_ORIGINS` to your real domains.
- Consider per-user authorization in front of `/api/embed/token`.
- Monitor capacity utilization (Power BI metrics app) and embed token error rates.
