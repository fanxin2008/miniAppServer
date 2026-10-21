import { badRequest } from './httpError.js';

export function requireString(value, field, { min = 1, max = 64, trim = true } = {}) {
  if (typeof value !== 'string') {
    throw badRequest('INVALID_PARAMETER', `${field} 必须是字符串`);
  }
  const result = trim ? value.trim() : value;
  if (result.length < min || result.length > max) {
    throw badRequest('INVALID_PARAMETER', `${field} 长度需为 ${min}-${max} 个字符`);
  }
  return result;
}

export function requireInteger(value, field, { min = 0, max = 0xffffffff } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw badRequest('INVALID_PARAMETER', `${field} 必须是 ${min}-${max} 之间的整数`);
  }
  return number;
}

export function optionalInteger(value, field, { min = 0, max = 0xffffffff } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return requireInteger(value, field, { min, max });
}

export function requireUuid(value, field = 'sessionId') {
  if (typeof value !== 'string' || !/^[0-9a-fA-F-]{36}$/.test(value)) {
    throw badRequest('INVALID_PARAMETER', `${field} 格式不正确`);
  }
  return value;
}
