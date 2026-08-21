import React from 'react'
import ReactDOM from 'react-dom/client'

// index.css before App.jsx, deliberately. It carries the global reset and the
// token definitions, and both need to be in the document before any component
// stylesheet or component module is evaluated:
//
//   - Cascade order. Component rules in App.css should win over the reset at
//     equal specificity, which means the reset has to land first. The other
//     way round is what let a leftover .page rule in index.css silently wrap
//     the whole application in a 640px column.
//   - Token availability. Anything reading a custom property out of the
//     document at module-evaluation time (Leaflet takes plain JS colour
//     values, so DrawTool has to) reads an empty string if :root has not been
//     applied yet.
import './index.css'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
