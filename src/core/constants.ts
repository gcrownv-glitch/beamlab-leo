/** Constantes físicas y geométricas del simulador. */
export const MU_EARTH = 398600.4418; // km^3 / s^2
export const R_EARTH = 6378.137; // km, radio ecuatorial WGS-84
export const J2 = 1.08262668e-3;
export const C_LIGHT = 299792458; // m/s
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const TWO_PI = Math.PI * 2;
/** 1 unidad de Three.js = 1000 km */
export const KM_PER_UNIT = 1000;
export const EARTH_UNITS = R_EARTH / KM_PER_UNIT;
