// 관리자: 비밀번호 확인 + 상담 신청 목록 + 상태 바꾸기 + 비밀번호 바꾸기
// 비밀번호는 두 가지가 통한다: 관리자 화면에서 바꾼 비밀번호(해시로 저장), Vercel의 ADMIN_PASSWORD(비상용)
const crypto = require('node:crypto');
const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sbHeaders = () => ({
  apikey: SB_KEY,
  ...(String(SB_KEY).startsWith('eyJ') ? { Authorization: `Bearer ${SB_KEY}` } : {}),
  'Content-Type': 'application/json',
});
const same = (a, b) => {
  const h = (s) => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
const STATUSES = ['새 문의', '연락함', '완료'];
const MIN_LEN = 10;

const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`;
};
const matchesHash = (pw, stored) => {
  const [kind, salt, hex] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hex) return false;
  const a = crypto.scryptSync(String(pw), salt, 32);
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const storedHash = async () => {
  const r = await fetch(`${SB_URL}/rest/v1/admin_settings?key=eq.password_hash&select=value`, { headers: sbHeaders() });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0]?.value || null;
};
const isAdmin = (pw, hash) => {
  if (!pw) return false;
  const env = process.env.ADMIN_PASSWORD;
  return Boolean((env && same(pw, env)) || (hash && matchesHash(pw, hash)));
};
const readBody = (req) => {
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b;
};
const decode = (v) => { try { return decodeURIComponent(String(v || '')); } catch { return ''; } };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Supabase 연결 정보가 없어요.' });
  const hash = await storedHash();
  if (!process.env.ADMIN_PASSWORD && !hash) return res.status(500).json({ error: 'Vercel 환경변수에 ADMIN_PASSWORD를 넣고 Redeploy 해 주세요.' });
  if (!isAdmin(decode(req.headers['x-admin-password']), hash)) return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });

  if (req.method === 'GET') {
    const r = await fetch(`${SB_URL}/rest/v1/inquiries?select=*&order=created_at.desc&limit=500`, { headers: sbHeaders() });
    if (!r.ok) return res.status(500).json({ error: '불러오지 못했어요.' });
    return res.status(200).json({ rows: await r.json() });
  }
  if (req.method === 'PATCH') {
    const b = readBody(req);
    const id = Number(b.id);
    if (!Number.isInteger(id) || !STATUSES.includes(b.status)) return res.status(400).json({ error: '잘못된 요청이에요.' });
    const r = await fetch(`${SB_URL}/rest/v1/inquiries?id=eq.${id}`, {
      method: 'PATCH', headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ status: b.status, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return res.status(500).json({ error: '바꾸지 못했어요.' });
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'POST') {
    const b = readBody(req);
    if (b.action !== 'change-password') return res.status(400).json({ error: '잘못된 요청이에요.' });
    if (!isAdmin(String(b.current || ''), hash)) return res.status(400).json({ error: '지금 비밀번호가 맞지 않아요.' });
    const next = String(b.next || '');
    if (next.length < MIN_LEN) return res.status(400).json({ error: `새 비밀번호는 ${MIN_LEN}자 이상으로 정해 주세요.` });
    if (next.length > 100) return res.status(400).json({ error: '새 비밀번호는 100자 이하로 정해 주세요.' });
    const r = await fetch(`${SB_URL}/rest/v1/admin_settings`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'password_hash', value: hashPassword(next), updated_at: new Date().toISOString() }),
    });
    if (!r.ok) return res.status(500).json({ error: '비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.' });
    return res.status(200).json({ ok: true });
  }
  return res.status(405).json({ error: '지원하지 않는 요청이에요.' });
};
