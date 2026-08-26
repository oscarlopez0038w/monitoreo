/**
 * Utility functions for precise Nicaragua timezone (America/Managua, UTC-6) calculations.
 * Fixes serverless UTC timezone shifts (Vercel Node.js runs in UTC+0).
 */

export function getNicaraguaNow() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value;
  });

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1; // 0-indexed month (0 = Enero, 6 = Julio)
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const monthStr = String(month + 1).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    todayStr: `${year}-${monthStr}-${dayStr}`,
    firstDayStr: `${year}-${monthStr}-01`,
  };
}

/**
 * Convierte cualquier timestamp o ISO string de fecha UTC a hora local formateada en Nicaragua (America/Managua, UTC-6)
 */
export function formatNicaraguaTime(dateInput) {
  if (!dateInput) return 'N/A';
  let str = String(dateInput).trim();
  if (!str.endsWith('Z') && !str.includes('+') && !str.includes('-06:00')) {
    if (str.includes('T')) {
      str = `${str}Z`;
    } else if (str.includes(' ')) {
      str = `${str.replace(' ', 'T')}Z`;
    }
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleTimeString('es-NI', {
    timeZone: 'America/Managua',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Convierte cualquier timestamp o ISO string de fecha UTC a fecha y hora completa en Nicaragua (America/Managua, UTC-6)
 */
export function formatNicaraguaDateTime(dateInput) {
  if (!dateInput) return 'N/A';
  let str = String(dateInput).trim();
  if (!str.endsWith('Z') && !str.includes('+') && !str.includes('-06:00')) {
    if (str.includes('T')) {
      str = `${str}Z`;
    } else if (str.includes(' ')) {
      str = `${str.replace(' ', 'T')}Z`;
    }
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return 'N/A';

  return d.toLocaleString('es-NI', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

