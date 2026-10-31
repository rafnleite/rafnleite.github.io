export function hasMapPosition(place) {
  return Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
    && !(place.lat === 0 && place.lng === 0)
    && !(place.lat === -1 && place.lng === -1);
}

// ZZ is one electoral zone covering the world. Its geographic average is not
// a polling place: keep foreign places at physical positions at every zoom.
export function prepareMapGroups(result, level, zoneResults = new Map()) {
  const groups = level === 'zones' ? [
    ...result.zones.filter(zone => zone.uf !== 'ZZ').map(zone => ({
      ...zone, election: zoneResults.get(`${zone.uf}/${Number(zone.zone)}`) || null,
    })),
    ...result.locations.filter(place => place.uf === 'ZZ'),
  ] : result.locations;
  const located = groups.filter(hasMapPosition);
  const reference = located.reduce((maximum, place) => Math.max(maximum, place.count), 1);
  const records = located.map(place => {
    const markerLevel = place.uf === 'ZZ' ? 'locations' : level;
    const identity = markerLevel === 'zones' ? `${place.uf}/${Number(place.zone)}` : place.key;
    return {key:`${markerLevel}:${identity}`,level:markerLevel,place,
      lat:place.lat,lng:place.lng,reference};
  });
  return {groupsCount:groups.length,records,reference,
    hasForeign:groups.some(place=>place.uf==='ZZ'),
    unmappedVotes:result.selected-located.reduce((sum,place)=>sum+place.count,0)};
}
