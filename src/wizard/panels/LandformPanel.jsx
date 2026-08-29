/**
 * LandformPanel.jsx
 *
 * THE PRODUCTION-ZONE READOUT, on the session path.
 *
 * This is ProductionZonePanel.jsx migrated, not rewritten. The summary
 * figures, the standing unavailable-check caveat, the ranked zone list at
 * fixed decimal width, the `scales`-driven band names, the drawn-zone list
 * with its cautions and the ceiling advisory are all here with their rules
 * intact -- and every rule below is the one that was written against this
 * payload the first time.
 *
 * WHAT THE FRAME OWNS AND THIS DOES NOT. The loading state, the failed-layer
 * message, the error surfaces, the generate and commit buttons, the reopen
 * confirmation and the collapsed form all belong to StepPanel and are gone
 * from here -- the spike's panel carried them because there was no frame. A
 * Panel that starts reproducing them is the schema failing.
 *
 * WHAT CHANGED, AND IT IS ONE THING: WHERE THE DATA COMES FROM. `payload.data`
 * is `machine.proposals` -- what GET .../steps/landform/layers returned;
 * `deselectedIds` is the draft's selection read the other way round;
 * `drawnZones` are the draft's own features; `liveCautions` come from the
 * gesture in flight. Nothing here computes geometry.
 */

import { assertSuggestedZonesAreClean } from '../../zoneGeometry.js'
import { useWizardCursor } from '../WizardCursor.jsx'
import { useDrawingProgress } from '../../map/DrawingProgress.jsx'

// Which checks did not run, in the terms someone standing on the land would
// use -- never the layer's own name, and never "unavailable" on its own.
//
// Keyed on the payload's STABLE `type`, never on its `label`. The backend
// splits those two fields precisely so a consumer branching on identity is not
// broken by a copy edit to the display prose (see exclusion_zones._wire_
// layers()), and the labels there describe the TEST ("wet (hydric) soil")
// where this has to describe the CONSEQUENCE.
const UNAVAILABLE_CONSEQUENCE = {
  hydric: 'Soil survey data was unavailable, so wet ground has not been excluded.',
  roads: 'Road data was unavailable, so existing farm roads have not been excluded.',
  canopy: 'Canopy data was unavailable, so wooded ground has not been excluded.',
  slope: 'Elevation data was unavailable, so steep ground has not been excluded.',
  setback: 'The boundary setback was not applied.',
}

// Decimal places every measured figure is printed to.
//
// MIRRORS THE PIPELINE'S OWN ROUNDING BOUNDARY, it does not invent one:
// production_area_ceiling._round1() puts every acreage, score, factor and
// slope figure in this payload at one decimal place before it is serialised.
//
// Printing them back at that same fixed width is what makes a column of them
// align, and it has to be done explicitly. JSON has no decimal type, so a
// score the backend rounded to 100.0 is parsed by JavaScript as the number
// 100 and renders as "100" -- one character narrower than "62.5", with no
// decimal point to line up. Measured on a list spanning 0.9 to 1234.5 acres
// and 7.0 to 100.0 score: without this, two of the four numeric columns
// drifted.
const MEASURE_DP = 1

// Past this share of the parcel, the panel says so. ADVISORY ONLY, never
// blocking: the 80% figure was always a design judgment about leaving room for
// water, roads and trees, and having handed that judgment to the user -- the
// same reasoning that made the parcel boundary the only hard gate -- taking it
// back at the gate would be incoherent. It is the same number the backend's
// own ceiling trims toward, named here so the two cannot drift apart silently.
const CEILING_ADVISORY_PCT = 80

/**
 * A measured value at fixed width, or an em dash where the pipeline sent
 * null. null means "not known" throughout this contract and must never be
 * printed as a 0.0 that reads as a measurement.
 */
function measure(value) {
  return value == null ? '—' : Number(value).toFixed(MEASURE_DP)
}

