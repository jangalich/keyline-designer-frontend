# Assets

## `contour-background.svg`

Elevation contour linework for the marketing page background. Generated
once, by hand, from USGS 3DEP elevation — not fetched at build time and not
produced by the app.

| | |
| --- | --- |
| Extent | −79.99781 / 40.63363 to −79.97257 / 40.65688 (WGS84) |
| Ground size | 2104.3 × 2605.5 m, UTM 17N (EPSG:32617) |
| Source | USGS 3DEP via `dem_data.get_dem_for_boundary()`, 5 m grid |
| Interval | 40 ft (12.192 m) |
| Simplification | Douglas–Peucker, 5 m tolerance |
| Contour lines | 47 |

The `viewBox` is the projected extent in metres, so one user unit is one
ground metre and the aspect ratio is the terrain's own. `preserveAspectRatio`
is `xMidYMid slice`, which is `background-size: cover` in SVG's terms.

### Styling

The file carries no colour and no stroke width — both are the stylesheet's
to set, against `src/index.css` tokens:

```css
color: var(--ink-muted);   /* #8a8477 — stroke="currentColor" resolves to this */
opacity: 0.2;              /* chosen against this interval's line density */
```

```css
/* On the path. Without this, one user unit is one ground METRE, so line
   weight would scale with the viewport and the opacity above — picked at a
   specific weight — would not hold across screen sizes. */
stroke-width: 1px;
vector-effect: non-scaling-stroke;
```

Mount it as inline SVG, not `background-image` or `<img>`: `currentColor`
does not resolve in an external SVG context.

### Regenerating

Two scripts in the backend repo (`jangalich/keyline-designer`), split so the
network boundary is visible:

```
python3 scripts/fetch_contour_dem.py            # needs network; writes a local GeoTIFF
python3 scripts/generate_contour_background.py  # fully offline; writes the SVG
```

The generator emits 10/20/40 ft at several tolerances plus previews at real
background conditions. 40 ft at 5 m was chosen by looking at those previews;
the intermediate files are not committed.

## `report/` — sample pages for the "The report" section

Three pages of a real report, rendered once from the PDF and committed. Not
regenerated at build time and not produced by the app.

| | |
| --- | --- |
| Source | `site-data-report__6_.pdf`, 25 pages, generated 30 September 2026 for the author's own property in Allegheny County, Pennsylvania, with every data source answering |
| Pages | 3 (II · Climate), 11 (IV · Water & hydrology, continued), 19 (VIII · Design: the layout) |
| Full render | 1275 × 1650 px — 150 dpi of a US Letter page |
| Thumbnail | 480 × 621 px, Lanczos from the full render |
| Renderer | PyMuPDF (MuPDF 1.28), RGB, no alpha |
| Footers | Painted out before rendering (see below) |

**Use that file; do not regenerate the report to refresh these.** Earlier
renders had failed sources showing "Unavailable" in the figures.

### Encoding

WebP throughout. The two line-art pages are smaller lossless than lossy at
any quality that keeps their type crisp; the photograph page is lossy.

| File | Encoding | Size |
| --- | --- | ---: |
| `page-03-climate.webp` | lossless | 58 KB |
| `page-11-water.webp` | lossless | 87 KB |
| `page-19-layout.webp` | lossy, q90 | 244 KB |
| `page-03-climate-thumb.webp` | lossy, q85 | 16 KB |
| `page-11-water-thumb.webp` | lossy, q85 | 29 KB |
| `page-19-layout-thumb.webp` | lossy, q85 | 36 KB |

Only the thumbnails load with the section (82 KB, lazily); a full page loads
when it is maximised.

### Why these three

They show different things, which matters more than three good-looking
pages: a chart, a dense data page, and the photographic deliverable. Three
table pages would argue much less. See `src/ReportSamples.jsx`.

### Regenerating

```python
import pymupdf
from PIL import Image
doc = pymupdf.open('site-data-report__6_.pdf')
for n, name, kw in [(3, 'climate', dict(lossless=True)), (11, 'water', dict(lossless=True)), (19, 'layout', dict(quality=90))]:
    page = doc[n - 1]
    # The footer band, painted out: see below. White, as the page is.
    page.add_redact_annot(pymupdf.Rect(0, 726, 612, 754), fill=(1, 1, 1))
    page.apply_redactions()
    z = 1275 / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False, colorspace=pymupdf.csRGB)
    full = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    full.save(f'page-{n:02d}-{name}.webp', 'WEBP', method=6, **kw)
    full.resize((480, 621), Image.LANCZOS).save(f'page-{n:02d}-{name}-thumb.webp', 'WEBP', quality=85, method=6)
```

### The footers

Each page's footer in the PDF carries the parcel's centroid coordinates,
because the frontend sends no property label. That is locatable, so the
footer band (coordinates, page number and date, at y 726–754 pt on a white
page with nothing else below 700 pt) is redacted before rendering. The page
number the maximised view's title gives comes from `SAMPLE_PAGES`, not from
the image.
