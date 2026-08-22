import { polygonAreaAcres } from './geo.js'

/**
 * AcreageChip
 *
 * Live readout over the map's top-left: how many points are placed, and once
 * there are three, the running area of the shape they enclose.
 *
 * This does real work beyond decoration. The tool is built for roughly a few
 * acres up to thirty, and the difference between a 20-acre boundary and a
 * 400-acre one is not obvious from a traced outline at an unfamiliar zoom.
 * Showing the number as it changes means an out-of-range shape is visibly
 * wrong while it is being drawn, rather than after the generate button.
 *
 * Computed client-side from the current points (see geo.js) — it has to be
 * instant, and it is a guide rather than the figure the report is built
 * from; the backend recomputes area properly in UTM.
 *
 * pointer-events are off in CSS: this sits over the map surface and must
 * never be the thing that swallows a click meant for the map underneath.
 */
function AcreageChip({ points, visible }) {
  if (!visible) return null

  const acres = polygonAreaAcres(points)

  // Value and label spans are emitted flat rather than wrapped per row, so
  // they are direct children of the chip's two-column grid — that is what
  // makes the two values share one fixed-width column and line up as a
  // column of figures rather than as two independent rows.
  return (
    <div className="map-chip" aria-live="polite">
      <span className="map-chip__value">{points.length}</span>
      <span className="map-chip__label">{points.length === 1 ? 'point' : 'points'}</span>

      {points.length >= 3 && (
        <>
          <span className="map-chip__value">{acres.toFixed(1)}</span>
          <span className="map-chip__label">acres</span>
        </>
      )}
    </div>
  )
}

export default AcreageChip
