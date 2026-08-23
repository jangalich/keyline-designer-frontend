# Interactive Design — Frontend Architecture

## Status

Proposal only — the frontend half of the interactive-design architecture.
The shared session model, the backend architecture, the persistence
decision, and the back-tracking decision live in
`interactive-design-architecture-proposal.md` in the `keyline-designer`
(backend) repo; read that first. This document assumes its vocabulary:
**Design Document** (the server's canonical record of the user's
decisions), **Step Registry** (the backend's declarative list of KSOP
steps), **generate / commit / reopen** (the per-step API verbs), and
**jobs** (async generate/report work polled via `GET /api/jobs/{id}`).

---

## 1. Where the current frontend is

`App.jsx` is a single component holding the whole flow as a flat cluster
of `useState` hooks (`points`, `isDrawing`, `isFinished`, `accessPoint`,
`isSelectingAccessPoint`, `report`, `isLoading`, `error`), with the UI as
a chain of boolean-combination conditionals and one fetch call at the end.
That is the right size for today's flow — draw, pick a point, download a
PDF — but it does not extend to N steps: every new step would multiply the
boolean combinations, and the mutual-exclusion invariant that is already
asserted by hand (`isDrawing` vs `isSelectingAccessPoint`) is exactly the
kind of thing that must become structural rather than asserted.

What *does* carry forward: the map composition pattern (small,
single-purpose Leaflet tool components — `DrawTool`, `AccessPointTool`,
`ScrollZoomGate`, `BasemapControl` — layered into one `MapContainer`), the
Leaflet-order-vs-GeoJSON-order conversion discipline in `geo.js`, and the
page shell.

---

## 2. Target architecture

Four pieces, each with one job:

```
┌────────────────────────────────────────────────────────────┐
│ Session Store  — client mirror of the server Design        │
│ Document: session_id, per-step {status, features,          │
│ revision}, active step, job states. Single source of       │
│ truth; everything renders from it.                         │
└──────────────┬─────────────────────────────────────────────┘
               │ selectors                    actions
┌──────────────▼──────────────┐  ┌────────────▼──────────────┐
│ Step Controller — the KSOP  │  │ API Client — sessions,    │
│ wizard: which step is       │  │ steps, layers, jobs;      │
│ active, what its local      │  │ owns polling and 409      │
│ machine state is, what the  │  │ reconciliation.           │
│ panel shows.                │  └───────────────────────────┘
└──────────────┬──────────────┘
               │ per-step definition (declarative)
┌──────────────▼─────────────────────────────────────────────┐
│ Map Layer Stack — basemap · context/eligibility layers ·   │
│ committed layers (read-only) · active editable layer       │
│ (edit tools armed per the step definition).                │
└────────────────────────────────────────────────────────────┘
```

### 2.1 Session Store

A single store (a `useReducer` context is sufficient at this size; a
minimal external store like Zustand is an acceptable alternative if
component-tree depth makes prop/context threading noisy — the architecture
only requires *one* store, not a particular library) holding:

- `sessionId` — also reflected into the URL (`?session=…`) and
  localStorage, so refresh/resume is `GET /api/sessions/{id}` →
  `hydrate(document)` and nothing else.
- `steps[stepId]` → `{ status, features, revision, proposals, error }` —
  a direct mirror of the Design Document plus transient per-step UI state.
- `activeStep`, `jobs[jobId]`.

Two rules give the store its value:

1. **The server document is truth; the store is a mirror plus drafts.**
   The only client-authored state is the in-progress edit buffer of the
   active step (unsent geometry edits). Everything else is written only by
   hydrating server responses — including commit responses, which return
   the updated document (with any cascade invalidations) and are applied
   wholesale rather than patched locally. This makes the 409 conflict
   path, the reopen cascade, and multi-tab drift all the same code: replace
   mirror with server document, keep or discard the draft, re-render.
2. **No derived design content, ever.** The client never computes zones,
   keypoints, eligibility, or acreage-bearing analysis — it displays and
   edits GeoJSON the server produced and submits GeoJSON back. (Cosmetic
   client-side geometry like the live acreage chip stays client-side; it
   is a reading aid, not a design value.)

### 2.2 Step Controller and step definitions

The wizard is a linear KSOP sequence rendered from an ordered list of
**step definitions** — the frontend twin of the backend Step Registry.
Each definition is declarative:

```js
{
  id: 'water',
  title: 'Water zones',
  generateLabel: 'Generate water zones',
  layers: {                      // what the map shows during this step
    context:   ['eligibility.water', 'valleys'],
    committed: ['landform'],     // prior steps, settled styling, read-only
    editable:  'water',          // the one layer edit tools act on
  },
  editTools: ['select'],         // subset of: select | adjust | draw | delete
  commit: { allowEmpty: true },  // "no water zone" is a legal commit
  inputs: [],                    // roads step: [{ id: 'access_point', tool: 'point-on-boundary' }]
}
```

Every step runs the same local machine — the *same* machine, so its UI,
buttons, and error surfaces are written once:

```
idle → generating(job) → reviewing ⇄ editing → committing → committed
                              ↑                                  │
                              └──────────── reopen ──────────────┘
```