/**
 * The band name for a score, read out of the payload's own `scales` object.
 *
 * NO THRESHOLD IS WRITTEN DOWN HERE. The backend ships `bands` and
 * `band_bounds` so the frontend does not have to know that 60-79 is "good",
 * and a copy of those numbers on this side is a second source of truth that
 * goes stale silently the first time the backend retunes them.
 *
 * `band_bounds` is honoured rather than assumed: the contract's value is
 * lower-inclusive / upper-exclusive with the last band closed at the top, so
 * a perfect 100 lands in the top band instead of falling out of every one.
 */
export function scoreBandName(score, scales) {
  if (score == null || !scales?.bands) return null

  const bands = Object.entries(scales.bands)
    .map(([name, [low, high]]) => ({ name, low, high }))
    .sort((a, b) => a.low - b.low)

  const lastBandClosed =
    scales.band_bounds === 'lower_inclusive_upper_exclusive_last_band_inclusive'

  for (let i = 0; i < bands.length; i++) {
    const { name, low, high } = bands[i]
    const isLast = i === bands.length - 1
    if (score < low) continue
    if (score < high) return name
    if (isLast && lastBandClosed && score <= high) return name
  }

  return null
}

/**
 * One caution line: the acreage, then the layer's own label verbatim.
 *
 * A sub-floor intersection never reaches here -- cautionsFor() drops it, and
 * with it the map marker, so the two stay consistent. See CAUTION_MIN_ACRES
 * for the reasoning and for what that silence costs.
 */
function CautionLine({ caution }) {
  return (
    <li className="caution-line">
      <span className="caution-line__value">{measure(caution.acres)}</span>
      <span className="caution-line__label">acres — {caution.label}</span>
    </li>
  )
}

/**
 * The running totals a commit would carry.
 *
 * NOT THE PAYLOAD'S OWN FIGURES. What is SELECTED changes as suggestions are
 * toggled and zones are drawn, so the numbers have to be recomputed from the
 * current selection rather than read off the recommendation the backend sent.
 * `eligible_acres` is the exception -- it describes the ground, not the choice.
 *
 * Exported so the test can assert the arithmetic without a map.
 */
export function totalsFor(payload, selectedIds, drawnFeatures) {
  const rows = payload?.zones ?? []
  const parcelAcres = payload?.summary?.total_acres ?? 0

  const selectedAcres = rows
    .filter((zone) => selectedIds.has(zone.feature_id))
    .reduce((sum, zone) => sum + (zone.area_acres ?? 0), 0)
  const drawnAcres = drawnFeatures.reduce(
    (sum, feature) => sum + (feature.properties?.acres ?? 0),
    0
  )
  const total = selectedAcres + drawnAcres

  return {
    selectedAcres: total,
    pctOfParcel: parcelAcres > 0 ? (total / parcelAcres) * 100 : null,
    zoneCount: rows.filter((zone) => selectedIds.has(zone.feature_id)).length + drawnFeatures.length,
  }
}

