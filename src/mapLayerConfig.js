/**
 * mapLayerConfig.js
 *
 * Describes every backend GeoJSON layer this app renders, purely for
 * display purposes: what to call it in the legend, what color/line style
 * to draw it with, and whether it's visible by default.
 *
 * The backend (generate_full_report.py) sends one merged FeatureCollection
 * with every layer it produced; every feature carries properties.layer
 * (see feature_schema.py) identifying which layer it belongs to. Most
 * groups here match a single properties.layer value one-to-one. The one
 * exception is "suggested_road_corridor", which the backend emits as a
 * single layer but which this app splits into two legend groups (contour
 * vs ridge-top) via properties.corridor_type, since those read as visually
 * and functionally distinct suggestions on the map.
 *
 * Grouping is display-only — it doesn't change or reinterpret anything
 * the backend computed, just decides how to draw and toggle it.
 */

export const LAYER_GROUPS = [
  {
    key: 'production_area_candidate',
    label: 'Production Zones',
    shape: 'polygon',
    color: '#3f8f3f',
    defaultVisible: true,
  },
  {
    key: 'water_system_candidate',
    label: 'Water System Candidates',
    shape: 'polygon',
    color: '#1f78d1',
    defaultVisible: true,
  },
  {
    key: 'hydrology-streams',
    label: 'Streams (NHD)',
    shape: 'line',
    color: '#00b4d8',
    defaultVisible: true,
  },
  {
    key: 'hydrology-water_bodies',
    label: 'Water Bodies (NHD)',
    shape: 'polygon',
    color: '#0353a4',
    defaultVisible: true,
  },
  {
    key: 'soil',
    label: 'Soil Map Units (SSURGO)',
    shape: 'polygon',
    color: '#a1662f',
    defaultVisible: false,
  },
  {
    key: 'solar_infrastructure',
    label: 'Solar Candidates',
    shape: 'polygon',
    color: '#e8a400',
    defaultVisible: false,
  },
  {
    key: 'suggested_road_corridor:contour',
    label: 'Suggested Road Corridors — Contour',
    shape: 'line',
    color: '#8e44ad',
    defaultVisible: false,
    matches: (feature) =>
      feature.properties.layer === 'suggested_road_corridor' &&
      feature.properties.corridor_type === 'contour',
  },
  {
    key: 'suggested_road_corridor:ridge',
    label: 'Suggested Road Corridors — Ridge',
    shape: 'line',
    color: '#c2185b',
    defaultVisible: false,
    matches: (feature) =>
      feature.properties.layer === 'suggested_road_corridor' &&
      feature.properties.corridor_type === 'ridge',
  },
  {
    key: 'exclusion_fencing',
    label: 'Exclusion Fencing (Streams)',
    shape: 'line',
    color: '#d62828',
    defaultVisible: false,
  },
  {
    key: 'perimeter_fencing',
    label: 'Perimeter Fencing',
    shape: 'line',
    color: '#6b2737',
    defaultVisible: false,
  },
]

export const DEFAULT_VISIBLE_GROUP_KEYS = new Set(
  LAYER_GROUPS.filter((group) => group.defaultVisible).map((group) => group.key)
)

/**
 * Basemap tile services available underneath the overlay layers above.
 * USGSImageryOnly is a cached ArcGIS tiled service backed by NAIP aerial
 * photography (~0.6-1m resolution true color) at the zoom levels relevant
 * to a farm property, falling back to lower-res Landsat/Blue Marble only
 * at very zoomed-out scales. Same {z}/{y}/{x} tiled-service URL shape as
 * the Esri layer this replaces as default, kept here as an alternate.
 */
export const BASEMAPS = [
  {
    key: 'naip',
    label: 'USGS Imagery (NAIP)',
    url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map: Orthoimagery (NAIP)',
    maxZoom: 19,
  },
  {
    key: 'esri',
    label: 'Esri World Imagery',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
]

export const DEFAULT_BASEMAP_KEY = 'naip'

/** Features belonging to a given legend group, out of the full merged FeatureCollection. */
export function featuresForGroup(featureCollection, group) {
  if (!featureCollection) return []
  const matches = group.matches || ((feature) => feature.properties.layer === group.key)
  return featureCollection.features.filter(matches)
}
