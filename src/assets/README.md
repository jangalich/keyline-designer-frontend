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
