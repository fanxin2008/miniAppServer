import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listLeaderboard, getMyRanking, normalizeScope } from '../services/leaderboard.js';
import { resolveIpRegion } from '../services/ipRegion.js';
import { badRequest } from '../lib/httpError.js';

const router = Router();

function parseScope(value) {
  const scope = normalizeScope(value);
  if (!scope) {
    throw badRequest('INVALID_PARAMETER', 'scope 必须是 national、province 或 city');
  }
  return scope;
}

function parseLimitOffset(query) {
  let limit = query.limit === undefined ? 20 : Number(query.limit);
  let offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw badRequest('INVALID_PARAMETER', 'limit 需为 1-50 的整数');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000) {
    throw badRequest('INVALID_PARAMETER', 'offset 需为 0-1000 的整数');
  }
  return { limit, offset };
}

function regionForBrowse(scope, query, req) {
  if (scope === 'national') {
    return null;
  }
  const code = query.regionCode ? String(query.regionCode) : null;
  const name = query.regionName ? String(query.regionName) : null;
  if (code) {
    return {
      provinceCode: scope === 'province' ? code : null,
      provinceName: scope === 'province' ? name || null : null,
      cityCode: scope === 'city' ? code : null,
      cityName: scope === 'city' ? name || null : null,
    };
  }
  const ipRegion = resolveIpRegion(req);
  if (scope === 'province' && ipRegion && ipRegion.provinceCode) {
    return ipRegion;
  }
  if (scope === 'city' && ipRegion && (ipRegion.cityCode || ipRegion.cityName)) {
    return ipRegion;
  }
  throw badRequest('REGION_REQUIRED', '浏览省/市榜单需要提供 regionCode/regionName 或可信 IP 属地');
}

router.get('/', async (req, res, next) => {
  try {
    const scope = parseScope(req.query.scope);
    const { limit, offset } = parseLimitOffset(req.query);
    const region = regionForBrowse(scope, req.query, req);
    const data = await listLeaderboard({ scope, limit, offset, region });
    res.json({
      scope,
      regionCode: scope === 'national' ? null : (scope === 'province' ? region.provinceCode : region.cityCode),
      regionName: scope === 'national' ? null : (scope === 'province' ? region.provinceName : region.cityName),
      totalPlayers: data.totalPlayers,
      items: data.items,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const scope = parseScope(req.query.scope);
    res.json(await getMyRanking(req.userId, req.user.status, scope));
  } catch (err) {
    next(err);
  }
});

export default router;
