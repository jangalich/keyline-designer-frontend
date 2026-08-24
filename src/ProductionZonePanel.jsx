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

function ProductionZonePanel({ payload, isLoading, error, onRetry, onBack }) {
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
      <div className="zone-summary">
        <span className="zone-summary__value">{measure(summary.selected_acres)}</span>
        <span className="zone-summary__label">acres suggested</span>

        <span className="zone-summary__value">{measure(summary.eligible_acres)}</span>
        <span className="zone-summary__label">acres eligible</span>

        <span className="zone-summary__value">{measure(summary.selected_pct_of_parcel)}</span>
        <span className="zone-summary__label">% of parcel</span>
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
              return (
                <li key={zone.id} className="zone-list__row">
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

      <div className="button-row">
        <button className="button button--secondary" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

export default ProductionZonePanel
