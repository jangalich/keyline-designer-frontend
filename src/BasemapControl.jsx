/**
 * BasemapControl
 *
 * Two named basemaps, not a layer tree. Imagery vintage and what is legible
 * on the ground matter when you are tracing a boundary, so this is
 * functional rather than chrome.
 *
 * Both options come from the one provider already in use, and both were
 * chosen because they are verifiable rather than plausible. Leaf-off imagery
 * is a real need and is NOT here: reliable national leaf-off coverage means
 * seasonal NAIP or state-level services, and picking one is its own
 * investigation. Logged as backlog rather than guessed at.
 */
export const BASEMAPS = [
  {
    id: 'imagery',
    label: 'Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    // A second tile layer painted over the imagery, or null for none.
    referenceUrl: null,
  },
  {
    id: 'imagery-labels',
    label: 'Imagery + labels',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    // Parcel lines, roads and place names. The case this exists for: a
    // boundary that follows a property line with nothing visible on the
    // ground to trace against.
    referenceUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  },
]

function BasemapControl({ value, onChange }) {
  return (
    <div className="basemap" role="group" aria-label="Basemap">
      {BASEMAPS.map((basemap) => (
        <button
          key={basemap.id}
          type="button"
          className="basemap__option"
          aria-pressed={value === basemap.id}
          onClick={() => onChange(basemap.id)}
        >
          {basemap.label}
        </button>
      ))}
    </div>
  )
}

export default BasemapControl
