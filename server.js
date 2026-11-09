/* Service Hub - zero-dependency Node.js server (Node 18+).
 * Serves the web app in /public and a JSON REST API under /api.
 * Data is persisted to data/db.json (created + seeded on first run). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(__dirname, 'public');

/* ---------------- database (JSON file) ---------------- */
let db;
let saveTimer = null;
const uid = (p) => p + '_' + crypto.randomBytes(5).toString('hex');
const now = () => new Date().toISOString();

function hashPw(pw, salt) {
  return crypto.scryptSync(pw, salt, 32).toString('hex');
}
function makeUser(o) {
  const salt = crypto.randomBytes(8).toString('hex');
  return {
    id: uid('u'), createdAt: now(), blocked: false, favorites: [], location: '', phone: '',
    ...o, salt, hash: hashPw(o.password, salt), password: undefined,
  };
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 100);
}
function saveNow() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

const CATEGORIES = [
  { id: 'plumbing', name: 'Plumbing', icon: '🚰' },
  { id: 'electrical', name: 'Electrical', icon: '💡' },
  { id: 'carpentry', name: 'Carpentry', icon: '🪚' },
  { id: 'cleaning', name: 'Home Cleaning', icon: '🧹' },
  { id: 'appliance', name: 'Appliance Repair', icon: '🔧' },
  { id: 'painting', name: 'Painting', icon: '🎨' },
  { id: 'ac', name: 'AC Service', icon: '❄️' },
  { id: 'pest', name: 'Pest Control', icon: '🐜' },
];
const LOCATIONS = ['Gudlavalleru', 'Gudivada', 'Vijayawada', 'Machilipatnam', 'Guntur', 'Eluru', 'Vizag'];

function seed() {
  const d = { users: [], providers: [], services: [], bookings: [], feedback: [], notifications: [], coupons: [], complaints: [] };
  d.users.push(makeUser({ name: 'Admin', email: 'admin@servicehub.com', password: 'admin123', role: 'admin', phone: '9000000000' }));
  d.users.push(makeUser({ name: 'Demo Customer', email: 'user@servicehub.com', password: 'user123', role: 'user', phone: '9000000001', location: 'Gudlavalleru' }));

  const svc = [
    ['plumbing', 'Tap / Pipe Repair', 250, 'Fix leaking taps, pipes and fittings'],
    ['plumbing', 'Bathroom Fitting', 600, 'Install or replace bathroom fixtures'],
    ['electrical', 'Fan / Light Installation', 200, 'Install ceiling fans, lights and switches'],
    ['electrical', 'Wiring & Short-circuit Fix', 450, 'Diagnose and fix wiring faults'],
    ['carpentry', 'Furniture Repair', 400, 'Repair doors, cots, tables and cupboards'],
    ['carpentry', 'Custom Furniture', 1500, 'Made-to-order wooden furniture'],
    ['cleaning', 'Full Home Deep Clean', 1200, 'Complete deep cleaning of your home'],
    ['cleaning', 'Kitchen Cleaning', 600, 'Chimney, tiles, cabinets and platform'],
    ['appliance', 'Washing Machine Repair', 350, 'Inspection and repair'],
    ['appliance', 'Refrigerator Repair', 450, 'Cooling, compressor and gas issues'],
    ['painting', 'Room Painting', 1800, 'Per room interior painting'],
    ['ac', 'AC Servicing', 500, 'Jet-wash cleaning and gas check'],
    ['ac', 'AC Installation', 900, 'Split / window AC installation'],
    ['pest', 'Pest Control (Home)', 800, 'Cockroach, termite and ant treatment'],
  ];
  svc.forEach(([category, name, price, description], i) =>
    d.services.push({ id: 's' + (i + 1), category, name, price, description }));

  const P = [
    ['Ramesh Kumar', 'plumbing', 'Gudlavalleru', 8, 250, 'Experienced plumber for homes and small shops.'],
    ['Suresh Babu', 'plumbing', 'Vijayawada', 12, 300, 'Specialist in bathroom and kitchen plumbing.'],
    ['Venkat Rao', 'electrical', 'Gudlavalleru', 10, 220, 'Licensed electrician - wiring, fans, inverters.'],
    ['Anil Reddy', 'electrical', 'Gudivada', 6, 200, 'Quick fault finding and safe installations.'],
    ['Srinivas M', 'carpentry', 'Machilipatnam', 15, 400, 'Custom furniture and door repairs.'],
    ['Lakshmi Devi', 'cleaning', 'Gudlavalleru', 5, 300, 'Trained team for deep cleaning.'],
    ['Prasad K', 'appliance', 'Vijayawada', 9, 350, 'Washing machine, fridge and microwave expert.'],
    ['Naresh P', 'painting', 'Guntur', 11, 450, 'Interior and exterior painting.'],
    ['Kiran Kumar', 'ac', 'Gudlavalleru', 7, 400, 'AC installation and servicing, all brands.'],
    ['Ravi Teja', 'ac', 'Vijayawada', 4, 380, 'Fast AC repair and gas refilling.'],
    ['Madhavi S', 'pest', 'Eluru', 6, 500, 'Safe, odourless pest control.'],
    ['Mahesh B', 'plumbing', 'Gudivada', 3, 220, 'New on the platform - awaiting verification.'],
  ];
  const days = [[1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]];
  const SKILLS = {
    plumbing: ['Leak repair', 'Pipe fitting', 'Bathroom fixtures', 'Water tanks'], electrical: ['Wiring', 'Fan & light fitting', 'Inverter setup', 'Fault finding'],
    carpentry: ['Furniture repair', 'Custom furniture', 'Door fitting', 'Polishing'], cleaning: ['Deep cleaning', 'Kitchen cleaning', 'Sofa & carpet', 'Bathroom cleaning'],
    appliance: ['Washing machine', 'Refrigerator', 'Microwave', 'Water purifier'], painting: ['Interior painting', 'Exterior painting', 'Waterproofing', 'Wall putty'],
    ac: ['AC installation', 'Gas refilling', 'Jet-wash service', 'All brands'], pest: ['Termite control', 'Cockroach control', 'Rodent control', 'Mosquito control'],
  };
  P.forEach(([name, serviceType, location, experience, rate, bio], i) => {
    const u = makeUser({ name, email: name.split(' ')[0].toLowerCase() + '@servicehub.com', password: 'provider123', role: 'provider', phone: '98480' + (10000 + i * 37), location });
    d.users.push(u);
    d.providers.push({
      id: uid('p'), userId: u.id, name, phone: u.phone, serviceType, location, experience, rate, bio,
      skills: SKILLS[serviceType], serviceAreas: [location, LOCATIONS[(LOCATIONS.indexOf(location) + 1) % LOCATIONS.length]],
      verified: i !== 11, availableDays: days[i % 3], startHour: 9, endHour: i % 2 ? 20 : 18, createdAt: now(),
    });
  });

  // a few completed bookings + reviews so ratings are populated
  const cust = d.users[1];
  const comments = ['Very professional and on time.', 'Good work, fair price.', 'Fixed the issue quickly!', 'Polite and skilled.', 'Would hire again.'];
  d.providers.forEach((p, i) => {
    if (!p.verified) return;
    const s = d.services.find((x) => x.category === p.serviceType);
    for (let k = 0; k < 2 + (i % 3); k++) {
      const b = {
        id: uid('b'), userId: cust.id, providerId: p.id, serviceId: s.id, date: '2026-09-' + String(5 + k * 3).padStart(2, '0'),
        time: '10:00', address: 'Demo address, ' + p.location, notes: '', status: 'completed', createdAt: now(),
        payment: { method: 'cash', status: 'paid', amount: s.price },
      };
      d.bookings.push(b);
      d.feedback.push({ id: uid('f'), bookingId: b.id, userId: cust.id, providerId: p.id, rating: 3 + ((i + k) % 3), comment: comments[(i + k) % comments.length], createdAt: now() });
    }
  });
  d.coupons = [
    { code: 'WELCOME10', percent: 10, desc: '10% off your booking' },
    { code: 'HUB20', percent: 20, desc: '20% off (limited)' },
  ];
  return d;
}

