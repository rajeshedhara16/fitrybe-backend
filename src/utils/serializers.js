function serializeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

/**
 * Trims a tagged activity down to what a feed card renders.
 *
 * `routeData` is dropped and replaced by a flag. A logged run holds one GPS
 * point per second — thousands for an hour's effort — and shipping the full
 * trace for every post on a page would dwarf everything else on the wire. The
 * card only needs to know a route exists so it can offer to open it; the full
 * trace is fetched from the activity endpoint when someone actually asks.
 */
function serializeActivitySummary(activity) {
  if (!activity) return null;
  const { routeData, ...rest } = activity;
  return {
    ...rest,
    hasRoute: Array.isArray(routeData) && routeData.length > 1,
  };
}

module.exports = { serializeUser, serializeActivitySummary };