export default function LandformPanel({ machine }) {
  const { proposals, draft, rejections, stepId, actions } = machine
  const { armed, arm, disarm } = useWizardCursor()
  const { points: drawingPoints, cautions: liveCautions, notice } = useDrawingProgress()

  if (!proposals) return null

  const { summary, zones, scales, exclusion_layers: exclusionLayers } = proposals

  // A suggested zone is a strict subset of ground that already cleared every
  // gate -- it is a morphological opening of a cell union -- so it cannot
  // cross an exclusion. Verified empty across both reference fixtures;
  // asserted here so a pipeline regression surfaces as a loud failure rather
  // than as a caution nobody can explain.
  //
  // IT MOVED WITH THE PAYLOAD IT IS ABOUT. This ran in App.jsx while the spike
  // held the payload; it runs where the payload is read now, which is the only
  // place it could have gone without something else learning what a suggested
  // zone is.
  if (import.meta.env.DEV && proposals.suggested_zones?.features?.length) {
    assertSuggestedZonesAreClean(proposals.suggested_zones.features, exclusionLayers ?? [])
  }
  const selectedIds = new Set(draft.selectedFeatureIds)
  const drawnFeatures = draft.drawnFeatures
  const totals = totalsFor(proposals, selectedIds, drawnFeatures)
  const isDrawingZone = armed === 'draw'

  // Every check that did not run, as a standing line rather than a footnote.
  // It stays on screen the whole time this step is open, because it changes
  // what the highlight MEANS: ground that was never tested is drawn exactly
  // like ground that passed.
  const unavailable = (exclusionLayers ?? [])
    .filter((layer) => !layer.data_available)
    .map((layer) => UNAVAILABLE_CONSEQUENCE[layer.type] ?? `${layer.label} was unavailable.`)

  return (
    <div className="zone-readout">
      <div className="zone-summary">
        <span className="zone-summary__value" data-testid="landform-selected-acres">
          {measure(totals.selectedAcres)}
        </span>
        <span className="zone-summary__label">acres selected</span>

        <span className="zone-summary__value">{measure(summary?.eligible_acres)}</span>
        <span className="zone-summary__label">acres eligible</span>

        <span className="zone-summary__value">{measure(totals.pctOfParcel)}</span>
        <span className="zone-summary__label">% of parcel</span>

        <span className="zone-summary__value" data-testid="landform-zone-count">
          {totals.zoneCount}
        </span>
        <span className="zone-summary__label">
          zone{totals.zoneCount === 1 ? '' : 's'}
        </span>
      </div>

      {unavailable.length > 0 && (
        <div className="zone-caveat" role="status" data-testid="landform-caveat">
          {unavailable.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="zone-caveat__action">Walk those areas before committing to them.</p>
        </div>
      )}

      {zones.length === 0 ? (
        <p className="status-ready" data-testid="landform-empty">
          No ground on this parcel clears every check. The highlight shows what
          is eligible; nothing in it is large or gentle enough to suggest.
        </p>
      ) : (
        /* The whole list is ONE grid and each row is display: contents, so
           every row's figures share the same tracks. A grid per row would
           size its tracks independently and the decimals would drift from
           row to row -- the exact failure the acreage chip documents. */
        <ol className="zone-list">
          <li className="zone-list__head">
            <span>#</span>
            <span>acres</span>
            <span>score</span>
            <span className="zone-list__head-span">slope %</span>
          </li>
          {zones.map((zone) => {
            const band = scoreBandName(zone.score, scales)
            // The row's OWN wire id, carried by the payload. Selection is
            // tracked by feature id (the map filters on feature.id), and this
            // row used to rebuild that id with a template literal -- one
            // identity with two sources of truth, joined by a format string
            // nothing checks. `zone.id` is still the list key; only the JOIN
            // is a carried value.
            const selected = selectedIds.has(zone.feature_id)
            const rejection = rejections[zone.feature_id] ?? null
            return (
              <li
                key={zone.id}
                data-testid={`landform-row-${zone.feature_id}`}
                className={
                  selected ? 'zone-list__row' : 'zone-list__row zone-list__row--off'
                }
              >
                {/* THE ROW IS THE TOGGLE. The map's select tool and this are
                    one action with two affordances, both dispatching the same
                    thing, rather than two paths that have to agree. */}
                <button
                  type="button"
                  className="zone-list__toggle"
                  aria-pressed={selected}
                  data-testid={`landform-toggle-${zone.feature_id}`}
                  onClick={() => actions.toggleSelection(stepId, zone.feature_id)}
                >
                  <span className="zone-list__value">{zone.rank}</span>
                  <span className="zone-list__value">{measure(zone.area_acres)}</span>
                  <span className="zone-list__value">{measure(zone.score)}</span>
                  {/* The range is TWO columns with the dash between them, not
                      one cell holding "5.7-19.8". A range has two decimal
                      points and a single cell can only ever align one of
                      them; split, both ends line up down the list. */}
                  <span className="zone-list__value">{measure(zone.slope_min_pct)}</span>
                  <span className="zone-list__dash" aria-hidden="true">–</span>
                  <span className="zone-list__value">{measure(zone.slope_max_pct)}</span>
                  <span className="zone-list__note">
                    {selected ? '' : 'not selected · '}
                    {band}
                    {/* aspect_available false means the ground is too flat for
                        a well-defined downhill direction, and the pipeline's
                        aspect figure is then a neutral default rather than a
                        measurement. Printing it would state a fact about the
                        land that was never measured, so nothing is printed. */}
                    {zone.aspect_available && zone.dominant_aspect
                      ? ` · ${zone.dominant_aspect}-facing`
                      : ''}
                  </span>
                </button>
                {rejection ? (
                  <span
                    className="zone-list__rejection"
                    data-testid={`rejection-${zone.feature_id}`}
                  >
                    {rejection.reason}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {/* Drawn zones: listed separately from suggestions because the two carry
          different verbs. A suggestion is DESELECTED and stays on the map; a
          drawn zone is DELETED and does not. Keeping each verb attached to one
          kind of object is what stops "removed" meaning two things. */}
      {drawnFeatures.length > 0 && (
        <ol className="drawn-list">
          {drawnFeatures.map((feature, index) => {
            const rejection = rejections[feature.id] ?? null
            return (
              <li
                key={feature.id}
                className="drawn-list__row"
                data-testid={`landform-drawn-${feature.id}`}
              >
                <span className="drawn-list__value">{measure(feature.properties?.acres)}</span>
                <span className="drawn-list__label">acres — zone {index + 1} you drew</span>
                <button
                  className="button button--quiet"
                  data-testid={`landform-delete-${feature.id}`}
                  onClick={() => actions.removeDrawnFeature(stepId, feature.id)}
                >
                  Delete
                </button>
                {(feature.properties?.cautions ?? []).length > 0 && (
                  <ul className="caution-list">
                    {feature.properties.cautions.map((caution) => (
                      <CautionLine key={caution.type} caution={caution} />
                    ))}
                  </ul>
                )}
                {rejection ? (
                  <span className="zone-list__rejection" data-testid={`rejection-${feature.id}`}>
                    {rejection.reason}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}

      {/* The in-progress polygon's own cautions, recomputed on each vertex
          placed once there are three. Not on mousemove -- this tool places
          points on click and there is no rubber band to follow. */}
      {isDrawingZone && (
        <div className="drawing-state">
          <p className="status-ready">
            Click to place each corner. Click the first corner again to close.
          </p>
          {liveCautions.length > 0 && (
            <ul className="caution-list caution-list--live">
              {liveCautions.map((caution) => (
                <CautionLine key={caution.type} caution={caution} />
              ))}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <p className="clamp-notice" data-testid="landform-notice">
          {notice}
        </p>
      )}

      {totals.pctOfParcel > CEILING_ADVISORY_PCT && (
        <p className="ceiling-advisory">
          Selecting this much leaves little room for water, roads, and trees.
        </p>
      )}

      <div className="button-row">
        {isDrawingZone ? (
          <button
            className="button button--secondary"
            data-testid="landform-cancel-draw"
            onClick={disarm}
          >
            Cancel
          </button>
        ) : (
          <button className="button" data-testid="landform-draw" onClick={() => arm('draw')}>
            Draw a Zone
          </button>
        )}
        {/* THE DELETE VERB, ARMED FROM THE PANEL as well as offered per row.
            The map's delete tool is the same slot; a shape is easier to hit on
            the map than to find in a list when there are several. */}
        {drawnFeatures.length > 0 && !isDrawingZone ? (
          <button
            className="button button--secondary"
            data-testid="landform-delete-mode"
            aria-pressed={armed === 'delete'}
            onClick={() => (armed === 'delete' ? disarm() : arm('delete'))}
          >
            {armed === 'delete' ? 'Done deleting' : 'Delete a zone'}
          </button>
        ) : null}
      </div>
      {/* The in-flight vertex count, so the panel says something is happening
          while the map is where the work is. */}
      {isDrawingZone && drawingPoints.length > 0 ? (
        <p className="status-ready" data-testid="landform-vertex-count">
          <span className="measure">{drawingPoints.length}</span> point
          {drawingPoints.length === 1 ? '' : 's'} placed
          {drawingPoints.length < 3 ? ' — need at least 3 to close' : ''}.
        </p>
      ) : null}
    </div>
  )
}
