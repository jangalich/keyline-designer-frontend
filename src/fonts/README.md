# Fonts

Self-hosted so the app makes no request to `fonts.googleapis.com` or
`fonts.gstatic.com`. Declared via `@font-face` in `src/index.css`; Vite
fingerprints and bundles them from here. Do not move these to `public/`.

The PDF report (`generate_pdf_report.py`, WeasyPrint) will need the same
files, so keep this directory flat and the licenses beside the fonts.

| File | Family | Axis / weight | Subset |
| --- | --- | --- | --- |
| `bitter-latin-wght-normal.woff2` | Bitter | variable, `wght` 100–900 | latin |
| `source-serif-4-latin-wght-normal.woff2` | Source Serif 4 | variable, `wght` 200–900 | latin |
| `ibm-plex-mono-latin-400-normal.woff2` | IBM Plex Mono | static, 400 | latin |
| `ibm-plex-mono-latin-500-normal.woff2` | IBM Plex Mono | static, 500 | latin |

Bitter and Source Serif 4 ship a variable `woff2`, so one file per family
covers both the weights we use (400 and 600) and leaves the axis available
without another download. IBM Plex Mono has no variable build, hence two
static files.

All three families are SIL Open Font License 1.1. Licenses are alongside:
`Bitter-OFL.txt`, `SourceSerif4-OFL.txt`, `IBMPlexMono-OFL.txt`.

Extracted from the Fontsource npm packages at v5.3.0
(`@fontsource-variable/bitter`, `@fontsource-variable/source-serif-4`,
`@fontsource/ibm-plex-mono`). The packages are not project dependencies —
only these files were kept.
