import * as L from 'leaflet';

/**
 * Coordinate system for the locally-cached The-Hidden-Gaming-Lair (th.gl)
 * Satisfactory "world" map tiles under Leaflet `L.CRS.Simple`.
 *
 * th.gl tile config (from their app):
 *   url: /map-tiles/world-<hash>/{z}/{y}/{x}.webp
 *   bounds: [[-374999,-324999],[374999,424999]]   // [gameY-range, gameX-range]
 *   tileSize: 512, minNativeZoom: 0, maxNativeZoom: 4
 * The pyramid is a full grid (no border): 2^z × 2^z tiles at zoom z.
 *
 * Marker alignment is calibrated with the flags below. th.gl's bounds pin the X
 * axis unambiguously (lng = gameX, east positive); the Y axis is symmetric so its
 * sign (and a possible transpose / tile-y flip) is set empirically:
 */
const TRANSPOSE = false; // swap which game axis drives horizontal vs vertical
const FLIP_Y = true; // true => north up (lat = -gameY)
const FLIP_X = false; // true => east on the left

// th.gl world-coordinate bounds (game cm).
const GX_MIN = -324999;
const GX_MAX = 424999;
const GY_MIN = -374999;
const GY_MAX = 374999;

const TILE_SIZE = 512;
const MAX_NATIVE_ZOOM = 4;
const MIN_TILE_ZOOM = 0;

/** Full native image size in px = tiles-across · tileSize = 2^maxNativeZoom · 512. */
const BACKGROUND_SIZE = TILE_SIZE * 2 ** MAX_NATIVE_ZOOM; // 8192
const RATIO_SCALE = 2 ** MAX_NATIVE_ZOOM; // 16
/** CRS.Simple latLng extent of the image (= backgroundSize / scale = tileSize = 512). */
const EXTENT = BACKGROUND_SIZE / RATIO_SCALE;

export const SF_MAP = {
  tileSize: TILE_SIZE,
  minTileZoom: MIN_TILE_ZOOM,
  maxNativeZoom: MAX_NATIVE_ZOOM,
} as const;

/**
 * Convert a game world position (x, y in cm) to a Leaflet LatLng under CRS.Simple,
 * aligned with the th.gl tiles. See the calibration flags above.
 */
export function gameToLatLng(x: number, y: number): L.LatLngExpression {
  let fx = (x - GX_MIN) / (GX_MAX - GX_MIN); // 0=west, 1=east
  let fy = (y - GY_MIN) / (GY_MAX - GY_MIN); // 0..1 along game +Y (south)
  if (FLIP_X) fx = 1 - fx;
  if (FLIP_Y) fy = 1 - fy;
  const horiz = TRANSPOSE ? fy : fx;
  const vert = TRANSPOSE ? fx : fy;
  // lng grows right, lat grows up; place the image in lat[-EXTENT,0], lng[0,EXTENT].
  return [-(1 - vert) * EXTENT, horiz * EXTENT];
}

/** Inverse of {@link gameToLatLng}: a Leaflet LatLng back to game (x, y) in cm. */
export function latLngToGame(latlng: L.LatLng): { x: number; y: number } {
  const horiz = latlng.lng / EXTENT;
  const vert = 1 + latlng.lat / EXTENT;
  let fx = TRANSPOSE ? vert : horiz;
  let fy = TRANSPOSE ? horiz : vert;
  if (FLIP_X) fx = 1 - fx;
  if (FLIP_Y) fy = 1 - fy;
  return {
    x: GX_MIN + fx * (GX_MAX - GX_MIN),
    y: GY_MIN + fy * (GY_MAX - GY_MIN),
  };
}

/** LatLng bounds covering the whole map image. */
export function mapBounds(): L.LatLngBounds {
  return L.latLngBounds([-EXTENT, 0], [0, EXTENT]);
}

/** th.gl has no border padding, so the terrain fills the whole image. */
export function terrainBounds(): L.LatLngBounds {
  return mapBounds();
}
