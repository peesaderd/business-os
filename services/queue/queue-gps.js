'use strict';

/**
 * Queue GPS Module
 *
 * Haversine distance calculation, proximity checking,
 * and geofence utilities for the Smart Queue system.
 */

/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * @param {number} lat1  Latitude of point 1 (degrees)
 * @param {number} lon1  Longitude of point 1 (degrees)
 * @param {number} lat2  Latitude of point 2 (degrees)
 * @param {number} lon2  Longitude of point 2 (degrees)
 * @returns {number} Distance in METERS
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6_371_000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.min(1, Math.max(0,
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)));
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if a customer is within a given radius of a location.
 * @param {object} customerPos  { lat, lng } of the customer
 * @param {object} businessPos  { lat, lng } of the business
 * @param {number} radiusMeters  Radius in meters (default: 500)
 * @returns {{ withinRange: boolean, distanceMeters: number }}
 */
function checkProximity(customerPos, businessPos, radiusMeters = 500) {
  if (!customerPos || !businessPos) {
    return { withinRange: false, distanceMeters: Infinity, error: 'Missing coordinates' };
  }

  const distance = haversineDistance(
    customerPos.lat, customerPos.lng,
    businessPos.lat, businessPos.lng
  );

  return {
    withinRange: distance <= radiusMeters,
    distanceMeters: Math.round(distance),
    distanceKm: (distance / 1000).toFixed(2),
  };
}

/**
 * Get distance in a human-readable format.
 * @param {number} meters
 * @returns {string}
 */
function formatDistance(meters) {
  if (meters === Infinity) return 'unknown';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}

module.exports = {
  haversineDistance,
  checkProximity,
  formatDistance,
};
