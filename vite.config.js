import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

// svgr turns an .svg import into a React component, which is the only way the
// contour background can work: it uses stroke="currentColor", and currentColor
// resolves against the *document's* colour only when the SVG is inline in the
// DOM. As a background-image or an <img src>, the SVG is a separate document
// with no inherited colour, and the linework renders black or not at all.
//
// The alternative — pasting 19KB of path data into JSX — would duplicate
// src/assets/contour-background.svg and leave two copies to drift apart.
export default defineConfig({
  plugins: [react(), svgr()],
})
