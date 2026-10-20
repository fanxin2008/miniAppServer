import config from '../config.js';

const JSCODE2SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

export async function code2Session(code) {
  const url = new URL(JSCODE2SESSION_URL);
  url.searchParams.set('appid', config.wechat.appid);
  url.searchParams.set('secret', config.wechat.secret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await response.json();

  if (data.errcode) {
    const err = new Error(mapWechatError(data.errcode));
    err.status = 400;
    throw err;
  }

  if (!data.openid) {
    const err = new Error('微信登录失败，未获取到 openid');
    err.status = 502;
    throw err;
  }

  return data;
}

function mapWechatError(errcode) {
  switch (errcode) {
    case 40029:
      return '无效的 code';
    case 45011:
      return '请求过于频繁，请稍后再试';
    case 40226:
      return '存在登录风险，请稍后再试';
    case -1:
      return '微信服务繁忙，请稍后再试';
    default:
      return `微信登录失败（${errcode}）`;
  }
}