function load() {
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return; }
    catch (e) { console.error('db.json is corrupted, re-seeding:', e.message); fs.renameSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); }
  }
  db = seed();
  saveNow();
}
load();
// migrate older databases created by previous versions
db.complaints = db.complaints || [];
db.providers.forEach((p) => { p.skills = p.skills || []; p.serviceAreas = p.serviceAreas && p.serviceAreas.length ? p.serviceAreas : [p.location]; });
saveNow();




/* ---------------- sessions ---------------- */
const sessions = new Map(); // token -> userId
function session(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  const id = sessions.get(t);
  const u = id && db.users.find((x) => x.id === id);
  return u && !u.blocked ? { user: u, token: t } : null;
}

/* ---------------- helpers ---------------- */
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const bad = (m) => new HttpError(400, m);
const must = (c, m, code = 400) => { if (!c) throw new HttpError(code, m); };

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, location: u.location, favorites: u.favorites, blocked: u.blocked, createdAt: u.createdAt };
}
function ratingOf(pid) {
  const f = db.feedback.filter((x) => x.providerId === pid);
  return { rating: f.length ? Math.round((f.reduce((a, b) => a + b.rating, 0) / f.length) * 10) / 10 : 0, reviews: f.length };
}
function jobsDone(pid) { return db.bookings.filter((b) => b.providerId === pid && b.status === 'completed').length; }
function notify(userId, text) { db.notifications.push({ id: uid('n'), userId, text, read: false, createdAt: now() }); }
const dayOf = (date) => new Date(date + 'T00:00:00').getDay();

const servesLocation = (p, loc) => !loc || p.location.toLowerCase() === loc.toLowerCase() || (p.serviceAreas || []).some((a) => a.toLowerCase() === loc.toLowerCase());

