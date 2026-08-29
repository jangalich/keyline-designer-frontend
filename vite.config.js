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

  // Vitest, configured here rather than in a vitest.config.js of its own so
  // the tests build through the SAME plugin pipeline the app does. A second
  // config file would be a second answer to "how is this JSX compiled", and
  // the day they diverge the tests stop testing the shipped code.
  //
  // jsdom because the session store reads window.location and localStorage for
  // the session id, and renders a provider. Nothing else in here needs a DOM.
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
