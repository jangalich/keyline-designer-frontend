/**
 * ProductionZonePanel
 *
 * The panel half of the production-zone step: the summary figures, the ranked
 * zone list, the standing notice about checks that did not run, and the two
 * states that are not a readout — waiting, and an upstream layer having
 * failed.
 *
 * Kept out of App.jsx's own chain of inline branches because it is three
 * states of one step rather than three more states of the panel, and because
 * every rule below about what may and may not be rendered lives with the
 * markup it governs.
 */

// Which checks did not run, in the terms someone standing on the land would
// use — never the layer's own name, and never "unavailable" on its own.
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
// water, roads and trees, and having handed that judgment to the user — the
// same reasoning that made the parcel boundary the only hard gate — taking it
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
 * `band_bounds` so the frontend does not have to know that 60–79 is "good",
 * and a copy of those numbers on this side is a second source of truth that
 * goes stale silently the first time the backend retunes them.
 *
 * `band_bounds` is honoured rather than assumed: the contract's value is
 * lower-inclusive / upper-exclusive with the last band closed at the top, so
 * a perfect 100 lands in the top band instead of falling out of every one.
 */
function scoreBandName(score, scales) {
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
 * A sub-floor intersection never reaches here — cautionsFor() drops it, and
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

function ProductionZonePanel({
  payload,
  isLoading,
  error,
  onRetry,
  onBack,
  deselectedIds,
  drawnZones,
  liveCautions,
  totals,
  isDrawingZone,
  onStartDrawZone,
  onCancelDrawZone,
  onDeleteDrawnZone,
  clampNotice,
}) {
  if (isLoading) {
    return (
      <p className="status-loading">
        Reading elevation, canopy, soil, and road data for the boundary, then
        working out where else this land could be farmed. This takes about
        30-60 seconds.
      </p>
    )
  }

  if (error) {
    // Names the layer, places the fault upstream, and offers the one action
    // that can help. No status code and no exception text — the backend sends
    // a stable layer identity precisely so this does not have to quote a
    // traceback at someone looking at their own field.
    return (
      <div className="zone-error">
        <p className="status-error">
          {error.layerLabel
            ? `The ${error.layerLabel} source did not respond.`
            : 'The data sources did not respond.'}
        </p>
        <p className="zone-error__detail">
          These are public datasets that go down from time to time. Nothing is
          wrong with your boundary and it has been kept exactly as you drew it.
          Try again in a moment.
        </p>
        <div className="button-row">
          <button className="button button--secondary" onClick={onBack}>
            Back
          </button>
          <button className="button" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!payload) return null

  const { summary, zones, scales, exclusion_layers: exclusionLayers } = payload.data

  // Every check that did not run, as a standing line rather than a footnote.
  // It stays on screen the whole time this step is open, because it changes
  // what the highlight MEANS: ground that was never tested is drawn exactly
  // like ground that passed.
  const unavailable = (exclusionLayers ?? [])
    .filter((layer) => !layer.data_available)
    .map((layer) => UNAVAILABLE_CONSEQUENCE[layer.type] ?? `${layer.label} was unavailable.`)

  return (
    <div className="zone-readout">
      {/* Running totals, not the payload's own figures. What is SELECTED
          changes as suggestions are toggled and zones are drawn, so the
          numbers have to be recomputed from the current selection rather than
          read off the recommendation the backend sent. eligible_acres is the
          exception — it describes the ground, not the choice. */}
      <div className="zone-summary">
        <span className="zone-summary__value">{measure(totals.selectedAcres)}</span>
        <span className="zone-summary__label">acres selected</span>

        <span className="zone-summary__value">{measure(summary.eligible_acres)}</span>
        <span className="zone-summary__label">acres eligible</span>

        <span className="zone-summary__value">{measure(totals.pctOfParcel)}</span>
        <span className="zone-summary__label">% of parcel</span>

        <span className="zone-summary__value">{totals.zoneCount}</span>
        <span className="zone-summary__label">
          zone{totals.zoneCount === 1 ? '' : 's'}
        </span>
      </div>

      {unavailable.length > 0 && (
        <div className="zone-caveat" role="status">
          {unavailable.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="zone-caveat__action">
            Walk those areas before committing to them.
          </p>
        </div>
      )}

      {zones.length === 0 ? (
        <p className="status-ready">
          No ground on this parcel clears every check. The highlight shows what
          is eligible; nothing in it is large or gentle enough to suggest.
        </p>
      ) : (
        <>
          {/* The whole list is ONE grid and each row is display: contents, so
              every row's figures share the same tracks. A grid per row would
              size its tracks independently and the decimals would drift from
              row to row — the exact failure the acreage chip documents. Same
              minmax(Nch, max-content) sizing as the chip, for the same two
              reasons: the ch floor holds the decimal point still, and the
              max-content ceiling lets an over-long value push its neighbour
              right instead of printing over it. */}
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
              // tracked by feature id (ProductionZoneLayers filters the map on
              // feature.id), and this row used to rebuild that id with a
              // template literal -- one identity with two sources of truth,
              // joined by a format string nothing checks. Renaming the backend's
              // prefix would have broken selection silently: rows would simply
              // stop matching, with no error anywhere. `zone.id` is still the
              // list key; only the JOIN moved to a carried value.
              const deselected = deselectedIds.has(zone.feature_id)
              return (
                <li
                  key={zone.id}
                  className={
                    deselected ? 'zone-list__row zone-list__row--off' : 'zone-list__row'
                  }
                >
                  <span className="zone-list__value">{zone.rank}</span>
                  <span className="zone-list__value">{measure(zone.area_acres)}</span>
                  <span className="zone-list__value">{measure(zone.score)}</span>
                  {/* The range is TWO columns with the dash between them, not
                      one cell holding "5.7–19.8". A range has two decimal
                      points and a single cell can only ever align one of
                      them; split, both ends line up down the list. */}
                  <span className="zone-list__value">{measure(zone.slope_min_pct)}</span>
                  <span className="zone-list__dash" aria-hidden="true">–</span>
                  <span className="zone-list__value">{measure(zone.slope_max_pct)}</span>
                  <span className="zone-list__note">
                    {deselected ? 'not selected · ' : ''}
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
                </li>
              )
            })}
          </ol>
        </>
      )}

      {/* Drawn zones: listed separately from suggestions because the two carry
          different verbs. A suggestion is DESELECTED and stays on the map; a
          drawn zone is DELETED and does not. Keeping each verb attached to one
          kind of object is what stops "removed" meaning two things. */}
      {drawnZones.length > 0 && (
        <ol className="drawn-list">
          {drawnZones.map((zone, index) => (
            <li key={zone.id} className="drawn-list__row">
              <span className="drawn-list__value">{measure(zone.acres)}</span>
              <span className="drawn-list__label">
                acres — zone {index + 1} you drew
              </span>
              <button
                className="button button--quiet"
                onClick={() => onDeleteDrawnZone(zone.id)}
              >
                Delete
              </button>
              {zone.cautions.length > 0 && (
                <ul className="caution-list">
                  {zone.cautions.map((caution) => (
                    <CautionLine key={caution.type} caution={caution} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* The in-progress polygon's own cautions, recomputed on each vertex
          placed once there are three. Not on mousemove — this tool places
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

      {clampNotice && <p className="clamp-notice">{clampNotice}</p>}

      {totals.pctOfParcel > CEILING_ADVISORY_PCT && (
        <p className="ceiling-advisory">
          Selecting this much leaves little room for water, roads, and trees.
        </p>
      )}

      <div className="button-row">
        <button className="button button--secondary" onClick={onBack}>
          Back
        </button>
        {isDrawingZone ? (
          <button className="button button--secondary" onClick={onCancelDrawZone}>
            Cancel
          </button>
        ) : (
          <button className="button" onClick={onStartDrawZone}>
            Draw a Zone
          </button>
        )}
      </div>
    </div>
  )
}

export default ProductionZonePanel
