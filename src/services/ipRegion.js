import ip2region from 'ip2region';
import config from '../config.js';

const IP2Region = ip2region.default || ip2region;

// ip2region 只提供省/市名称，不提供 GB/T 2260 行政区划代码，
// 这里仅补齐省级代码用于省榜过滤；市榜按名称分组。
const PROVINCE_CODES = {
  '北京市': '11',
  '天津市': '12',
  '河北省': '13',
  '山西省': '14',
  '内蒙古自治区': '15',
  '辽宁省': '21',
  '吉林省': '22',
  '黑龙江省': '23',
  '上海市': '31',
  '江苏省': '32',
  '浙江省': '33',
  '安徽省': '34',
  '福建省': '35',
  '江西省': '36',
  '山东省': '37',
  '河南省': '41',
  '湖北省': '42',
  '湖南省': '43',
  '广东省': '44',
  '广西壮族自治区': '45',
  '海南省': '46',
  '重庆市': '50',
  '四川省': '51',
  '贵州省': '52',
  '云南省': '53',
  '西藏自治区': '54',
  '陕西省': '61',
  '甘肃省': '62',
  '青海省': '63',
  '宁夏回族自治区': '64',
  '新疆维吾尔自治区': '65',
  '台湾省': '71',
  '香港特别行政区': '81',
  '澳门特别行政区': '82',
};

const PROVINCE_SHORT_NAMES = {
  '北京': '北京市',
  '天津': '天津市',
  '上海': '上海市',
  '重庆': '重庆市',
  '河北': '河北省',
  '山西': '山西省',
  '内蒙古': '内蒙古自治区',
  '辽宁': '辽宁省',
  '吉林': '吉林省',
  '黑龙江': '黑龙江省',
  '江苏': '江苏省',
  '浙江': '浙江省',
  '安徽': '安徽省',
  '福建': '福建省',
  '江西': '江西省',
  '山东': '山东省',
  '河南': '河南省',
  '湖北': '湖北省',
  '湖南': '湖南省',
  '广东': '广东省',
  '广西': '广西壮族自治区',
  '海南': '海南省',
  '四川': '四川省',
  '贵州': '贵州省',
  '云南': '云南省',
  '西藏': '西藏自治区',
  '陕西': '陕西省',
  '甘肃': '甘肃省',
  '青海': '青海省',
  '宁夏': '宁夏回族自治区',
  '新疆': '新疆维吾尔自治区',
  '台湾': '台湾省',
  '香港': '香港特别行政区',
  '澳门': '澳门特别行政区',
};

let searcher = null;

function getSearcher() {
  if (searcher) {
    return searcher;
  }
  const opts = {};
  if (config.ip2region.ipv4Db) {
    opts.ipv4db = config.ip2region.ipv4Db;
  }
  if (config.ip2region.ipv6Db) {
    opts.ipv6db = config.ip2region.ipv6Db;
  }
  if (config.ip2region.disableIpv6) {
    opts.disableIpv6 = true;
  }
  searcher = new IP2Region(opts);
  return searcher;
}

const NON_REGION_NAMES = new Set([
  '内网IP',
  '局域网',
  '本机地址',
  '保留地址',
  '未知',
  'UNKNOWN',
]);

function cleanName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '0' || NON_REGION_NAMES.has(trimmed)) {
    return null;
  }
  return trimmed;
}

function normalizeProvince(name) {
  const trimmed = cleanName(name);
  if (!trimmed) {
    return null;
  }
  return PROVINCE_SHORT_NAMES[trimmed] || trimmed;
}

function toRegion(result) {
  if (!result) {
    return null;
  }
  const provinceName = normalizeProvince(result.province);
  const cityName = cleanName(result.city);
  if (!provinceName && !cityName) {
    return null;
  }
  return {
    provinceCode: provinceName ? PROVINCE_CODES[provinceName] || null : null,
    provinceName,
    cityCode: null,
    cityName,
  };
}

export function resolveIpRegion(req) {
  const rawIp = clientIp(req);
  if (!rawIp) {
    return null;
  }
  try {
    return toRegion(getSearcher().search(rawIp));
  } catch (err) {
    console.warn('[ipRegion] IP 属地解析失败', { ip: rawIp, message: err.message });
    return null;
  }
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : (req.ip || '');
}
