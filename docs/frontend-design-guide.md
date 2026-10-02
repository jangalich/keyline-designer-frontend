# Frontend Design Guide

## Purpose

This document fixes the visual direction for Keyline Designer across both
surfaces it produces: the website and the generated PDF. It plays the same
role for frontend work that the pipeline architecture guide plays for the
backend — a standing reference so that later branches don't relitigate
decisions made in earlier ones.

Read this before drafting any frontend branch prompt. If a branch needs to
depart from something here, change this document first and say why.

It lives in the repository at `docs/frontend-design-guide.md` from branch 30
on. Until then it was a project file maintained outside both repositories
and handed to each session as a copy, cited (`site_report.py` names
`src/index.css` as its token source) and versioned nowhere. A branch that
changes it changes it here, in the same commit as the work.

---

## The character

**Mid-century agricultural manual.** The visual world that keyline design
was originally published into: technical farming bulletins, extension
service pamphlets, hand-drafted contour diagrams, ink on warm stock with a
single spot color.

This is chosen for a reason, not for style. Keyline design has a genuine
visual lineage, and drawing on it is a credibility argument that polish
alone can't make. The tool's entire job is to convince someone that what
they're receiving is real analysis of their specific land — not a template
with their address pasted into it. Every visual decision either supports
that claim or undermines it.

**What it is not:** venture-backed SaaS, farmers-market craft, or a generic
map dashboard. The audience is small farmers and regenerative agriculture
practitioners. Anything that reads as enterprise software is a mismatch and
probably an active liability.

### The two surfaces

The website is four moments and some explanatory content. The PDF is the
artifact that persists — printed, marked up, handed to a contractor, still
in a drawer in three years.

The PDF is the more constrained surface: fixed page, print color, WeasyPrint's
CSS subset, no hover, no interaction. **Anything that survives there
translates trivially to the web. The reverse is not true.** When the two
surfaces disagree, the document wins.

---

## Type

Three roles. The third is the one that does the most work.

| Role | Face | Used for |
| --- | --- | --- |
| Display | Bitter (slab serif) | Headings, wordmark, section titles |
| Prose | Source Serif 4 | Body copy, panel text, report narrative |
| Data | IBM Plex Mono | Every measured value, plus small caps-style eyebrow labels |

**The data rule is the important one.** Every number that came out of the
pipeline — acreage, slope percentage, elevation, distances, grades, counts —
is set in mono with tabular figures. Nothing else is.

This is what separates an instrument from a farm website. It also carries
directly into the PDF, where the KSOP narrative is dense with computed
figures that currently have no typographic identity of their own. A reader
should be able to tell at a glance which parts of a sentence are measured
and which are prose.

Tabular figures matter specifically: numbers in a column must align on the
decimal. Enable them explicitly rather than assuming the face defaults to
them.

**Two weights only** per face. Resist adding a third — it's how type systems
start to drift.

**`--font-data` is not yet used anywhere.** After branch 1 the face is loaded
and tokenized, but nothing on the page sets it, which is why only two of the
four font files fetch on load. It lands in branch 3, on the point count and
the acreage-while-drawing chip. This is the signature of the whole direction —
the single thing that makes it specific rather than one more warm-cream site.
It should not slip past branch 3.

---

## Color

| Token | Value | Role |
| --- | --- | --- |
| Stock | `#f4f1ea` | Page background |
| Paper | `#fdfcf9` | Panel surface — deliberately lighter than stock |
| Rule | `#ddd6c8` | Hairlines, borders, dividers |
| Ink | `#2b2b26` | Primary text |
| Ink, muted | `#8a8477` | Secondary text, labels, captions |
| On oxide | `#fdfcf9` | Text on an oxide fill |
| Oxide | `#9c4a2f` | The accent. Primary actions only |
| Oxide, deep | `#7d3a25` | Oxide hover and active |
| Ochre | `#c99a2e` | Secondary emphasis, access point marker |
| Field | `#4a5f3a` | Map geometry and legend only |
| Alert | `#7a2418` | Error text only |
| Disabled | `#c4bfb2` | Disabled control surface |
| Halo | `#ffffff` | Marker outlines on the map only |

