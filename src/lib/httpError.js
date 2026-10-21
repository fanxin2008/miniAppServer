export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code, message) {
  return new HttpError(400, code, message);
}

export function unauthorized(message = '未登录或登录已过期') {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(code, message) {
  return new HttpError(403, code, message);
}

export function notFound(code, message) {
  return new HttpError(404, code, message);
}

export function conflict(code, message) {
  return new HttpError(409, code, message);
}

export function gone(code, message) {
  return new HttpError(410, code, message);
}

export function unprocessable(code, message) {
  return new HttpError(422, code, message);
}
