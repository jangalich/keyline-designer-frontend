import { LAYER_GROUPS, featuresForGroup, BASEMAPS } from './mapLayerConfig'

/**
 * LayerLegend
 *
 * Overlay control combining two toggles in one panel rather than a
 * separate Leaflet LayersControl: which basemap tile service to show
 * (always available, since the basemap renders whether or not a report
 * has been generated yet), and which of the current report's GeoJSON
 * layer groups are visible (only shown once a report with data exists —
 * groups with zero features aren't listed, since there's no point
 * offering a toggle for a layer that can't render anything). Each layer
 * row is a checkbox plus a swatch matching that group's map style, so
 * the legend doubles as the color key.
 */
function LayerLegend({ layers, visibleGroupKeys, onToggleGroup, basemapKey, onSelectBasemap }) {
  const groupsWithData = layers
    ? LAYER_GROUPS.filter((group) => featuresForGroup(layers, group).length > 0)
    : []

  return (
    <div className="layer-legend">
      <div className="layer-legend-title">Basemap</div>
      {BASEMAPS.map((basemap) => (
        <label key={basemap.key} className="layer-legend-row">
          <input
            type="radio"
            name="basemap"
            checked={basemapKey === basemap.key}
            onChange={() => onSelectBasemap(basemap.key)}
          />
          <span className="layer-legend-label">{basemap.label}</span>
        </label>
      ))}

      {groupsWithData.length > 0 && (
        <>
          <div className="layer-legend-title layer-legend-title-spaced">Map Layers</div>
          {groupsWithData.map((group) => (
            <label key={group.key} className="layer-legend-row">
              <input
                type="checkbox"
                checked={visibleGroupKeys.has(group.key)}
                onChange={() => onToggleGroup(group.key)}
              />
              <span
                className={`layer-legend-swatch layer-legend-swatch-${group.shape}`}
                style={{ '--swatch-color': group.color }}
              />
              <span className="layer-legend-label">{group.label}</span>
            </label>
          ))}
        </>
      )}
    </div>
  )
}

export default LayerLegend