function isAvailable(p, date, time) {
  if (!date) return { ok: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: 'Invalid date' };
  if (!p.availableDays.includes(dayOf(date))) return { ok: false, reason: 'Not working on this day' };
  if (time) {
    const h = parseInt(time.split(':')[0], 10);
    if (h < p.startHour || h >= p.endHour) return { ok: false, reason: `Works ${fmtH(p.startHour)}-${fmtH(p.endHour)}` };
    const clash = db.bookings.some((b) => b.providerId === p.id && b.date === date && b.time === time && ['pending', 'confirmed', 'in_progress'].includes(b.status));
    if (clash) return { ok: false, reason: 'Slot already booked' };
  }
  return { ok: true };
}
const fmtH = (h) => (h % 12 || 12) + (h < 12 ? 'AM' : 'PM');

function providerView(p, q = {}) {
  const r = ratingOf(p.id);
  const av = isAvailable(p, q.date, q.time);
  const cat = CATEGORIES.find((c) => c.id === p.serviceType);
  // Smart matching score (0-100): location 40 + availability 25 + rating 25 + experience 10
  let score = 0;
  if (q.location) score += p.location.toLowerCase() === q.location.toLowerCase() ? 40 : servesLocation(p, q.location) ? 30 : 0; else score += 20;
  score += av.ok ? 25 : 0;
  score += (r.rating / 5) * 25 || 10;
  score += Math.min(p.experience, 10);
  return { ...p, ...r, jobsDone: jobsDone(p.id), available: av.ok, unavailableReason: av.reason || null, categoryName: cat && cat.name, icon: cat && cat.icon, match: Math.round(score) };
}
function bookingView(b) {
  const p = db.providers.find((x) => x.id === b.providerId);
  const u = db.users.find((x) => x.id === b.userId);
  const s = db.services.find((x) => x.id === b.serviceId);
  const fb = db.feedback.find((x) => x.bookingId === b.id);
  return { ...b, providerName: p && p.name, providerPhone: p && p.phone, providerLocation: p && p.location, userName: u && u.name, userPhone: u && u.phone, serviceName: s && s.name, category: s && s.category, feedback: fb || null };
}
function myProvider(u) { return db.providers.find((p) => p.userId === u.id); }

const parseList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean).slice(0, 12);

/* ---------------- route table ---------------- */
const routes = [];
const route = (method, pattern, handler, auth) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth });
};
// auth: false (public) | true (any logged-in) | 'role' | ['role', ...]

/* ---------------- machine-learning endpoints ----------------
 * The Python service trains three demo models from bundled example data.
 * Install dependencies from ml/requirements.txt before using these endpoints.
 */
const ML_SCRIPT = path.join(__dirname, 'ml', 'ml_engine.py');
function runML(mode, payload) {
  const py = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  try {
    const out = execFileSync(py, [ML_SCRIPT, mode], {
      input: JSON.stringify(payload || {}), encoding: 'utf8', timeout: 20000,
      maxBuffer: 2 * 1024 * 1024
    });
    return JSON.parse(out);
  } catch (e) {
    const detail = (e.stderr && String(e.stderr).trim()) || e.message || 'Unknown ML error';
    throw new HttpError(503, 'ML service is not ready. Install dependencies with: pip install -r ml/requirements.txt. Details: ' + detail.slice(0, 240));
  }
}
route('GET', '/api/ml/status', () => ({
  available: fs.existsSync(ML_SCRIPT),
  models: [
    { id: 'service-classifier', name: 'Service Classification', algorithm: 'TF-IDF + Logistic Regression' },
    { id: 'demand-predictor', name: 'Service Demand Prediction', algorithm: 'Random Forest Regressor' },
    { id: 'technician-recommender', name: 'Technician Recommendation', algorithm: 'Random Forest Classifier' }
  ]
}), false);
route('POST', '/api/ml/classify', ({ body }) => runML('classify', { text: String(body.text || '').slice(0, 1000) }), false);
route('POST', '/api/ml/demand', ({ body }) => runML('demand', {
  category: String(body.category || 'plumbing'),
  month: Math.max(1, Math.min(12, Number(body.month) || new Date().getMonth() + 1)),
  weekday: Math.max(0, Math.min(6, Number(body.weekday) || 0))
}), false);
route('POST', '/api/ml/recommend-technician', ({ body }) => {
  const category = String(body.category || 'plumbing');
  const location = String(body.location || '');
  const candidates = db.providers.filter(p => p.verified).map(p => {
    const rating = ratingOf(p.id);
    return {
      id: p.id, name: p.name, serviceType: p.serviceType, location: p.location,
      experience: Number(p.experience) || 0, rating: Number(rating.rating) || 0,
      reviews: Number(rating.reviews) || 0, verified: !!p.verified,
      available: !location || p.location.toLowerCase() === location.toLowerCase() ||
        (p.serviceAreas || []).some(a => a.toLowerCase() === location.toLowerCase())
    };
  });
  return runML('recommend', { category, location, candidates });
}, false);
route('GET', '/api/meta', () => ({ categories: CATEGORIES, locations: LOCATIONS }), false);

