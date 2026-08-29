/**
 * LandformPanel.jsx
 *
 * A PLACEHOLDER, SAID OUT LOUD.
 *
 * The working production-zone UI is App.jsx's spike -- ProductionZonePanel,
 * ProductionZoneLayers, ProductionDrawnZones, the caution markers and the
 * clamping in zoneGeometry.js -- and it still calls /api/production-zones.
 * Moving it onto the session path is F4's branch, and moving it early would
 * mean rewriting the panel against a step machine while also rewiring it onto
 * a new endpoint, with no way to tell which change broke it.
 *
 * What this renders is what the machine already knows: how many proposals came
 * back, how many are selected, and any per-feature rejection the server
 * returned. That is enough for the wizard's own tests to be about the wizard.
 */

export default function LandformPanel({ machine }) {
  const { proposalFeatures, draft, rejections, stepId, actions } = machine
  const selected = new Set(draft.selectedFeatureIds)

  return (
    <div className="step-panel__body">
      <p className="step-panel__line" data-testid="landform-placeholder">
        Placeholder panel — the scored zone table, the caution markers and the
        drawn-zone editing still live in the production-zone spike and move
        here in a later branch.
      </p>
      <p className="step-panel__line" data-testid="landform-counts">
        {proposalFeatures.length} proposal{proposalFeatures.length === 1 ? '' : 's'},{' '}
        {selected.size} selected
      </p>
      <ul className="step-panel__proposals">
        {proposalFeatures.map((feature) => {
          const rejection = rejections[feature.id] ?? null
          return (
            <li key={feature.id} data-testid={`landform-proposal-${feature.id}`}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(feature.id)}
                  onChange={() => actions.toggleSelection(stepId, feature.id)}
                />
                {feature.id}
              </label>
              {rejection ? (
                <span
                  className="step-panel__rejection"
                  data-testid={`rejection-${feature.id}`}
                >
                  {rejection.reason}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
