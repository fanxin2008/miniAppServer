import config from '../config.js';

const TIMEZONE = config.timezone;

export function todayInTimezone(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export function resetAtUtcIso(date = todayInTimezone()) {
  const [year, month, day] = date.split('-').map(Number);
  const reset = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0));
  const offsetMs = timezoneOffsetMs(TIMEZONE, reset);
  return new Date(reset.getTime() - offsetMs).toISOString();
}

function timezoneOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

export function toIso(dbDateTime) {
  if (!dbDateTime) {
    return null;
  }
  const text = String(dbDateTime);
  if (/Z$/.test(text)) {
    return text;
  }
  return text.replace(' ', 'T') + 'Z';
}

