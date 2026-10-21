// Resolves a trusted client IP to an administrative region snapshot.
//
// The contract requires the region to come from a server-side trusted source,
// never from client-supplied fields. This project does not bundle a
// geolocation vendor; implement one here (e.g. Tencent LBS / IP-to-region API)
// and return { provinceCode, provinceName, cityCode, cityName } or null.
//
// Returning null is valid: the attempt can still be published to the national
// leaderboard, while province/city leaderboards skip it.
export function resolveIpRegion(req) {
  const rawIp = clientIp(req);
  if (!rawIp) {
    return null;
  }
  return null;
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.ip || '');
}