Two of these look redundant and aren't. **On oxide** carries the same value as
paper but is named for its role, so it survives the arrival of a second filled
control. **Halo** is the one pure white in the system: it exists to keep a
marker legible against arbitrary satellite imagery, so it wants maximum
luminance rather than palette harmony. Nothing else in the interface is pure
white — against warm stock it reads as a colder, different material.

Disabled controls keep `--ink` for their label, not `--ink-muted`. Muted ink
on the disabled surface is roughly 2:1 contrast and unreadable; the flat grey
surface carries the signal on its own.

### Rules

**At most one accent per state.** Oxide marks the single primary action
available at any given moment. If two buttons on screen are both oxide, one of
them is wrong.

The rule is *at most*, not *exactly*. A state can legitimately have no primary
action, and forcing an accent onto one is worse than leaving it unmarked. The
delivery state is the live example: the PDF has already downloaded, so the
primary action already happened. Marking "Regenerate report" would invite a
pointless second pipeline run; marking "Redraw" would invite discarding a
boundary just finished. Neither earns oxide.

That state currently reads as thin, and that is honest rather than a bug — it
needs a real design, which is branch 5. Do not compensate for it with color.

**Green is never a control.** This is the non-obvious constraint and the
reason the palette moved. Interface elements sit on top of aerial photography
of farmland, which is green and brown across the entire frame. A green
accent fights the exact hue it's drawn over and half-disappears against
tree canopy. Green stays in the system for map geometry and the PDF legend,
where it means something. It never becomes a button.

Warm reds and ambers are the complement of the greens they sit on, which is
both why mid-century bulletins used oxide and ochre as spot colors and why
they work here.

**No new color literals below `:root`.** Every color in a component stylesheet
is a token reference. The standing check:

```bash
grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(' src/App.css
grep -rnE '#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(' src/ --include=*.jsx
```

Both should return nothing. A hex-only grep is not sufficient — `rgba()`
literals slip straight past it, which is how the marker shadows and the
closable-vertex ring nearly survived branch 1. Derived values use
`color-mix(in srgb, var(--token) N%, transparent)`; whole shadows get their
own token rather than a color token.

The JSX check matters because Leaflet takes JS values, not CSS variables, so
map geometry colors have to be read out with `getComputedStyle` on
`document.documentElement`. **Read tokens at first render, never at module
evaluation** — a module-level read returns an empty string, and first-render
reads don't depend on import order being right.

**Two files are necessary exceptions**, and no grep reaches them: `favicon.svg`
renders as a standalone document, and `<meta name="theme-color">` in
`index.html` isn't CSS. Both carry `#f4f1ea` and the favicon also carries
`#2b2b26`. They are token duplicates by necessity — comment them as such, and
update them by hand if the palette ever moves.

**`--ink-muted` is for captions and labels, not for sentences that carry the
argument.** The hero subhead and section body copy are `--ink`; hierarchy comes
from size and measure, not from fading the text. This was the first thing to go
wrong once real copy landed on the page.

