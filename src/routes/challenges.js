import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getQuota, startChallenge, submitChallenge, getAttemptResult } from '../services/challenge.js';
import { resolveIpRegion } from '../services/ipRegion.js';
import { requireInteger, requireString, requireUuid, optionalInteger } from '../lib/validate.js';
import { badRequest } from '../lib/httpError.js';

const router = Router();

router.use(requireAuth);

router.get('/quota', async (req, res, next) => {
  try {
    res.json(await getQuota(req.userId));
  } catch (err) {
    next(err);
  }
});

router.post('/start', async (req, res, next) => {
  try {
    const requestId = requireString(req.body && req.body.requestId, 'requestId', { max: 64 });
    if (!/^[\x21-\x7E]+$/.test(requestId)) {
      throw badRequest('INVALID_PARAMETER', 'requestId 只能包含可见 ASCII 字符');
    }
    const { statusCode, body } = await startChallenge(req.userId, requestId);
    res.status(statusCode).json(body);
  } catch (err) {
    next(err);
  }
});

function parseSubmitPayload(body) {
  const totalTimeMs = requireInteger(body.totalTimeMs, 'totalTimeMs', { min: 1, max: 0xffffffff });
  const reactionTimeMs = requireInteger(body.reactionTimeMs, 'reactionTimeMs', { min: 0, max: totalTimeMs });
  const brakeDurationMs = requireInteger(body.brakeDurationMs, 'brakeDurationMs', { min: 0, max: totalTimeMs });
  const entrySpeedMilliKmh = requireInteger(body.entrySpeedMilliKmh, 'entrySpeedMilliKmh', { min: 0 });
  const maxBrakeForceN = requireInteger(body.maxBrakeForceN, 'maxBrakeForceN', { min: 1 });
  const brakingDistanceMm = optionalInteger(body.brakingDistanceMm, 'brakingDistanceMm', { min: 0 });

  if (reactionTimeMs + brakeDurationMs > totalTimeMs) {
    throw badRequest('INVALID_PARAMETER', '反应时间与制动时长之和不能超过总用时');
  }

  return {
    sessionId: requireUuid(body.sessionId, 'sessionId'),
    totalTimeMs,
    reactionTimeMs,
    brakeDurationMs,
    entrySpeedMilliKmh,
    maxBrakeForceN,
    brakingDistanceMm,
  };
}

router.post('/submit', async (req, res, next) => {
  try {
    const payload = parseSubmitPayload(req.body || {});
    const region = resolveIpRegion(req);
    const { created, body } = await submitChallenge(req.userId, payload, region);
    res.status(created ? 201 : 200).json(body);
  } catch (err) {
    next(err);
  }
});

router.get('/:attemptId/result', async (req, res, next) => {
  try {
    const attemptId = requireString(req.params.attemptId, 'attemptId', { max: 20 });
    if (!/^\d+$/.test(attemptId)) {
      throw badRequest('INVALID_PARAMETER', 'attemptId 格式不正确');
    }
    res.json(await getAttemptResult(req.userId, attemptId));
  } catch (err) {
    next(err);
  }
});

export default router;