route('POST', '/api/register', ({ body }) => {
  const { name, email, password, role = 'user', phone = '', location = '' } = body;
  must(name && name.trim().length >= 2, 'Name is required');
  must(/^\S+@\S+\.\S+$/.test(email || ''), 'Valid email required');
  must(password && password.length >= 6, 'Password must be at least 6 characters');
  must(['user', 'provider'].includes(role), 'Invalid role');
  must(!db.users.some((u) => u.email.toLowerCase() === email.toLowerCase()), 'Email already registered', 409);
  const u = makeUser({ name: name.trim(), email: email.trim(), password, role, phone, location });
  db.users.push(u);
  if (role === 'provider') {
    const { serviceType, experience = 0, rate = 300, bio = '' } = body;
    const skills = parseList(body.skills), areas = parseList(body.serviceAreas);
    must(CATEGORIES.some((c) => c.id === serviceType), 'Choose a service type');
    db.providers.push({
      id: uid('p'), userId: u.id, name: u.name, phone, serviceType, location, experience: Number(experience) || 0, rate: Number(rate) || 300, bio, skills, serviceAreas: areas.length ? areas : [location],
      verified: false, availableDays: [1, 2, 3, 4, 5, 6], startHour: 9, endHour: 18, createdAt: now(),
    });
    db.users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, `New provider "${u.name}" is awaiting verification.`));
  }
  notify(u.id, 'Welcome to Service Hub! ' + (role === 'provider' ? 'An admin will verify your profile shortly.' : 'Find a trusted professional near you.'));
  save();
  return login(u);
}, false);

function login(u) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, u.id);
  return { token, user: publicUser(u) };
}
route('POST', '/api/login', ({ body }) => {
  const u = db.users.find((x) => x.email.toLowerCase() === String(body.email || '').toLowerCase());
  must(u && crypto.timingSafeEqual(Buffer.from(hashPw(String(body.password || ''), u.salt)), Buffer.from(u.hash)), 'Invalid email or password', 401);
  must(!u.blocked, 'This account has been blocked by the admin', 403);
  return login(u);
}, false);
route('POST', '/api/logout', ({ sess }) => { sessions.delete(sess.token); return { ok: true }; }, true);
route('GET', '/api/me', ({ sess }) => ({ user: publicUser(sess.user), provider: myProvider(sess.user) || null }), true);
route('PUT', '/api/me', ({ sess, body }) => {
  const u = sess.user;
  if (body.name) u.name = String(body.name).trim();
  if (body.phone !== undefined) u.phone = String(body.phone);
  if (body.location !== undefined) u.location = String(body.location);
  if (body.password) { must(body.password.length >= 6, 'Password must be at least 6 characters'); u.salt = crypto.randomBytes(8).toString('hex'); u.hash = hashPw(body.password, u.salt); }
  const p = myProvider(u);
  if (p) { p.name = u.name; p.phone = u.phone; if (u.location) p.location = u.location; }
  save();
  return { user: publicUser(u) };
}, true);

/* services & providers */
route('GET', '/api/services', ({ query }) => db.services.filter((s) => !query.category || s.category === query.category), false);

route('GET', '/api/providers', ({ query, sess }) => {
  let list = db.providers.filter((p) => p.verified);
  if (query.category) list = list.filter((p) => p.serviceType === query.category);
  if (query.q) { const q = query.q.toLowerCase(); list = list.filter((p) => (p.name + p.bio + p.location + p.serviceType).toLowerCase().includes(q)); }
  if (query.location) list = list.filter((p) => servesLocation(p, query.location));
  let out = list.map((p) => providerView(p, query));
  if (query.availableOnly === '1') out = out.filter((p) => p.available);
  if (query.minRating) out = out.filter((p) => p.rating >= Number(query.minRating));
  if (query.maxRate) out = out.filter((p) => p.rate <= Number(query.maxRate));
  const sorts = {
    match: (a, b) => b.match - a.match, rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
    price: (a, b) => a.rate - b.rate, experience: (a, b) => b.experience - a.experience,
  };
  out.sort(sorts[query.sort] || sorts.match);
  const favs = sess ? sess.user.favorites : [];
  return out.map((p) => ({ ...p, favorite: favs.includes(p.id) }));
}, false, true /* optional session */);