**Retire the borrowed colors.** The current `#3f6212` (noticeably more
saturated than the other greens, looks lifted from Tailwind) and `#b3261e`
(looks like Material's error red) both go. Status colors derive from this
palette or they don't exist.

---

## Layout

**One page, continuous scroll.** No routes, with two exceptions the next
subsection names. The tool is an anchored section, which gives deep-linking
for free if it's ever wanted.

### Pages and routes

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

**The hero caps at roughly 70–75vh** so a sliver of the map is visible at the
fold. That peek is the call to action — it shows rather than tells. A small
anchor link in the nav is sufficient; a large hero button would compete with
a map that's already on screen.

**Two widths.** Prose sits at reading measure (~680px). The map breaks out
wider — same left and right margins as the content, just fewer of them in
between. The map also gets an expand control, because drawing is the one
moment where more pixels straightforwardly means a more accurate boundary.

**The tool section is a single viewport unit.** Map at roughly 60vh with a
compact panel below it, the pair fitting one screen. This is what makes
"panel below the map" correct rather than broken: nothing scrolls away
mid-trace, so no sticky positioning is needed, no ground is covered by
floating chrome, and it stacks to mobile without a second design.

**The map needs a definite height.** Leaflet's `MapContainer` is
`height: 100%`, which requires a parent with a resolved height. Once `.page`
stopped being `100vh`, a `flex: 1` map in an auto-height parent would silently
collapse to zero. The map is `clamp(20rem, 60vh, 38rem)`, and the status panel
is capped at `30vh` so the pair fits one screen. **This is the most
regression-prone thing on the page** — any future change to the tool section's
height model has to preserve a resolved height on the map's parent.

**Hero rhythm.** Generous space above the headline, moderate headline to
subhead, **generous subhead to input**, then **tight input to map edge**. The
input is a control, not the last line of the paragraph — crowding it against
the subhead makes it read as a form field appended to the copy, while space
makes it read as the thing you do after reading. The input and the map edge
are one gesture: enter an address, land on your property. A void between them
breaks that and pushes the peek further down than it needs to be.

**Background:** contour linework, static, behind the scrolling content. Not
aerial imagery — a satellite photo behind the page would make the satellite
map inside the page read as decoration rather than data. Reserve aerial
imagery for the map so it lands as the real thing.

### The contour asset — decided, do not relitigate

`src/assets/contours-40ft-t5.svg`. Real 3DEP terrain, generated once by
`scripts/fetch_contour_dem.py` and `scripts/generate_contour_background.py` in
the backend repo. Dissected Allegheny Plateau, 2.1 × 2.6 km, 303 ft of relief.

```
interval    40 ft (12.192 m)
tolerance   5 m Douglas–Peucker
stroke      var(--ink-muted) at 20% opacity
width       1px with vector-effect: non-scaling-stroke
size        19.8 KB, 49 subpaths, one <path> element
```

**Three implementation constraints, each learned the hard way:**

1. **It must be inlined into the DOM.** The asset uses
   `stroke="currentColor"` so the token system controls its color. Referenced
   as a CSS `background-image` or an `<img src>`, `currentColor` has no
   `color` to inherit and the paths render black or not at all. Import it as a
   React component or paste it into JSX.
2. **`vector-effect: non-scaling-stroke` is not in the file** and must be
   written in CSS. Without it, one SVG user unit is one ground meter, so line
   weight scales with the viewport and the chosen opacity does not hold across
   monitors.
3. **`preserveAspectRatio="xMidYMid slice"` is baked into the asset.** It
   crops rather than letterboxes and centers what it keeps — cover behavior.
   The framing decision lives inside the file, not in CSS.

`--rule` was tested as the stroke color and rejected on measurement, not
taste: at `#ddd6c8` on `#f4f1ea` it needs roughly 4× the alpha of
`--ink-muted` for equal presence, and at 25% opacity it only reaches what
`--ink-muted` gives at 5%. `--rule` is designed to be a near-neighbor of the
page; it cannot also read as linework over it.

**A methodological note worth keeping.** Interval was decided three times and
the calculation was wrong twice — reasoning from contour *level* counts
(7 levels at 40 ft) badly underestimates what fills a frame, because what you
see is line *features* and their wander across the extent (47 lines from those
7 levels). Density questions get settled by looking at a preview at real
background conditions, in the real typefaces, at both desktop and phone crops.
The same applies to the type scale and anything else where the answer is
perceptual.

---

## Map and interaction

**Click-to-activate scroll.** `scrollWheelZoom` starts disabled; clicking the
map enables it, clicking outside disables it, with a faint hint while inert.
Without this, a user scrolling the page hits the map, the page stops, and the
map zooms out to the continent — losing both their place and their view in
one gesture. The inert/live distinction is also useful in itself: the map is
quiet while you're reading past it and live once you've committed.

**Live feedback on the map, actions in the panel.** A small chip in the map's
top-left carries point count and running acreage as vertices are placed. The
buttons live below. Acreage-while-drawing does real work — it tells someone
immediately whether they've drawn something in the range this tool is built
for.

**Basemap switching is functional, not chrome.** Imagery vintage matters when
tracing a boundary, and leaf-off versus leaf-on changes what's visible on the
ground considerably. A small control, not a layer tree.

**Boundary geometry must survive aerial imagery.** Stroke and vertex colors
are chosen for contrast against canopy and bare soil in the same frame, which
is the same reasoning that moved the accent off green.

### The plate system

Map geometry follows the mid-century topographic convention: **color carries
category, pattern carries subtype within it.** On a USGS sheet, blue always
meant water and whether it was solid, dashed, or tinted told you which kind;
green always meant cover and the overprint told you orchard versus forest.
Nothing borrowed another plate's color to mean something else.

| Layer | Mark | Plate |
| --- | --- | --- |
| Production zones | Oxide diagonal hatch, no outline, no fill | The recommendation |
| Water zones | Blue screened tint with a firmer edge | The survey area |
| Farm roads | `--ink` solid line, halo casing | Culture |
| Fencing | `--ink` dashed, lighter weight, halo casing | Culture |
| Building sites | `--ink` filled glyph, halo | Culture |
| Trees | Green | Permanent cover |
| Contours | Brown, real terrain lines | Terrain (PDF only) |
| Access point | Ochre | **User input, not a computed result** |

**Blue is a map-only token, like `--field`.** The interface palette has no blue
because it was built for chrome over aerial imagery, where warm accents were
correct. Map geometry is a different job. Water gets its own plate and nothing
else uses it — that reservation is exactly why water reads instantly on a topo
sheet. Target something desaturated and mid-dark, a tonal sibling of `--field`
rather than a bright cartographic cyan.

**Distinguish by technique, not only by color.** Production is linear (hatch),
water is tonal (tint), roads and fencing are strokes. Two hatched areas in
different colors produce crosshatch mud where they overlap, which is precisely
where the information matters most. Culture shares one ink and separates by
line weight and dash rhythm — roads solid, fencing dashed and lighter.

**Two dash rhythms are reliably distinguishable; three is not.** If paddock
fencing ever renders geometrically, some `fence_type` distinctions may belong in
the legend or the narrative rather than on the map.

**Ochre marks what the user placed**, ink marks what the tool sited. The map
should distinguish what it was told from what it worked out.

**Halo casing on every mark, not a color chosen to beat imagery.** No single
color wins against a surface ranging from dark canopy to bright bare ground.
Measured contrast on the reference property: `--field` fails against canopy,
pasture, and soil alike, and only separates over bright bare ground. The white
halo clears 4.4:1 on everything except bright bare ground, so the pair is
legible on any backdrop because one of the two always separates. **Dash length
must exceed casing width**, or a dashed line reads as a row of beads.

---

## Copy

Sentence case throughout. Active voice. A control names what happens when
it's used, and keeps that name through the whole flow.

### The hero — decided

> **Conceptual farm planning, in the order the land decides.**
>
> Trace your property. Keyline Designer reads LiDAR elevation, soil survey,
> and hydrography, then works the Scale of Permanence in order — climate
> through soil.

Headline in Bitter, subhead in Source Serif 4 at reading measure. Then the
address input, then the map edge. **Nothing between the subhead and the
input** — no third line of copy, no feature bullets. The headline is abstract
on its own and the subhead is what makes it concrete, so they travel together.

"Climate through soil" only lands if you already know those are the endpoints
of an eight-factor sequence. It rewards a second read and the section below
the tool pays it off — don't count on it carrying meaning above the fold.

**"AI enhanced" stays off the page**, and out of the hero especially. For this
audience it implies the output is generated rather than measured, when the
opposite is true: every geometric result comes from real LiDAR, SSURGO, and
NHD data, and the language model writes narrative around numbers the pipeline
computed. That belongs in the data section as a plain sentence about how the
report is written. "Data driven" is out for a milder version of the same
reason — "drawn from LiDAR" says it better and can't be said by anyone who
isn't doing it.

Errors say what happened and what to do, without apologizing and without
surfacing raw exception text. The current "Make sure api.py is running
locally (python3 api.py)" is developer-facing and needs replacing before
anyone else sees it.

Empty states are invitations, not apologies.

Numbers in prose follow the type rule above — measured values are mono even
mid-sentence.

---

## Quality floor

Not features; the baseline every branch is held to.

- `box-sizing: border-box` globally
- Visible `:focus-visible` on every interactive element
- `prefers-reduced-motion` respected
- Responsive to mobile, including the tool section
- No `<form>`-less inputs that swallow Enter

---

## Honest note on the palette

Warm cream, a serif display face, and a terracotta-adjacent accent is one of
the most common looks in circulation right now, and it appears on a great
many pages regardless of subject. Worth naming so the risk is deliberate
rather than accidental.

Three things make this specific rather than generic, and they're the parts to
protect if the design ever starts feeling templated:

1. **Mono tabular figures for measured values.** Drawn from survey
   instruments and technical bulletins, not from a landing-page convention.
   This is the signature.
2. **A slab serif, not a fashion display serif.** Bitter reads as technical
   bulletin. The high-contrast didones and editorial serifs common to the
   generic look read as brand.
3. **Oxide `#9c4a2f`, not terracotta.** Meaningfully darker and browner than
   the usual accent, and chosen for contrast against aerial imagery rather
   than for warmth.

The stock and rule colors came from the existing codebase — they were the
project's own instinct before this direction was written, which is part of
why the direction fits.

---

## Branch sequence

1. ~~**Foundation**~~ — **done**, merged at `aab1136`. Reset, `:root` tokens,
   self-hosted Bitter / Source Serif 4 / IBM Plex Mono. Resolved the duplicate
   `.page` rule, reordered the `main.jsx` imports so tokens exist at
   module-eval time, deleted ~60 lines of dead CSS, dropped `react-markdown`,
   renamed `.generate-button` to `.button`. Off-scale values were snapped to
   the token scale — "reference tokens only" is meaningless if one-off values
   survive alongside.
2. ~~**Page shell**~~ — **done**, merged. Nav, hero, contour background,
   five content sections, footer, document head. `svgr` for the inlined
   contour asset; `--text-3xl`, `--measure`, `--measure-wide`, `--page-gutter`
   added. Content in sections 4–7 is placeholder; hero copy is final.
3. ~~**Tool section**~~ — **done**, merged. Map presentation, panel, acreage
   chip with mono tabular figures, click-to-activate scroll, basemap switching.
   Absorbed three click-handler bugs: unbounded access-point snapping, a
   cos(latitude) projection error, and duplicate vertex placement.
4. ~~**The wait**~~ — **cancelled.** There is no wait to display once the
   pipeline is driven step by step. Each step returns in seconds and the report
   generates at the end from accreted context.
5. **Delivery** — transformed. The email handoff and the manual review gate
   were both artifacts of a five-to-ten minute blocking run. What remains is
   the final step of the wizard and whatever arrival moment it deserves.
6. **PDF** — WeasyPrint stylesheet inherits this system. **Untouched, and now
   the largest outstanding aesthetic work.** It also inherits the plate system
   above, which the layout map legend should express directly.

Foundation goes first because branch two creates many new components, and
they should be born into the token system rather than retrofitted onto it.

### Added by the interactive redesign

- **4A** — production zone fetch and render: off-parcel scrim, eligible
  highlight with a 1px feather, oxide hatch on suggestions, panel readout.
  Merged.
- **4B** — editing and cautions: select, draw, delete, live exclusion
  intersection with acreage captions. Merged as a proof of concept; its
  `App.jsx` state plumbing was always intended to be discarded.

**Logged from the 4B spike, not yet addressed:** overlap handling when a drawn
zone crosses a suggestion; one verb or two for suggested features; the caution
readout's inverted hierarchy (the cautions are subordinate to the label above
them when they are the important information); a total across cautions rather
than only line items; whether drawn and suggested zones should look identical
once committed.

---

## Deliberately undecided

- Exact type scale and vertical rhythm — set in branch one
- Contour linework source: generated from real terrain, or abstract
- Whether the report's on-page presence returns in any form, or the PDF
  remains the only output
- Email delivery mechanics
