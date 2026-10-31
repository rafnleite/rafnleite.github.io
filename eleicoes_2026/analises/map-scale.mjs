/** Geographic viewport scale; independent of Leaflet zoom and screen size. */
export const LOCATIONS_ENTRY_KM = 1400;
export const LOCATIONS_EXIT_KM = 1600;
export const KM_PER_LATITUDE_DEGREE = 111.195;

/**
 * Show polling locations at approximately state-sized viewports and zones in
 * broader views. Longitudes must describe the unwrapped viewport: 170..190 is
 * a 20-degree span, while -180..540 is two complete visible worlds.
 *
 * The 1400/1600 km band retains the previous level to avoid flickering while
 * panning or resizing. Invalid or degenerate bounds use the broader level.
 */
export function mapLevelForBounds(bounds, previous = 'zones') {
  if (!bounds || typeof bounds !== 'object' || Array.isArray(bounds)) return 'zones';
  const { north, south, east, west } = bounds;
  if (![north, south, east, west].every(Number.isFinite)
      || north > 90 || south < -90 || north <= south || east <= west) return 'zones';

  const latitudeSpan = north - south;
  const longitudeSpan = east - west;
  // Do not normalize modulo 360 or use the shorter antimeridian arc: doing so
  // would turn a wide/world viewport into an apparently local one.
  const middleLatitudeRadians = ((north + south) / 2) * Math.PI / 180;
  const heightKm = latitudeSpan * KM_PER_LATITUDE_DEGREE;
  const widthKm = longitudeSpan * KM_PER_LATITUDE_DEGREE * Math.cos(middleLatitudeRadians);
  const largestDimensionKm = Math.max(heightKm, widthKm);
  if (!Number.isFinite(largestDimensionKm)) return 'zones';

  const threshold = previous === 'locations' ? LOCATIONS_EXIT_KM : LOCATIONS_ENTRY_KM;
  return largestDimensionKm <= threshold ? 'locations' : 'zones';
}
