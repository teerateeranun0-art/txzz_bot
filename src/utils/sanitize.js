export const SNOWFLAKE = /^\d{17,20}$/;

export function isSnowflake(value) {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

export function truncate(text, max = 200) {
  const str = String(text ?? '');
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 1))}…`;
}

export function stripMentions(text) {
  return String(text ?? '')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&?\d+>/g, '[mention]')
    .replace(/@(?:everyone|here)/gi, '@\u200b$1');
}

export function safeText(text, max = 200) {
  return truncate(stripMentions(text), max);
}

export function noMentions() {
  return { parse: [] };
}

export function mentionUsers(...ids) {
  return { parse: [], users: ids.filter(Boolean) };
}

export function userFacingError(err) {
  const code = err?.code ?? err?.status;
  if (code === 50013) return 'บอทไม่มีสิทธิ์เพียงพอสำหรับคำสั่งนี้';
  if (code === 50001) return 'บอทเข้าถึงช่องหรือผู้ใช้นี้ไม่ได้';
  if (code === 50035) return 'ข้อมูลที่ส่งไม่ถูกต้อง';
  if (code === 10007) return 'ไม่พบสมาชิกในเซิร์ฟเวอร์';
  if (code === 10008) return 'ไม่พบข้อความ';
  if (code === 10013) return 'ไม่พบผู้ใช้นี้';
  if (code === 10026) return 'ผู้ใช้นี้ไม่ถูกแบนอยู่';
  if (code === 30007) return 'เซิร์ฟเวอร์มีช่องครบจำนวนแล้ว';
  if (code === 30013) return 'มีช่องในหมวดนี้ครบแล้ว';
  if (typeof err?.message === 'string' && err.message.includes('Missing Permissions')) {
    return 'บอทหรือคุณไม่มีสิทธิ์เพียงพอ';
  }
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่';
}
