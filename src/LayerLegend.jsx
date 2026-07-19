import { LAYER_GROUPS, featuresForGroup } from './mapLayerConfig'

/**
 * LayerLegend
 *
 * Overlay control listing every layer group that actually has features in
 * this report's data (groups with zero features aren't shown — no point
 * offering a toggle for a layer that can't render anything). Each row is
 * a checkbox plus a swatch matching that group's map style, so the legend
 * doubles as the color key.
 */
function LayerLegend({ layers, visibleGroupKeys, onToggleGroup }) {
  if (!layers) return null

  const groupsWithData = LAYER_GROUPS.filter(
    (group) => featuresForGroup(layers, group).length > 0
  )

  if (groupsWithData.length === 0) return null

  return (
    <div className="layer-legend">
      <div className="layer-legend-title">Map Layers</div>
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
    </div>
  )
}

export default LayerLegend
