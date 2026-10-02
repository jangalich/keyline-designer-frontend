# Keyline Designer — frontend design guide

> **This file is the guide's home in the repository from branch 30 on.**
> Until this branch the guide was a project file maintained outside both
> repositories and handed to each session as a copy; backend modules cite it
> (`site_report.py` names `src/index.css` as the guide's token source) and
> nothing versioned it. The full text — type, colour, layout, the plate
> system and the branch history — is to be committed here from the
> maintainer's current copy. The section below is the amendment branch 30
> makes to it, written against the rule it amends, so it can be merged into
> the full text in place when that copy lands.

## Pages and routes

**The rule as it stood:** one page, continuous scroll, no routes. The map is
the document; the wizard floats over it; everything the marketing page says
sits above and below it on one scroll. That was a real decision, and it
still governs the product's main page: nothing about designing a parcel
wants a second URL, and a wizard split across routes is a wizard whose
back button fights its step rail.

**The amendment:** two kinds of thing qualify for a route of their own, and
nothing else does.

1. **Reference material.** A page a person reads rather than works in, that
   they will want to link to, bookmark, cite, or come back to from outside
   the app. The methods page — how each figure in the report is derived,
   from which source, with what caveats — is this kind, and was the first
   case to be recognised. It is still unbuilt; when it is built it is a
   route.

2. **Transactions.** A page where something is bought, confirmed, or
   returned to. A checkout wants its own URL: it must be linkable, survive a
   refresh, give the back button somewhere honest to go, and give a payment
   provider a return URL. A modal hosting a transaction is fighting its
   container. The report page (`/report?session=…`, branch 30) is this kind
   and is the first route built.

**What does not qualify.** A step of the wizard. A detail panel. A
confirmation. A sample or a preview (the report's sample pages stay in the
marketing page's flow; the maximised view is a dialogue, not a route).
Anything whose state is the design's state belongs on the one page, because
the one page is where the design is.

**How a route is built here**, so the second one is built the way the first
was:

- **No router library.** `src/router.jsx` is a location subscription, a
  `navigate()` over `pushState`, and the one hook components read. Two
  routes with no nesting and no path parameters do not need a vocabulary.
  Replace the file rather than growing it if a route arrives with real
  needs.
- **The session id travels in the query**, `?session=…`, on every route, as
  it already does for resume. The session provider reads it off the URL on
  mount whatever the pathname, so a bookmark, a refresh and a return from
  outside all hydrate through the one path the wizard uses. A route that
  needs the session needs no resume path of its own.
- **The wizard page stays mounted.** A route renders as a layer over it
  (`App.jsx`, `Routes`), with the wizard page made `inert` and the document
  scroll locked. Going back is the layer leaving: no hydration, no map fit,
  no tiles refetched, the scroll position where it was. A route that
  replaced the wizard's component tree would remount the map at the default
  view with the design off screen, because the resume fit fires once, on the
  resume landing, and a remount is not one.
- **A route is a page in the product's own voice**: the prose shell's
  measure, the section heading sizes, the same slots and controls. It is the
  same product's second page, not a second product.
- **The host rewrites every non-API path to the app** (`vercel.json`), so a
  direct load of a route is the app and not a 404. Vite's dev and preview
  servers already do this.
- **Each route sets the document title** on entry and restores it on
  leaving, moves focus to its heading on arrival, and returns focus to the
  control that opened it on leaving, where that control still exists.

**The judgement to make next time** is not "is this like the report page"
but "is this reference material or a transaction". If it is neither, it
goes on the one page.