- `generating` and `committing` are the only states that talk to the API.
- `committed` steps render their panel collapsed with an **Edit this
  step** affordance; activating it calls `reopen`, and the confirmation
  dialog lists exactly which downstream steps will reset (the cascade is a
  backend decision — see the backend doc §4 — the frontend's job is to
  make its cost visible *before* the click, then hydrate the returned
  document).
- Adding a KSOP step to the product is: one backend registry entry + one
  frontend definition object. No new wizard code.

The current boundary flow becomes step 0 of the same wizard (`DrawTool` as
its editable layer, commit = `POST /api/sessions`), and the access point
stops being a global pre-step and becomes the roads step's declared
`input` — matching where it actually belongs in the KSOP order.

### 2.3 Map Layer Stack

Rendering is a pure function of the store + the active step definition,
composed in fixed z-order:

1. **Basemap** (existing `BasemapControl`).
2. **Context layers** — server GeoJSON, read-only, subdued styling:
   boundary, valleys/keypoints where relevant, and the active step's
   eligibility mask (rendered as an *ineligible-area* dim overlay, so the
   user sees where drawing is allowed before trying).
3. **Committed layers** — prior steps' committed features, "settled"
   styling (solid, muted), never editable in place; clicking one offers
   navigation to that step's Edit affordance, nothing else.
4. **Active editable layer** — the current step's features with the edit
   tools the definition arms:
   - `select` — toggle a proposal in/out of the commit set,
   - `adjust` — vertex drag on an existing polygon,
   - `draw` — new polygon, vertex-by-vertex (the existing `DrawTool`
     interaction, generalized to any polygon layer),
   - `delete` — remove a feature (e.g. an irrelevant keypoint).

This is the existing composition pattern scaled up: each tool stays a
small Leaflet component; what changes is that *arming* is driven by the
step definition instead of hand-managed booleans, which retires the
asserted mutual-exclusion invariant structurally — only one editable layer
exists at a time, and only its declared tools mount.

Client-side eligibility snapping/warnings during drawing are best-effort
UX (point-in-polygon against the eligibility GeoJSON); the server's commit
validation is the real gate, and a rejection renders per-feature (the
offending features highlighted, with the server's reason), not as a
generic error banner.

### 2.4 API Client

One module owning the wire, so components never call `fetch`:

- Session verbs (`create`, `get`), step verbs (`generate`, `commit`,
  `reopen`), layer fetches, report.
- **Job polling** for generate/report: submits, polls `GET
  /api/jobs/{id}` with backoff, surfaces `{running → done|failed}` into
  the store. If the backend later upgrades to SSE, only this module
  changes.
- **Conflict handling**: a 409 on commit carries the current document; the
  client hydrates it, keeps the local draft where its base step survived,
  and re-prompts. One implementation, shared by all steps.
- Coordinate-order conversion (Leaflet `[lat, lng]` ⇄ GeoJSON
  `[lng, lat]`) stays confined here and in `geo.js`, as it is today.

---

## 3. Flow walkthrough (mirrors the backend worked example)

1. **Step 0 — boundary.** Draw (existing interaction) → commit → `POST
   /api/sessions` → job while Layer 1 fetches → session id lands in
   store/URL/localStorage.
2. **Landform.** Generate → proposals render as the editable layer over
   the eligibility dim → user drags a zone edge, deletes two keypoints,
   draws one zone inside the eligible area → Commit → server validates,
   returns updated document → step collapses to committed.
3. **Water.** Generate (server computes against the *committed* landform)
   → user selects one zone, or commits empty deliberately
   (`allowEmpty: true` renders an explicit "Continue with no water zone"
   action, never a silent empty submit).
4. **Roads.** The step's declared input arms the point-on-boundary tool
   (existing `AccessPointTool`) before generate is enabled; proposals →
   commit. Structures, trees: same machine.
5. **Going back.** User reopens landform; dialog: "Editing this step
   resets Water, Roads (2 committed steps)." Confirm → hydrate returned
   document → downstream panels revert to `not_started`.
6. **Report.** Final step; generate → job → PDF download (existing
   download handling), from the session's accreted context — no
   re-computation, no re-fetch.
7. **Resume.** New tab / next day: session id from URL or localStorage →
   `GET /api/sessions/{id}` → hydrate → the wizard opens exactly where the
   document says it is.

---

## 4. What carries over vs. what is retired

| Carries over | Retired / transformed |
|---|---|
| Map tool components (`DrawTool`, `AccessPointTool`, `ScrollZoomGate`, `BasemapControl`, `MapRecenter`, `AcreageChip`) — become step-armed tools/layers | Flat boolean flow state in `App.jsx` → Session Store + step machines |
| `geo.js` coordinate discipline | Hand-asserted tool mutual exclusion → structural (one editable layer at a time) |
| `AddressSearch`, page shell, styling system | Single end-of-flow `fetch` → API client with jobs + conflicts |
| PDF download handling | Access point as a global pre-step → an input of the roads step |

The intent is that the interactive frontend is recognizably the same
product — the same map, the same drawing feel, the same page — with the
one-shot form replaced by a wizard whose steps are data, not code.
