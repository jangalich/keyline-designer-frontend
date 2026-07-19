import { GeoJSON } from 'react-leaflet'
import L from 'leaflet'
import { LAYER_GROUPS, featuresForGroup } from './mapLayerConfig'

// Shown in every feature popup regardless of layer — either redundant
// with the popup heading/layer line, or too unwieldy (nested arrays) to
// print as a simple key/value row.
const HIDDEN_PROPERTY_KEYS = new Set(['layer', 'label'])

function titleCaseKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatPropertyValue(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    if (typeof value[0] === 'object') return `${value.length} item(s)`
    return value.join(', ')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Built as real DOM nodes (via textContent, not innerHTML) rather than an
// HTML string, so nothing in properties — all of it either public survey
// data or backend-derived text, but still not worth trusting blindly —
// can inject markup into the popup.
function buildFeaturePopupContent(feature, groupLabel) {
  const props = feature.properties || {}

  const container = document.createElement('div')
  container.className = 'feature-popup'

  const heading = document.createElement('h4')
  heading.textContent = props.label || groupLabel
  container.appendChild(heading)

  const layerLine = document.createElement('div')
  layerLine.className = 'feature-popup-layer'
  layerLine.textContent = groupLabel
  container.appendChild(layerLine)

  const table = document.createElement('table')
  Object.entries(props)
    .filter(([key]) => !HIDDEN_PROPERTY_KEYS.has(key))
    .forEach(([key, value]) => {
      const row = document.createElement('tr')

      const th = document.createElement('th')
      th.textContent = titleCaseKey(key)

      const td = document.createElement('td')
      td.textContent = formatPropertyValue(value)

      row.appendChild(th)
      row.appendChild(td)
      table.appendChild(row)
    })
  container.appendChild(table)

  return container
}

function styleForGroup(group) {
  if (group.shape === 'line') {
    return { color: group.color, weight: 3, opacity: 0.9 }
  }
  return { color: group.color, weight: 2, fillColor: group.color, fillOpacity: 0.25 }
}

function pointToLayerForGroup(group) {
  return (_feature, latlng) =>
    L.circleMarker(latlng, {
      radius: 6,
      color: group.color,
      fillColor: group.color,
      fillOpacity: 0.6,
    })
}

/**
 * MapLayers
 *
 * Renders every backend GeoJSON layer that's currently toggled on in the
 * legend. `layersVersion` exists only to force a clean remount whenever a
 * new report is generated — react-leaflet's <GeoJSON> creates its
 * underlying Leaflet layer once from the `data` prop at mount time and
 * doesn't re-diff new data into an existing layer, so reusing the same
 * key across report regenerations would silently keep showing stale
 * geometry.
 */
function MapLayers({ layers, visibleGroupKeys, layersVersion }) {
  if (!layers) return null

  return (
    <>
      {LAYER_GROUPS.filter((group) => visibleGroupKeys.has(group.key)).map((group) => {
        const features = featuresForGroup(layers, group)
        if (features.length === 0) return null

        return (
          <GeoJSON
            key={`${group.key}-${layersVersion}`}
            data={{ type: 'FeatureCollection', features }}
            style={() => styleForGroup(group)}
            pointToLayer={pointToLayerForGroup(group)}
            onEachFeature={(feature, layer) => {
              layer.bindPopup(buildFeaturePopupContent(feature, group.label))
            }}
          />
        )
      })}
    </>
  )
}

export default MapLayers