route('GET', '/api/providers/:id', ({ params, query, sess }) => {
  const p = db.providers.find((x) => x.id === params.id);
  must(p && (p.verified || (sess && (sess.user.role === 'admin' || sess.user.id === p.userId))), 'Provider not found', 404);
  const reviews = db.feedback.filter((f) => f.providerId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((f) => ({ ...f, userName: (db.users.find((u) => u.id === f.userId) || {}).name }));
  const services = db.services.filter((s) => s.category === p.serviceType);
  // upcoming booked slots (so customers can see what's taken)
  const booked = db.bookings.filter((b) => b.providerId === p.id && ['pending', 'confirmed', 'in_progress'].includes(b.status)).map((b) => ({ date: b.date, time: b.time }));
  return { provider: { ...providerView(p, query), favorite: !!(sess && sess.user.favorites.includes(p.id)) }, reviews, services, booked };
}, false, true);

route('POST', '/api/favorites/:id', ({ sess, params }) => {
  const f = sess.user.favorites; const i = f.indexOf(params.id);
  if (i >= 0) f.splice(i, 1); else f.push(params.id);
  save();
  return { favorites: f };
}, ['user']);

/* bookings */
function price(service, coupon) {
  let amount = service.price, discount = 0;
  if (coupon) {
    const c = db.coupons.find((x) => x.code === String(coupon).toUpperCase());
    must(c, 'Invalid coupon code');
    discount = Math.round((amount * c.percent) / 100);
  }
  return { amount: amount - discount, discount };
}
route('POST', '/api/coupon', ({ body }) => {
  const s = db.services.find((x) => x.id === body.serviceId); must(s, 'Service not found', 404);
  return price(s, body.code);
}, ['user']);

route('POST', '/api/bookings', ({ sess, body }) => {
  const { providerId, serviceId, date, time, address, notes = '', paymentMethod = 'cash', coupon } = body;
  const p = db.providers.find((x) => x.id === providerId && x.verified); must(p, 'Provider not found', 404);
  const s = db.services.find((x) => x.id === serviceId && x.category === p.serviceType); must(s, 'Service not offered by this provider');
  must(date && time, 'Select a date and time');
  must(address && address.trim().length >= 5, 'Please enter the service address');
  must(['cash', 'upi', 'card'].includes(paymentMethod), 'Invalid payment method');
  const today = new Date().toISOString().slice(0, 10);
  must(date >= today, 'Date cannot be in the past');
  const av = isAvailable(p, date, time); must(av.ok, 'Provider unavailable: ' + av.reason, 409);
  const { amount, discount } = price(s, coupon);
  const b = { id: uid('b'), userId: sess.user.id, providerId, serviceId, date, time, address: address.trim(), notes, status: 'pending', createdAt: now(), history: [{ at: now(), status: 'pending' }], payment: { method: paymentMethod, status: 'unpaid', amount, discount } };
  db.bookings.push(b);
  notify(p.userId, `New booking request from ${sess.user.name} for ${s.name} on ${date} at ${time}.`);
  notify(sess.user.id, `Your request for ${s.name} with ${p.name} was sent.`);
  save();
  return bookingView(b);
}, ['user']);

route('GET', '/api/bookings', ({ sess, query }) => {
  const u = sess.user; let list = db.bookings;
  if (u.role === 'user') list = list.filter((b) => b.userId === u.id);
  else if (u.role === 'provider') { const p = myProvider(u); list = list.filter((b) => p && b.providerId === p.id); }
  if (query.status) list = list.filter((b) => b.status === query.status);
  return list.map(bookingView).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}, true);

function bookingFor(sess, id) {
  const b = db.bookings.find((x) => x.id === id); must(b, 'Booking not found', 404);
  const p = db.providers.find((x) => x.id === b.providerId);
  const u = sess.user;
  must(u.role === 'admin' || b.userId === u.id || (p && p.userId === u.id), 'Not allowed', 403);
  return { b, p };
}
function setStatus(b, status) { b.status = status; (b.history = b.history || []).push({ at: now(), status }); }

route('POST', '/api/bookings/:id/action', ({ sess, params, body }) => {
  const { b, p } = bookingFor(sess, params.id); const u = sess.user; const a = body.action;
  const isProv = p && p.userId === u.id, isCust = b.userId === u.id;
  const s = db.services.find((x) => x.id === b.serviceId);
  if (a === 'accept') { must(isProv && b.status === 'pending', 'Cannot accept'); setStatus(b, 'confirmed'); notify(b.userId, `✅ Booking confirmed: ${s.name} on ${b.date} at ${b.time}.`); notify(b.userId, `🧑‍🔧 Technician assigned: ${p.name} (${p.phone}) will visit you.`); }
  else if (a === 'start') { must(isProv && b.status === 'confirmed', 'Only confirmed jobs can be started'); setStatus(b, 'in_progress'); notify(b.userId, `🔧 ${p.name} has started your ${s.name} service.`); }
  else if (a === 'cash') { must(isProv && b.payment.method === 'cash' && b.payment.status === 'unpaid' && ['in_progress', 'completed'].includes(b.status), 'Cash can be recorded once service has started'); Object.assign(b.payment, { status: 'paid', paidAt: now(), txn: 'CASH' + crypto.randomBytes(3).toString('hex').toUpperCase() }); notify(b.userId, `Cash payment of ₹${b.payment.amount} recorded. Thank you!`); }
  else if (a === 'reject') { must(isProv && b.status === 'pending', 'Cannot reject'); setStatus(b, 'rejected'); notify(b.userId, `${p.name} declined your ${s.name} request. Try another provider.`); }
  else if (a === 'complete') { must(isProv && ['confirmed', 'in_progress'].includes(b.status), 'Only confirmed or in-progress jobs can be completed'); setStatus(b, 'completed'); notify(b.userId, `🎉 Your ${s.name} service is complete. Your invoice is ready - please rate ${p.name}!`); }
  else if (a === 'cancel') {
    must((isCust || isProv) && ['pending', 'confirmed'].includes(b.status), 'Cannot cancel once service has started');
    setStatus(b, 'cancelled');
    if (b.payment.status === 'paid') b.payment.status = 'refunded';
    notify(isCust ? p.userId : b.userId, `Booking for ${s.name} on ${b.date} was cancelled by ${u.name}.`);
  } else if (a === 'reschedule') {
    must(isCust && ['pending', 'confirmed'].includes(b.status), 'Cannot reschedule');
    const av = isAvailable(p, body.date, body.time); must(av.ok || (b.date === body.date && b.time === body.time), 'Provider unavailable: ' + av.reason, 409);
    must(body.date >= new Date().toISOString().slice(0, 10), 'Date cannot be in the past');
    b.date = body.date; b.time = body.time; setStatus(b, 'pending');
    notify(p.userId, `${u.name} rescheduled ${s.name} to ${b.date} at ${b.time}. Please re-confirm.`);
  } else throw bad('Unknown action');
  save();
  return bookingView(b);
}, true);

const luhn = (n) => { let sum = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; };
route('POST', '/api/bookings/:id/pay', ({ sess, params, body }) => {
  const { b, p } = bookingFor(sess, params.id);
  must(b.userId === sess.user.id, 'Only the customer can pay', 403);
  must(b.payment.status === 'unpaid', 'Already settled');
  must(['confirmed', 'in_progress', 'completed'].includes(b.status), 'You can pay once the provider confirms');
  const method = body.method || b.payment.method;
  must(['upi', 'card'].includes(method), 'Cash is collected by the technician - choose UPI or card to pay online');
  if (method === 'upi') must(/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(body.upiId || ''), 'Enter a valid UPI ID (e.g. name@upi)');
  else {
    const num = String(body.cardNumber || '').replace(/\s/g, '');
    must(/^\d{13,19}$/.test(num) && luhn(num), 'Invalid card number');
    must(/^(0[1-9]|1[0-2])\/\d{2}$/.test(body.expiry || ''), 'Expiry must be MM/YY');
    must(/^\d{3,4}$/.test(body.cvv || ''), 'Invalid CVV');
    b.payment.last4 = num.slice(-4); // only the last 4 digits are ever kept
  }
  if (method === 'upi') b.payment.upiId = body.upiId;
  b.payment.method = method; b.payment.status = 'paid'; b.payment.paidAt = now(); b.payment.txn = 'TXN' + crypto.randomBytes(4).toString('hex').toUpperCase();
  notify(p.userId, `Payment of ₹${b.payment.amount} received (${method.toUpperCase()}).`);
  notify(b.userId, `Payment of ₹${b.payment.amount} successful. Txn ${b.payment.txn}.`);
  save();
  return bookingView(b);
}, ['user']);

/* digital invoice */
route('GET', '/api/bookings/:id/invoice', ({ sess, params }) => {
  const { b, p } = bookingFor(sess, params.id);
  must(b.status === 'completed', 'Invoice is available once the service is completed');
  const s = db.services.find((x) => x.id === b.serviceId), u = db.users.find((x) => x.id === b.userId);
  const gross = b.payment.amount + (b.payment.discount || 0);
  return {
    invoiceNo: 'INV-' + b.id.slice(2).toUpperCase(), issuedAt: (b.history || []).filter((h) => h.status === 'completed').map((h) => h.at)[0] || b.createdAt,
    customer: { name: u.name, phone: u.phone, email: u.email, address: b.address }, provider: { name: p.name, phone: p.phone, location: p.location },
    service: { name: s.name, category: s.category }, bookingId: b.id, date: b.date, time: b.time,
    price: gross, discount: b.payment.discount || 0, total: b.payment.amount,
    payment: { method: b.payment.method, status: b.payment.status, txn: b.payment.txn || null, paidAt: b.payment.paidAt || null, last4: b.payment.last4 || null },
  };
}, true);

/* complaints & support */
const ctView = (c) => ({ ...c, userName: (db.users.find((u) => u.id === c.userId) || {}).name, bookingLabel: c.bookingId ? (() => { const b = db.bookings.find((x) => x.id === c.bookingId); const s = b && db.services.find((x) => x.id === b.serviceId); return b ? `${s ? s.name : ''} on ${b.date}` : null; })() : null });
route('POST', '/api/complaints', ({ sess, body }) => {
  const { subject, message, category = 'other', bookingId } = body;
  must(subject && subject.trim().length >= 3, 'Please enter a subject');
  must(message && message.trim().length >= 10, 'Please describe the issue (at least 10 characters)');
  must(['service_quality', 'billing', 'technician_behaviour', 'delay', 'app_issue', 'other'].includes(category), 'Invalid category');
  if (bookingId) must(db.bookings.some((b) => b.id === bookingId && b.userId === sess.user.id), 'Booking not found', 404);
  const c = { id: uid('c'), ticket: 'SH-' + String(db.complaints.length + 1001), userId: sess.user.id, bookingId: bookingId || null, category, subject: subject.trim(), message: message.trim(), status: 'open', response: '', createdAt: now(), updatedAt: now() };
  db.complaints.push(c);
  db.users.filter((x) => x.role === 'admin').forEach((a) => notify(a.id, `New complaint ${c.ticket}: ${c.subject}`));
  notify(sess.user.id, `Your complaint ${c.ticket} has been received. We'll get back to you soon.`);
  save(); return ctView(c);
}, ['user', 'provider']);
route('GET', '/api/complaints', ({ sess }) => db.complaints.filter((c) => sess.user.role === 'admin' || c.userId === sess.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(ctView), true);
route('POST', '/api/complaints/:id/update', ({ sess, params, body }) => {
  const c = db.complaints.find((x) => x.id === params.id); must(c, 'Not found', 404);
  must(['open', 'in_review', 'resolved'].includes(body.status), 'Invalid status');
  c.status = body.status; if (body.response !== undefined) c.response = String(body.response).slice(0, 1000); c.updatedAt = now();
  notify(c.userId, `Complaint ${c.ticket} is now "${c.status.replace('_', ' ')}"${c.response ? ': ' + c.response : '.'}`);
  save(); return ctView(c);
}, ['admin']);

route('POST', '/api/bookings/:id/feedback', ({ sess, params, body }) => {
  const { b, p } = bookingFor(sess, params.id);
  must(b.userId === sess.user.id, 'Only the customer can review', 403);
  must(b.status === 'completed', 'You can review after the service is completed');
  must(!db.feedback.some((f) => f.bookingId === b.id), 'Already reviewed');
  const rating = Number(body.rating); must(rating >= 1 && rating <= 5, 'Rating must be 1-5');
  db.feedback.push({ id: uid('f'), bookingId: b.id, userId: sess.user.id, providerId: b.providerId, rating, comment: String(body.comment || '').slice(0, 500), createdAt: now() });
  notify(p.userId, `${sess.user.name} rated you ${rating}★.`);
  save();
  return bookingView(b);
}, ['user']);

/* provider */
route('GET', '/api/provider/stats', ({ sess }) => {
  const p = myProvider(sess.user); must(p, 'No provider profile', 404);
  const bs = db.bookings.filter((b) => b.providerId === p.id);
  const earned = bs.filter((b) => b.payment.status === 'paid').reduce((a, b) => a + b.payment.amount, 0);
  const month = new Date().toISOString().slice(0, 7);
  return { ...ratingOf(p.id), total: bs.length, pending: bs.filter((b) => b.status === 'pending').length, upcoming: bs.filter((b) => ['confirmed', 'in_progress'].includes(b.status)).length, inProgress: bs.filter((b) => b.status === 'in_progress').length, completed: bs.filter((b) => b.status === 'completed').length, earned, earnedMonth: bs.filter((b) => b.payment.status === 'paid' && (b.payment.paidAt || b.createdAt).startsWith(month)).reduce((a, b) => a + b.payment.amount, 0), verified: p.verified };
}, ['provider']);
route('PUT', '/api/provider/profile', ({ sess, body }) => {
  const p = myProvider(sess.user); must(p, 'No provider profile', 404);
  if (body.bio !== undefined) p.bio = String(body.bio).slice(0, 400);
  if (body.rate) p.rate = Math.max(0, Number(body.rate));
  if (body.experience !== undefined) p.experience = Math.max(0, Number(body.experience));
  if (body.skills !== undefined) p.skills = parseList(body.skills);
  if (body.serviceAreas !== undefined) { const a = parseList(body.serviceAreas); p.serviceAreas = a.length ? a : [p.location]; }
  if (Array.isArray(body.availableDays)) p.availableDays = body.availableDays.map(Number).filter((n) => n >= 0 && n <= 6);
  if (body.startHour !== undefined && body.endHour !== undefined) { must(Number(body.startHour) < Number(body.endHour), 'End time must be after start'); p.startHour = Number(body.startHour); p.endHour = Number(body.endHour); }
  save();
  return { provider: p };
}, ['provider']);

/* notifications */
route('GET', '/api/notifications', ({ sess }) => db.notifications.filter((n) => n.userId === sess.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50), true);
route('POST', '/api/notifications/read', ({ sess }) => { db.notifications.forEach((n) => { if (n.userId === sess.user.id) n.read = true; }); save(); return { ok: true }; }, true);

/* admin */
route('GET', '/api/admin/stats', () => {
  const paid = db.bookings.filter((b) => b.payment.status === 'paid');
  const byStatus = {}; db.bookings.forEach((b) => { byStatus[b.status] = (byStatus[b.status] || 0) + 1; });
  const byCategory = CATEGORIES.map((c) => ({ ...c, bookings: db.bookings.filter((b) => (db.services.find((s) => s.id === b.serviceId) || {}).category === c.id).length, providers: db.providers.filter((p) => p.serviceType === c.id && p.verified).length }));
  return {
    users: db.users.filter((u) => u.role === 'user').length, providers: db.providers.length, pendingVerification: db.providers.filter((p) => !p.verified).length,
    bookings: db.bookings.length, revenue: paid.reduce((a, b) => a + b.payment.amount, 0), byStatus, byCategory,
    pendingBookings: byStatus.pending || 0, completedServices: byStatus.completed || 0, inProgress: byStatus.in_progress || 0,
    openComplaints: db.complaints.filter((c) => c.status !== 'resolved').length, totalComplaints: db.complaints.length,
    popular: [...byCategory].sort((a, b) => b.bookings - a.bookings).slice(0, 5),
    monthly: (() => { const out = []; const d = new Date(); d.setDate(1); for (let i = 5; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); const k = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'); out.push({ month: k, label: m.toLocaleString('en', { month: 'short' }), bookings: db.bookings.filter((b) => b.date.startsWith(k)).length, revenue: paid.filter((b) => b.date.startsWith(k)).reduce((a, b) => a + b.payment.amount, 0) }); } return out; })(),
    topProviders: db.providers.map((p) => ({ name: p.name, ...ratingOf(p.id), jobs: jobsDone(p.id) })).filter((p) => p.reviews).sort((a, b) => b.rating - a.rating || b.jobs - a.jobs).slice(0, 5),
    avgRating: db.feedback.length ? Math.round((db.feedback.reduce((a, f) => a + f.rating, 0) / db.feedback.length) * 10) / 10 : 0,
  };
}, ['admin']);
route('GET', '/api/admin/providers', () => db.providers.map((p) => ({ ...providerView(p), email: (db.users.find((u) => u.id === p.userId) || {}).email, blocked: (db.users.find((u) => u.id === p.userId) || {}).blocked })), ['admin']);
route('GET', '/api/admin/users', () => db.users.filter((u) => u.role !== 'admin').map(publicUser), ['admin']);
route('POST', '/api/admin/providers/:id/verify', ({ params, body }) => {
  const p = db.providers.find((x) => x.id === params.id); must(p, 'Not found', 404);
  p.verified = body.verified !== false;
  notify(p.userId, p.verified ? 'Your profile is verified. You can now receive bookings!' : 'Your verification was revoked by the admin.');
  save(); return p;
}, ['admin']);
route('POST', '/api/admin/users/:id/block', ({ params, body }) => {
  const u = db.users.find((x) => x.id === params.id); must(u && u.role !== 'admin', 'Not found', 404);
  u.blocked = body.blocked !== false;
  if (u.blocked) for (const [t, id] of sessions) if (id === u.id) sessions.delete(t);
  save(); return publicUser(u);
}, ['admin']);
route('GET', '/api/admin/bookings.csv', () => {
  const rows = [['id', 'customer', 'provider', 'service', 'date', 'time', 'status', 'payment', 'amount']];
  db.bookings.map(bookingView).forEach((b) => rows.push([b.id, b.userName, b.providerName, b.serviceName, b.date, b.time, b.status, b.payment.status, b.payment.amount]));
  return { __csv: rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') };
}, ['admin']);

/* ---------------- http server ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) { reject(new HttpError(413, 'Body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(bad('Invalid JSON')); } });
  });
}
const send = (res, code, data, type = 'application/json', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, ...extra });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
};

async function handleApi(req, res, url) {
  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  if (!r) return send(res, 404, { error: 'Not found' });
  const m = url.pathname.match(r.re);
  const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
  const sess = session(req);
  if (r.auth) {
    if (!sess) return send(res, 401, { error: 'Please log in' });
    if (Array.isArray(r.auth) && !r.auth.includes(sess.user.role)) return send(res, 403, { error: 'Not allowed for your role' });
  }
  const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
  const out = r.handler({ req, params, query: Object.fromEntries(url.searchParams), body, sess });
  if (out && out.__csv !== undefined) return send(res, 200, out.__csv, 'text/csv', { 'Content-Disposition': 'attachment; filename="bookings.csv"' });
  send(res, 200, out);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.code, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Server error' });
  }
});

process.on('SIGINT', () => { saveNow(); process.exit(0); });
process.on('SIGTERM', () => { saveNow(); process.exit(0); });
server.listen(PORT, () => {
  console.log('\n  Service Hub is running  ->  http://localhost:' + PORT);
  console.log('  Admin:    admin@servicehub.com / admin123');
  console.log('  Customer: user@servicehub.com / user123');
  console.log('  Provider: ramesh@servicehub.com / provider123\n');
});
