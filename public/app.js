/* Service Hub front-end (vanilla JS single-page app) */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtH = (h) => (h % 12 || 12) + (h < 12 ? ' AM' : ' PM');
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const stars = (r) => `<span class="stars">${'★'.repeat(Math.round(r))}${'☆'.repeat(5 - Math.round(r))}</span>`;
const today = () => new Date().toISOString().slice(0, 10);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

let state = { token: store.get('sh_token'), user: null, provider: null, meta: { categories: [], locations: [] } };

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && state.token) { logoutLocal(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3200);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };
function modal(html) { $('#modal-box').innerHTML = html; $('#modal').classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
const catName = (id) => (state.meta.categories.find((c) => c.id === id) || {}).name || id;
const catIcon = (id) => (state.meta.categories.find((c) => c.id === id) || {}).icon || '🛠️';

/* ---------- session ---------- */
function logoutLocal() { state.token = null; state.user = null; state.provider = null; store.set('sh_token', ''); renderNav(); }
async function loadMe() {
  if (!state.token) return;
  try { const r = await api('/me'); state.user = r.user; state.provider = r.provider; } catch { logoutLocal(); }
}
function setSession(r) { state.token = r.token; state.user = r.user; store.set('sh_token', r.token); }

/* ---------- nav ---------- */
function renderNav() {
  const u = state.user; const r = u && u.role; const h = location.hash || '#/';
  const L = [['#/', 'Home'], ['#/providers', 'Find Services'], ['#/ml-lab', 'ML Lab']];
  if (r === 'user') L.push(['#/bookings', 'My Bookings'], ['#/favorites', 'Favorites'], ['#/support', 'Support']);
  if (r === 'provider') L.push(['#/dashboard', 'Dashboard'], ['#/bookings', 'Job Requests'], ['#/support', 'Support']);
  if (r === 'admin') L.push(['#/admin', 'Admin Panel']);
  $('#links').innerHTML = L.map(([href, t]) => `<a href="${href}" class="${h === href ? 'on' : ''}">${t}</a>`).join('');
  $('#auth-area').innerHTML = u
    ? `<a href="#/profile" class="btn sec sm">👤 ${esc(u.name.split(' ')[0])}</a> <button class="btn ghost sm" id="logout">Logout</button>`
    : `<a href="#/login" class="btn ghost sm">Login</a> <a href="#/register" class="btn sm">Sign up</a>`;
  $('#bell-wrap').classList.toggle('hidden', !u);
  const lo = $('#logout'); if (lo) lo.onclick = guard(async () => { await api('/logout', { method: 'POST' }).catch(() => {}); logoutLocal(); location.hash = '#/'; toast('Logged out'); });
  refreshNotifs();
}
let notifs = [];
async function refreshNotifs() {
  if (!state.user) return;
  try { notifs = await api('/notifications'); } catch { return; }
  const n = notifs.filter((x) => !x.read).length; const b = $('#badge');
  b.textContent = n; b.classList.toggle('hidden', !n);
  $('#notif').innerHTML = notifs.length ? notifs.map((x) => `<div class="n ${x.read ? '' : 'unread'}">${esc(x.text)}<small>${new Date(x.createdAt).toLocaleString()}</small></div>`).join('') : '<div class="n muted">No notifications yet</div>';
}
$('#bell').onclick = guard(async () => {
  const d = $('#notif'); d.classList.toggle('hidden');
  if (!d.classList.contains('hidden') && notifs.some((x) => !x.read)) { await api('/notifications/read', { method: 'POST' }); setTimeout(refreshNotifs, 1500); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('#bell-wrap')) $('#notif').classList.add('hidden'); });
setInterval(refreshNotifs, 20000);
$('#theme').onclick = () => { const d = document.documentElement; const n = d.dataset.theme === 'dark' ? 'light' : 'dark'; d.dataset.theme = n; store.set('sh_theme', n); };
document.documentElement.dataset.theme = store.get('sh_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/* ---------- router ---------- */
const view = (html) => { $('#app').innerHTML = html; window.scrollTo(0, 0); };
const need = (...roles) => {
  if (!state.user) { location.hash = '#/login'; return false; }
  if (roles.length && !roles.includes(state.user.role)) { view('<div class="empty">Not available for your account type.</div>'); return false; }
  return true;
};
async function router() {
  renderNav();
  const [path, qs] = (location.hash.slice(1) || '/').split('?'); const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const parts = path.split('/').filter(Boolean);
  try {
    if (!parts.length) return await pageHome();
    switch (parts[0]) {
      case 'providers': return await pageProviders(q);
      case 'ml-lab': return await pageMLLab();
      case 'provider': return await pageProvider(parts[1], q);
      case 'login': return pageLogin();
      case 'register': return pageRegister();
      case 'bookings': return need('user', 'provider') && await pageBookings();
      case 'support': return need('user', 'provider') && await pageSupport();
      case 'favorites': return need('user') && await pageFavorites();
      case 'dashboard': return need('provider') && await pageDashboard();
      case 'admin': return need('admin') && await pageAdmin();
      case 'profile': return need() && pageProfile();
      default: view('<div class="empty">Page not found.</div>');
    }
  } catch (e) { view(`<div class="empty">⚠️ ${esc(e.message)}</div>`); }
}
window.addEventListener('hashchange', router);


/* ---------- machine-learning lab ---------- */
async function pageMLLab() {
  const meta = await api('/meta');
  view(`
  <section class="hero">
    <h1>🤖 Service Hub ML Lab</h1>
    <p>Explore three machine-learning features connected to the Service Hub project.</p>
  </section>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start">
    <section class="card">
      <h2>1. Service Classification</h2>
      <p class="muted">TF-IDF + Logistic Regression predicts a service category from a customer's description.</p>
      <form id="ml-classify">
        <label>Describe the problem</label>
        <textarea name="text" rows="4" required placeholder="Example: My air conditioner is not cooling"></textarea>
        <button class="btn">Predict service</button>
      </form>
      <div id="ml-classify-result" style="margin-top:12px"></div>
    </section>
    <section class="card">
      <h2>2. Service Demand Prediction</h2>
      <p class="muted">Random Forest Regressor estimates an illustrative demand score for a category and period.</p>
      <form id="ml-demand">
        <label>Service category</label>
        <select name="category">${meta.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
        <label>Month</label><select name="month">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i+1===new Date().getMonth()+1?'selected':''}>${new Date(2020,i,1).toLocaleString(undefined,{month:'long'})}</option>`).join('')}</select>
        <label>Day of week</label><select name="weekday">${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((x,i)=>`<option value="${i}">${x}</option>`).join('')}</select>
        <button class="btn">Predict demand</button>
      </form>
      <div id="ml-demand-result" style="margin-top:12px"></div>
    </section>
    <section class="card">
      <h2>3. Technician Recommendation</h2>
      <p class="muted">Random Forest Classifier ranks verified technicians using category fit, location, rating, experience, and availability.</p>
      <form id="ml-recommend">
        <label>Service category</label>
        <select name="category">${meta.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select>
        <label>Preferred location</label>
        <select name="location"><option value="">Any location</option>${meta.locations.map(l => `<option>${esc(l)}</option>`).join('')}</select>
        <button class="btn">Recommend technicians</button>
      </form>
      <div id="ml-recommend-result" style="margin-top:12px"></div>
    </section>
  </div>
  <p class="muted" style="margin-top:18px;font-size:13px">Academic prototype note: the bundled models use example/synthetic training data to demonstrate the pipeline. Their outputs are not validated real-world forecasts. Replace the sample training data with actual, consented booking and service records before making operational decisions.</p>
  `);

  const submitML = (formId, endpoint, resultId, renderResult) => {
    const f = document.getElementById(formId);
    f.onsubmit = guard(async (e) => {
      e.preventDefault();
      const target = document.getElementById(resultId);
      target.innerHTML = '<div class="muted">Running model…</div>';
      try {
        const payload = Object.fromEntries(new FormData(f));
        const result = await api(endpoint, { body: payload });
        target.innerHTML = renderResult(result);
      } catch (err) {
        target.innerHTML = `<div class="tag bad">${esc(err.message)}<br>Check Python and install <code>ml/requirements.txt</code>.</div>`;
      }
    });
  };
  submitML('ml-classify','/ml/classify','ml-classify-result',r =>
    `<div class="card" style="background:var(--soft)"><b>Predicted category:</b> ${esc(r.categoryName || r.category)}<div class="muted">Model: ${esc(r.model)} · Demo confidence: ${Math.round((r.confidence||0)*100)}%</div><div style="font-size:13px;margin-top:6px">${esc(r.note || '')}</div></div>`);
  submitML('ml-demand','/ml/demand','ml-demand-result',r =>
    `<div class="card" style="background:var(--soft)"><b>Estimated demand score: ${Number(r.prediction).toFixed(1)} / 100</b><div class="muted">Model: ${esc(r.model)}</div><div style="font-size:13px;margin-top:6px">${esc(r.note || '')}</div></div>`);
  submitML('ml-recommend','/ml/recommend-technician','ml-recommend-result',r =>
    `<div class="muted" style="margin-bottom:8px">Model: ${esc(r.model)} · ${esc(r.note || '')}</div>${r.recommendations.length ? r.recommendations.map((p,i)=>`<div class="card" style="margin-bottom:8px"><b>${i+1}. ${esc(p.name)}</b><div>${esc(p.serviceType)} · ${esc(p.location)}</div><div class="muted">Rating ${Number(p.rating).toFixed(1)} ★ · ${p.experience} years' experience · Match score ${Math.round(p.score*100)}%</div></div>`).join('') : '<div class="muted">No eligible technicians found.</div>'}`);
}

/* ---------- home ---------- */
async function pageHome() {
  const ps = await api('/providers?sort=rating');
  view(`
  <section class="hero">
    <h1>Trusted home services, one tap away</h1>
    <p>Book verified plumbers, electricians, technicians and more near you. Smart matching by location and availability.</p>
    <form class="searchbar" id="hs">
      <input name="q" placeholder="What do you need? (e.g. tap repair)">
      <select name="location"><option value="">Any location</option>${state.meta.locations.map((l) => `<option>${l}</option>`).join('')}</select>
      <button class="btn">Search</button>
    </form>
  </section>
  <h2>Browse by category</h2>
  <div class="grid" style="margin-bottom:28px">${state.meta.categories.map((c) => `<a class="card cat" href="#/providers?category=${c.id}" style="color:inherit"><div class="ic">${c.icon}</div><b>${c.name}</b></a>`).join('')}</div>
  <h2>How it works</h2>
  <div class="steps">${[['1. Sign up', 'Create your free account'], ['2. Search', 'Pick a service, location & time'], ['3. Choose', 'Compare ratings, price, match score'], ['4. Book', 'Confirm slot, apply coupon, pay'], ['5. Rate', 'Share feedback after the job']].map(([a, b]) => `<div class="card"><b>${a}</b><div class="muted">${b}</div></div>`).join('')}</div>
  <h2>Top-rated professionals</h2>
  <div class="grid">${ps.slice(0, 6).map(provCard).join('')}</div>
  <p class="muted" style="margin-top:24px">🎟️ Try coupon codes <b>WELCOME10</b> or <b>HUB20</b> at checkout.</p>`);
  $('#hs').onsubmit = (e) => { e.preventDefault(); const f = new FormData(e.target); location.hash = '#/providers?' + new URLSearchParams([...f].filter(([, v]) => v)); };
  bindFavs();
}

function provCard(p) {
  return `<div class="card prov">
    ${state.user && state.user.role === 'user' ? `<button class="fav" data-fav="${p.id}" title="Favorite">${p.favorite ? '❤️' : '🤍'}</button>` : ''}
    <div class="top"><div class="avatar">${p.icon || '🛠️'}</div><div><b>${esc(p.name)}</b><div class="muted" style="font-size:13px">${esc(p.categoryName)} · 📍 ${esc(p.location)}</div></div></div>
    <div>${stars(p.rating)} <span class="muted">${p.rating || 'New'} (${p.reviews})</span> · <span class="match">${p.match}% match</span></div>
    <div>${(p.skills || []).slice(0, 3).map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>
    <div class="muted" style="font-size:13px">${p.experience} yrs exp · ${p.jobsDone} jobs · from ${inr(p.rate)}/visit</div>
    <div>${p.available ? '<span class="tag ok">Available</span>' : `<span class="tag bad">${esc(p.unavailableReason || 'Unavailable')}</span>`} <span class="tag">✔ Verified</span></div>
    <a class="btn sm" style="text-align:center;margin-top:4px" href="#/provider/${p.id}${p._qs || ''}">View & Book</a>
  </div>`;
}
function bindFavs() {
  document.querySelectorAll('[data-fav]').forEach((b) => b.onclick = guard(async (e) => {
    e.preventDefault(); const r = await api('/favorites/' + b.dataset.fav, { method: 'POST' });
    b.textContent = r.favorites.includes(b.dataset.fav) ? '❤️' : '🤍'; state.user.favorites = r.favorites;
  }));
}

/* ---------- provider search ---------- */
async function pageProviders(q) {
  const f = { category: '', location: state.user?.location || '', q: '', date: '', time: '', sort: 'match', minRating: '', maxRate: '', availableOnly: '', ...q };
  const catSel = `<option value="">All</option>` + state.meta.categories.map((c) => `<option value="${c.id}" ${f.category === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');
  view(`<h1>Find a professional</h1>
  <form class="filters card" id="ff">
    <div><label>Search</label><input name="q" value="${esc(f.q)}" placeholder="name, skill..."></div>
    <div><label>Service type</label><select name="category">${catSel}</select></div>
    <div><label>Location</label><select name="location"><option value="">Any</option>${state.meta.locations.map((l) => `<option ${f.location === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div><label>Date</label><input type="date" name="date" min="${today()}" value="${esc(f.date)}"></div>
    <div><label>Time</label><input type="time" name="time" step="3600" value="${esc(f.time)}"></div>
    <div><label>Sort by</label><select name="sort">${[['match', 'Best match'], ['rating', 'Top rated'], ['price', 'Lowest price'], ['experience', 'Most experienced']].map(([v, t]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label>Min rating</label><select name="minRating">${['', 3, 4, 4.5].map((v) => `<option value="${v}" ${String(f.minRating) === String(v) ? 'selected' : ''}>${v ? v + '★ & up' : 'Any'}</option>`).join('')}</select></div>
    <div><label>Max price (₹)</label><input type="number" name="maxRate" min="0" step="50" value="${esc(f.maxRate)}"></div>
    <div><label>&nbsp;</label><label style="display:flex;gap:6px;align-items:center;margin:8px 0 0"><input type="checkbox" name="availableOnly" value="1" style="width:auto" ${f.availableOnly ? 'checked' : ''}> Available only</label></div>
  </form>
  <div id="plist" class="grid"><div class="empty">Loading…</div></div>`);
  const run = guard(async () => {
    const p = new URLSearchParams([...new FormData($('#ff'))].filter(([, v]) => v));
    history.replaceState(null, '', '#/providers?' + p);
    const list = await api('/providers?' + p);
    const qs = '?' + new URLSearchParams([...p].filter(([k]) => ['date', 'time', 'location'].includes(k)));
    $('#plist').innerHTML = list.length ? list.map((x) => provCard({ ...x, _qs: qs.length > 1 ? qs : '' })).join('') : '<div class="empty" style="grid-column:1/-1">No professionals match these filters. Try widening them.</div>';
    bindFavs();
  });
  $('#ff').onchange = run; $('#ff').oninput = (e) => { if (e.target.name === 'q') { clearTimeout(run.t); run.t = setTimeout(run, 300); } };
  $('#ff').onsubmit = (e) => { e.preventDefault(); run(); };
  run();
}

/* ---------- provider detail + booking ---------- */
async function pageProvider(id, q) {
  const qs = new URLSearchParams(q).toString();
  const d = await api(`/providers/${id}?${qs}`); const p = d.provider;
  view(`<a href="javascript:history.back()">← Back</a>
  <div class="grid" style="grid-template-columns:2fr 1fr;align-items:start;margin-top:10px">
   <div>
    <div class="card"><div class="top row"><div class="avatar" style="width:70px;height:70px;font-size:36px">${p.icon}</div>
      <div><h1 style="margin:0">${esc(p.name)} ${p.verified ? '<span class="tag">✔ Verified</span>' : '<span class="tag pending">Pending verification</span>'}</h1>
      <div class="muted">${esc(p.categoryName)} · 📍 ${esc(p.location)} · 📞 ${esc(p.phone)}</div>
      <div>${stars(p.rating)} ${p.rating || 'New'} (${p.reviews} reviews) · ${p.jobsDone} jobs · ${p.experience} yrs</div></div></div>
      <p>${esc(p.bio || 'No description yet.')}</p>
      ${(p.skills || []).length ? `<div style="margin:6px 0"><b>Skills:</b> ${p.skills.map((k) => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}
      <div style="margin:6px 0"><b>Service area:</b> ${(p.serviceAreas || [p.location]).map((a) => `<span class="chip">📍 ${esc(a)}</span>`).join('')}</div>
      <div><b>Working days:</b> ${p.availableDays.map((x) => DAYS[x]).join(', ')} &nbsp; <b>Hours:</b> ${fmtH(p.startHour)} – ${fmtH(p.endHour)}</div>
    </div>
    <h2 style="margin-top:22px">Services & prices</h2>
    <div class="grid">${d.services.map((s) => `<div class="card"><b>${esc(s.name)}</b><div class="muted" style="font-size:13px">${esc(s.description)}</div><div class="row between" style="margin-top:8px"><b>${inr(s.price)}</b>${state.user?.role === 'user' ? `<button class="btn sm" data-book="${s.id}">Book</button>` : ''}</div></div>`).join('')}</div>
    <h2 style="margin-top:22px">Reviews</h2>
    <div class="card">${d.reviews.length ? d.reviews.map((r) => `<div class="review">${stars(r.rating)} <b>${esc(r.userName)}</b> <span class="muted">· ${new Date(r.createdAt).toLocaleDateString()}</span><div>${esc(r.comment || '')}</div></div>`).join('') : '<div class="muted">No reviews yet.</div>'}</div>
   </div>
   <div class="card"><h3>Ready to book?</h3>
     ${p.available ? '<span class="tag ok">Available for your chosen time</span>' : `<span class="tag bad">${esc(p.unavailableReason)}</span>`}
     <p class="muted" style="font-size:14px">Choose a service on the left. You can pay after the provider confirms.</p>
     ${state.user ? (state.user.role === 'user' ? '' : '<p class="muted">Only customer accounts can book.</p>') : '<a class="btn" href="#/login">Log in to book</a>'}
   </div></div>`);
  document.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => bookModal(p, d.services.find((s) => s.id === b.dataset.book), d.booked, q));
}

function bookModal(p, s, booked, q) {
  const slots = []; for (let h = p.startHour; h < p.endHour; h++) slots.push(String(h).padStart(2, '0') + ':00');
  modal(`<h2>Book ${esc(s.name)}</h2><div class="muted">with ${esc(p.name)}</div>
  <form id="bf">
   <label>Date</label><input type="date" name="date" min="${today()}" value="${esc(q.date || '')}" required>
   <label>Time slot</label><select name="time" required></select>
   <div id="slotnote" class="muted" style="font-size:13px"></div>
   <label>Service address</label><textarea name="address" required placeholder="House no, street, landmark"></textarea>
   <label>Notes (optional)</label><input name="notes" placeholder="Anything the provider should know">
   <label>Coupon</label><div class="row" style="flex-wrap:nowrap"><input name="coupon" placeholder="e.g. WELCOME10"><button type="button" class="btn sec" id="apply">Apply</button></div>
   <label>Payment method</label><select name="paymentMethod"><option value="cash">Cash after service</option><option value="upi">UPI</option><option value="card">Card</option></select>
   <div class="card" style="margin:14px 0"><div class="row between"><span>Service price</span><span>${inr(s.price)}</span></div><div class="row between"><span>Discount</span><span id="disc">- ₹0</span></div><div class="row between"><b>Total</b><b id="total">${inr(s.price)}</b></div></div>
   <div class="row"><button class="btn">Confirm booking</button><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button></div>
  </form>`);
  const f = $('#bf');
  const refreshSlots = () => {
    const d = f.date.value; const day = d ? new Date(d + 'T00:00:00').getDay() : null;
    const taken = new Set(booked.filter((b) => b.date === d).map((b) => b.time));
    const off = d && !p.availableDays.includes(day);
    f.time.innerHTML = slots.map((t) => `<option value="${t}" ${taken.has(t) || off ? 'disabled' : ''} ${t === q.time ? 'selected' : ''}>${fmtH(+t.slice(0, 2))}${taken.has(t) ? ' (booked)' : ''}</option>`).join('');
    $('#slotnote').textContent = off ? `${p.name} doesn't work on ${DAYS[day]}. Pick another date.` : '';
    const first = [...f.time.options].find((o) => !o.disabled); if (first && f.time.selectedOptions[0]?.disabled !== false) f.time.value = first.value;
  };
  f.date.onchange = refreshSlots; refreshSlots();
  $('#apply').onclick = guard(async () => {
    const r = await api('/coupon', { body: { serviceId: s.id, code: f.coupon.value } });
    $('#disc').textContent = '- ' + inr(r.discount); $('#total').textContent = inr(r.amount); toast('Coupon applied');
  });
  f.onsubmit = guard(async (e) => {
    e.preventDefault(); if (!state.user) { location.hash = '#/login'; return; }
    const b = Object.fromEntries(new FormData(f)); if (!b.coupon) delete b.coupon;
    await api('/bookings', { body: { ...b, providerId: p.id, serviceId: s.id } });
    closeModal(); toast('Booking request sent! 🎉'); location.hash = '#/bookings'; refreshNotifs();
  });
}
window.closeModal = closeModal;

/* ---------- auth ---------- */
function pageLogin() {
  view(`<div class="card auth-box"><h2>Welcome back</h2><form id="lf"><label>Email</label><input name="email" type="email" required><label>Password</label><input name="password" type="password" required>
  <div style="margin-top:16px"><button class="btn" style="width:100%">Log in</button></div></form>
  <p class="muted" style="font-size:13px">Demo logins — click to fill:<br>
  <a href="#" data-fill="user@servicehub.com|user123">Customer</a> · <a href="#" data-fill="ramesh@servicehub.com|provider123">Provider</a> · <a href="#" data-fill="admin@servicehub.com|admin123">Admin</a></p>
  <p>New here? <a href="#/register">Create an account</a></p></div>`);
  document.querySelectorAll('[data-fill]').forEach((a) => a.onclick = (e) => { e.preventDefault(); const [em, pw] = a.dataset.fill.split('|'); const f = $('#lf'); f.email.value = em; f.password.value = pw; });
  $('#lf').onsubmit = guard(async (e) => {
    e.preventDefault(); setSession(await api('/login', { body: Object.fromEntries(new FormData(e.target)) })); await loadMe();
    toast('Welcome, ' + state.user.name); location.hash = { admin: '#/admin', provider: '#/dashboard' }[state.user.role] || '#/';
  });
}
function pageRegister() {
  view(`<div class="card auth-box"><h2>Create account</h2>
  <div class="tabs"><button type="button" class="on" data-role="user">I need services</button><button type="button" data-role="provider">I'm a professional</button></div>
  <form id="rf"><label>Full name</label><input name="name" required><label>Email</label><input name="email" type="email" required>
  <label>Phone</label><input name="phone" pattern="[0-9+ ]{10,13}" required placeholder="10-digit mobile"><label>Location</label>
  <select name="location" required><option value="">Select…</option>${state.meta.locations.map((l) => `<option>${l}</option>`).join('')}</select>
  <label>Password (min 6)</label><input name="password" type="password" minlength="6" required>
  <div id="pf" class="hidden"><label>Service type</label><select name="serviceType">${state.meta.categories.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select>
  <label>Experience (years)</label><input name="experience" type="number" min="0" value="1"><label>Price per visit (₹)</label><input name="rate" type="number" min="0" value="300"><label>About you</label><textarea name="bio"></textarea>
  <label>Skills (comma separated)</label><input name="skills" placeholder="e.g. Leak repair, Pipe fitting"><label>Service areas (comma separated)</label><input name="serviceAreas" placeholder="e.g. Gudlavalleru, Gudivada">
  <p class="muted" style="font-size:13px">Your profile becomes visible after admin verification.</p></div>
  <input type="hidden" name="role" value="user"><div style="margin-top:16px"><button class="btn" style="width:100%">Sign up</button></div></form>
  <p>Already registered? <a href="#/login">Log in</a></p></div>`);
  document.querySelectorAll('[data-role]').forEach((b) => b.onclick = () => {
    document.querySelectorAll('[data-role]').forEach((x) => x.classList.toggle('on', x === b)); $('#rf').role.value = b.dataset.role; $('#pf').classList.toggle('hidden', b.dataset.role !== 'provider');
  });
  $('#rf').onsubmit = guard(async (e) => {
    e.preventDefault(); setSession(await api('/register', { body: Object.fromEntries(new FormData(e.target)) })); await loadMe();
    toast('Account created!'); location.hash = state.user.role === 'provider' ? '#/dashboard' : '#/';
  });
}

/* ---------- bookings (customer + provider) ---------- */
const statusTag = (s) => `<span class="tag ${s}">${s.replace('_', ' ')}</span>`;
async function pageBookings() {
  const isProv = state.user.role === 'provider';
  const f = pageBookings.filter || '';
  const list = await api('/bookings' + (f ? '?status=' + f : ''));
  view(`<h1>${isProv ? 'Job requests' : 'My bookings'}</h1>
  <div class="tabs">${['', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'].map((s) => `<button class="${f === s ? 'on' : ''}" data-f="${s}">${s ? s.replace('_', ' ') : 'All'}</button>`).join('')}</div>
  ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${list.map((b) => bookingCard(b, isProv)).join('')}</div>` : `<div class="empty">Nothing here yet. ${isProv ? '' : '<a href="#/providers">Find a service →</a>'}</div>`}`);
  document.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { pageBookings.filter = b.dataset.f; pageBookings(); });
  document.querySelectorAll('[data-act]').forEach((b) => b.onclick = guard(async () => {
    const [id, a] = b.dataset.act.split(':');
    if (a === 'cancel' && !confirm('Cancel this booking?')) return;
    if (a === 'pay') { await api(`/bookings/${id}/pay`, { method: 'POST' }); toast('Payment successful ✅'); }
    else if (a === 'review') return reviewModal(list.find((x) => x.id === id));
    else if (a === 'payonline') return payModal(list.find((x) => x.id === id));
    else if (a === 'invoice') return invoiceModal(id);
    else if (a === 'issue') return complaintModal(id);
    else if (a === 'resched') return reschedModal(list.find((x) => x.id === id));
    else { await api(`/bookings/${id}/action`, { body: { action: a } }); toast(a === 'start' ? 'Service started' : 'Updated'); }
    refreshNotifs(); pageBookings();
  }));
}
function tracker(st) {
  if (['cancelled', 'rejected'].includes(st)) return '';
  const steps = [['pending', 'Requested'], ['confirmed', 'Technician assigned'], ['in_progress', 'In progress'], ['completed', 'Completed']]; const at = steps.findIndex((x) => x[0] === st);
  return `<div class="track">${steps.map(([k, t], i) => `<div class="tstep ${i <= at ? 'done' : ''} ${i === at ? 'now' : ''}"><i></i><span>${t}</span></div>`).join('')}</div>`;
}
function bookingCard(b, isProv) {
  const acts = [];
  if (isProv) {
    if (b.status === 'pending') acts.push(['accept', 'Accept', 'ok'], ['reject', 'Decline', 'bad']);
    if (b.status === 'confirmed') acts.push(['start', '▶ Start service', ''], ['cancel', 'Cancel', 'ghost']);
    if (b.status === 'in_progress') acts.push(['complete', 'Mark completed', 'ok']);
    if (b.payment.method === 'cash' && b.payment.status === 'unpaid' && ['in_progress', 'completed'].includes(b.status)) acts.push(['cash', '💵 Cash received', 'sec']);
    if (b.status === 'completed') acts.push(['invoice', '🧾 Invoice', 'ghost']);
  } else {
    if (b.payment.status === 'unpaid' && ['confirmed', 'in_progress', 'completed'].includes(b.status)) {
      if (b.payment.method === 'cash') { /* paid to technician */ } else acts.push(['payonline', `Pay ${inr(b.payment.amount)}`, '']);
      if (b.payment.method === 'cash') acts.push(['payonline', 'Pay online instead', 'sec']);
    }
    if (b.status === 'completed') acts.push(['invoice', '🧾 Invoice', 'ghost']);
    if (b.status === 'completed' && !b.feedback) acts.push(['review', '★ Rate', 'ok']);
    if (!['rejected'].includes(b.status)) acts.push(['issue', '⚠ Report issue', 'ghost']);
    if (['pending', 'confirmed'].includes(b.status)) acts.push(['resched', 'Reschedule', 'sec'], ['cancel', 'Cancel', 'ghost']);
  }
  return `<div class="card"><div class="row between"><b>${esc(b.serviceName)}</b>${statusTag(b.status)}</div>
  <div class="muted" style="font-size:14px">${isProv ? '👤 ' + esc(b.userName) + ' · 📞 ' + esc(b.userPhone) : '🧑‍🔧 <a href="#/provider/' + b.providerId + '">' + esc(b.providerName) + '</a> · 📞 ' + esc(b.providerPhone)}</div>
  ${tracker(b.status)}
  <div>📅 ${esc(b.date)} at ${esc(b.time)}</div><div class="muted" style="font-size:14px">📍 ${esc(b.address)}</div>${b.notes ? `<div class="muted" style="font-size:14px">📝 ${esc(b.notes)}</div>` : ''}
  <div class="row between" style="margin:8px 0"><span>${inr(b.payment.amount)}${b.payment.discount ? ` <span class="muted">(saved ${inr(b.payment.discount)})</span>` : ''} · ${esc(b.payment.method.toUpperCase())}</span>${statusTag(b.payment.status)}</div>
  ${b.payment.txn ? `<div class="muted" style="font-size:12px">Txn: ${esc(b.payment.txn)}</div>` : ''}
  ${b.feedback ? `<div>${stars(b.feedback.rating)} <span class="muted">${esc(b.feedback.comment)}</span></div>` : ''}
  <div class="timeline">${(b.history || []).map((h) => `${esc(h.status)} · ${new Date(h.at).toLocaleDateString()}`).join(' → ')}</div>
  <div class="row" style="margin-top:10px">${acts.map(([a, t, c]) => `<button class="btn sm ${c}" data-act="${b.id}:${a}">${t}</button>`).join('')}</div></div>`;
}
function reviewModal(b) {
  let r = 5;
  modal(`<h2>Rate ${esc(b.providerName)}</h2><div class="star-input" id="si">${[1, 2, 3, 4, 5].map((i) => `<span data-i="${i}" class="on">★</span>`).join('')}</div>
  <label>Comment</label><textarea id="cm" placeholder="How was the service?"></textarea><div class="row" style="margin-top:12px"><button class="btn" id="sub">Submit</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
  document.querySelectorAll('#si span').forEach((s) => s.onclick = () => { r = +s.dataset.i; document.querySelectorAll('#si span').forEach((x) => x.classList.toggle('on', +x.dataset.i <= r)); });
  $('#sub').onclick = guard(async () => { await api(`/bookings/${b.id}/feedback`, { body: { rating: r, comment: $('#cm').value } }); closeModal(); toast('Thanks for your feedback!'); pageBookings(); });
}
function reschedModal(b) {
  modal(`<h2>Reschedule</h2><label>New date</label><input type="date" id="rd" min="${today()}" value="${b.date}"><label>New time</label><input type="time" id="rt" step="3600" value="${b.time}">
  <p class="muted" style="font-size:13px">The provider will need to re-confirm.</p><div class="row"><button class="btn" id="rs">Save</button><button class="btn ghost" onclick="closeModal()">Cancel</button></div>`);
  $('#rs').onclick = guard(async () => { await api(`/bookings/${b.id}/action`, { body: { action: 'reschedule', date: $('#rd').value, time: $('#rt').value } }); closeModal(); toast('Rescheduled'); pageBookings(); });
}

async function pageFavorites() {
  const all = await api('/providers'); const f = all.filter((p) => p.favorite);
  view(`<h1>Favorite professionals</h1>${f.length ? `<div class="grid">${f.map(provCard).join('')}</div>` : '<div class="empty">No favorites yet — tap 🤍 on a professional.</div>'}`); bindFavs();
}

/* ---------- provider dashboard ---------- */
async function pageDashboard() {
  const [s, me] = await Promise.all([api('/provider/stats'), api('/me')]); const p = me.provider; state.provider = p;
  view(`<h1>Dashboard</h1>
  ${s.verified ? '' : '<div class="card" style="border-color:var(--accent);margin-bottom:16px">⏳ Your profile is awaiting admin verification. You will appear in search once verified.</div>'}
  <div class="stats">${[['Rating', (s.rating || '–') + ' ★'], ['Reviews', s.reviews], ['Pending requests', s.pending], ['Upcoming jobs', s.upcoming], ['In progress', s.inProgress], ['Completed', s.completed], ['Earned (all)', inr(s.earned)], ['Earned (month)', inr(s.earnedMonth)]].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
  <div class="card"><h2>Availability & profile</h2><form id="pf">
   <label>Working days</label><div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" name="d" value="${i}" ${p.availableDays.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
   <div class="row" style="margin-top:6px"><div style="flex:1"><label>Start</label><select name="startHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${p.startHour === h ? 'selected' : ''}>${fmtH(h)}</option>`).join('')}</select></div>
   <div style="flex:1"><label>End</label><select name="endHour">${Array.from({ length: 24 }, (_, h) => `<option value="${h + 1}" ${p.endHour === h + 1 ? 'selected' : ''}>${fmtH((h + 1) % 24)}</option>`).join('')}</select></div>
   <div style="flex:1"><label>Price per visit (₹)</label><input name="rate" type="number" min="0" value="${p.rate}"></div>
   <div style="flex:1"><label>Experience (yrs)</label><input name="experience" type="number" min="0" value="${p.experience}"></div></div>
   <label>Skills (comma separated)</label><input name="skills" value="${esc((p.skills || []).join(', '))}">
   <label>Service areas (comma separated)</label><input name="serviceAreas" value="${esc((p.serviceAreas || []).join(', '))}">
   <label>About</label><textarea name="bio">${esc(p.bio)}</textarea><div style="margin-top:12px"><button class="btn">Save changes</button> <a class="btn sec" href="#/bookings">View job requests</a></div></form></div>`);
  $('#pf').onsubmit = guard(async (e) => {
    e.preventDefault(); const f = e.target;
    await api('/provider/profile', { method: 'PUT', body: { availableDays: [...f.querySelectorAll('[name=d]:checked')].map((c) => +c.value), startHour: +f.startHour.value, endHour: +f.endHour.value, rate: +f.rate.value, experience: +f.experience.value, bio: f.bio.value, skills: f.skills.value, serviceAreas: f.serviceAreas.value } });
    toast('Profile updated');
  });
}

/* ---------- admin ---------- */
async function pageAdmin() {
  const tab = pageAdmin.tab || 'overview';
  const [s, provs, users, bookings, complaints] = await Promise.all([api('/admin/stats'), api('/admin/providers'), api('/admin/users'), api('/bookings'), api('/complaints')]);
  const max = Math.max(1, ...s.byCategory.map((c) => c.bookings)); const mmax = Math.max(1, ...s.monthly.map((m) => m.bookings));
  const body = {
    overview: `<div class="stats">${[['Total users', s.users], ['Providers', s.providers], ['Awaiting verification', s.pendingVerification], ['Total bookings', s.bookings], ['Pending bookings', s.pendingBookings], ['In progress', s.inProgress], ['Completed services', s.completedServices], ['Open complaints', s.openComplaints], ['Revenue', inr(s.revenue)], ['Avg rating', s.avgRating + ' ★']].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
      <div class="card"><h3>🔥 Popular service categories</h3>${s.popular.map((c, i) => `<div style="margin:8px 0"><div class="row between"><span>${i + 1}. ${c.icon} ${c.name}</span><span class="muted">${c.bookings} bookings</span></div><div class="bar"><i style="width:${(c.bookings / max) * 100}%"></i></div></div>`).join('')}</div>
      <div class="card"><h3>Bookings - last 6 months</h3><div class="mchart">${s.monthly.map((m) => `<div class="mcol" title="${m.bookings} bookings, ${inr(m.revenue)}"><b>${m.bookings}</b><i style="height:${(m.bookings / mmax) * 100}%"></i><span>${m.label}</span></div>`).join('')}</div></div>
      <div class="card"><h3>Bookings by status</h3>${Object.entries(s.byStatus).map(([k, v]) => `<div class="row between" style="margin:8px 0">${statusTag(k)}<b>${v}</b></div>`).join('') || '<span class="muted">No bookings</span>'}<button class="btn sec" id="csv" style="margin-top:12px">⬇ Export bookings CSV</button></div>
      <div class="card"><h3>⭐ Top-rated providers</h3>${s.topProviders.map((p) => `<div class="row between" style="margin:8px 0"><span>${esc(p.name)}</span><span>${stars(p.rating)} <span class="muted">${p.rating} · ${p.jobs} jobs</span></span></div>`).join('')}</div></div>`,
    providers: `<div class="tablewrap"><table><tr><th>Name</th><th>Service</th><th>Location</th><th>Exp</th><th>Rating</th><th>Status</th><th></th></tr>${provs.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="muted">${esc(p.email)}</div></td><td>${esc(p.categoryName)}</td><td>${esc(p.location)}</td><td>${p.experience}y</td><td>${p.rating || '–'} (${p.reviews})</td><td>${p.verified ? '<span class="tag ok">Verified</span>' : '<span class="tag pending">Pending</span>'} ${p.blocked ? '<span class="tag bad">Blocked</span>' : ''}</td><td class="row"><button class="btn sm ${p.verified ? 'ghost' : 'ok'}" data-v="${p.id}:${p.verified ? 0 : 1}">${p.verified ? 'Revoke' : 'Verify'}</button><button class="btn sm ghost" data-b="${p.userId}:${p.blocked ? 0 : 1}">${p.blocked ? 'Unblock' : 'Block'}</button></td></tr>`).join('')}</table></div>`,
    users: `<div class="tablewrap"><table><tr><th>Name</th><th>Email</th><th>Role</th><th>Location</th><th>Joined</th><th></th></tr>${users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${esc(u.location)}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td><td><button class="btn sm ghost" data-b="${u.id}:${u.blocked ? 0 : 1}">${u.blocked ? 'Unblock' : 'Block'}</button></td></tr>`).join('')}</table></div>`,
    bookings: `<div class="tablewrap"><table><tr><th>Date</th><th>Customer</th><th>Provider</th><th>Service</th><th>Status</th><th>Payment</th></tr>${bookings.map((b) => `<tr><td>${esc(b.date)} ${esc(b.time)}</td><td>${esc(b.userName)}</td><td>${esc(b.providerName)}</td><td>${esc(b.serviceName)}</td><td>${statusTag(b.status)}</td><td>${inr(b.payment.amount)} ${statusTag(b.payment.status)}</td></tr>`).join('')}</table></div>`,
    complaints: complaints.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(360px,1fr))">${complaints.map((c) => `<div class="card"><div class="row between"><b>${esc(c.ticket)}</b>${ctTag(c.status)}</div><b>${esc(c.subject)}</b>
      <div class="muted" style="font-size:13px">${esc(c.userName)} · ${esc(CT_CATS[c.category])}${c.bookingLabel ? ' · ' + esc(c.bookingLabel) : ''}</div><p>${esc(c.message)}</p>
      <textarea id="r_${c.id}" placeholder="Reply to customer…">${esc(c.response)}</textarea><div class="row" style="margin-top:8px">${['open', 'in_review', 'resolved'].map((st) => `<button class="btn sm ${c.status === st ? '' : 'ghost'}" data-c="${c.id}:${st}">${st.replace('_', ' ')}</button>`).join('')}</div></div>`).join('')}</div>` : '<div class="empty">No complaints.</div>',
  }[tab];
  view(`<h1>Admin panel</h1><div class="tabs">${['overview', 'providers', 'users', 'bookings', 'complaints'].map((t) => `<button class="${tab === t ? 'on' : ''}" data-t="${t}">${t[0].toUpperCase() + t.slice(1)}${t === 'providers' && s.pendingVerification ? ` (${s.pendingVerification} pending)` : ''}${t === 'complaints' && s.openComplaints ? ` (${s.openComplaints} open)` : ''}</button>`).join('')}</div>${body}`);
  document.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { pageAdmin.tab = b.dataset.t; pageAdmin(); });
  document.querySelectorAll('[data-v]').forEach((b) => b.onclick = guard(async () => { const [id, v] = b.dataset.v.split(':'); await api(`/admin/providers/${id}/verify`, { body: { verified: v === '1' } }); toast('Updated'); pageAdmin(); }));
  document.querySelectorAll('[data-b]').forEach((b) => b.onclick = guard(async () => { const [id, v] = b.dataset.b.split(':'); await api(`/admin/users/${id}/block`, { body: { blocked: v === '1' } }); toast('Updated'); pageAdmin(); }));
  document.querySelectorAll('[data-c]').forEach((b) => b.onclick = guard(async () => { const [id, st] = b.dataset.c.split(':'); await api(`/complaints/${id}/update`, { body: { status: st, response: $('#r_' + id).value } }); toast('Complaint updated'); pageAdmin(); }));
  const c = $('#csv'); if (c) c.onclick = guard(async () => {
    const r = await fetch('/api/admin/bookings.csv', { headers: { Authorization: 'Bearer ' + state.token } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'bookings.csv'; a.click();
  });
}

/* ---------- profile ---------- */
function pageProfile() {
  const u = state.user;
  view(`<div class="card auth-box"><h2>My profile</h2><form id="pf"><label>Name</label><input name="name" value="${esc(u.name)}" required><label>Email</label><input value="${esc(u.email)}" disabled>
  <label>Phone</label><input name="phone" value="${esc(u.phone)}"><label>Location</label><select name="location"><option value="">—</option>${state.meta.locations.map((l) => `<option ${u.location === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label>New password (optional)</label><input name="password" type="password" minlength="6"><div style="margin-top:14px"><button class="btn">Save</button></div></form></div>`);
  $('#pf').onsubmit = guard(async (e) => {
    e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); if (!b.password) delete b.password;
    state.user = (await api('/me', { method: 'PUT', body: b })).user; renderNav(); toast('Profile saved');
  });
}


/* ---------- payment checkout (simulated gateway) ---------- */
function payModal(b) {
  modal(`<h2>Pay ${inr(b.payment.amount)}</h2><div class="muted">${esc(b.serviceName)} · ${esc(b.providerName)}</div>
  <div class="tabs" style="margin-top:12px"><button class="on" data-pm="upi">UPI</button><button data-pm="card">Card</button></div>
  <form id="payf"><div id="upi"><label>UPI ID</label><input name="upiId" placeholder="yourname@upi"></div>
  <div id="card" class="hidden"><label>Card number</label><input name="cardNumber" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="23">
   <div class="row" style="flex-wrap:nowrap"><div style="flex:1"><label>Expiry (MM/YY)</label><input name="expiry" placeholder="08/29" maxlength="5"></div><div style="flex:1"><label>CVV</label><input name="cvv" type="password" inputmode="numeric" maxlength="4"></div></div></div>
  <p class="muted" style="font-size:12px">🔒 Demo gateway - no real money moves and card details are never stored (only last 4 digits). Test card: 4242 4242 4242 4242.</p>
  <div class="row"><button class="btn">Pay ${inr(b.payment.amount)}</button><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button></div></form>`);
  let method = 'upi';
  document.querySelectorAll('[data-pm]').forEach((t) => t.onclick = () => { method = t.dataset.pm; document.querySelectorAll('[data-pm]').forEach((x) => x.classList.toggle('on', x === t)); $('#upi').classList.toggle('hidden', method !== 'upi'); $('#card').classList.toggle('hidden', method !== 'card'); });
  $('#payf').onsubmit = guard(async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const r = await api(`/bookings/${b.id}/pay`, { body: { method, ...f } });
    closeModal(); toast('Payment successful ✅  Txn ' + r.payment.txn); refreshNotifs(); pageBookings();
  });
}

/* ---------- digital invoice ---------- */
async function invoiceModal(id) {
  const v = await api(`/bookings/${id}/invoice`);
  modal(`<div id="invoice"><div class="row between"><h2 style="margin:0">🛠️ Service Hub</h2><div style="text-align:right"><b>TAX INVOICE</b><div class="muted">${esc(v.invoiceNo)}</div></div></div><hr class="hr">
  <div class="inv-grid"><div><div class="muted">Billed to</div><b>${esc(v.customer.name)}</b><div>${esc(v.customer.phone)}</div><div>${esc(v.customer.email)}</div><div class="muted">${esc(v.customer.address)}</div></div>
  <div><div class="muted">Service provider</div><b>${esc(v.provider.name)}</b><div>${esc(v.provider.phone)}</div><div class="muted">${esc(v.provider.location)}</div></div>
  <div><div class="muted">Invoice date</div><b>${new Date(v.issuedAt).toLocaleDateString()}</b><div class="muted">Service date</div><b>${esc(v.date)} ${esc(v.time)}</b></div></div>
  <table style="margin:16px 0"><tr><th>Description</th><th style="text-align:right">Amount</th></tr><tr><td>${esc(v.service.name)}</td><td style="text-align:right">${inr(v.price)}</td></tr>
  ${v.discount ? `<tr><td>Discount (coupon)</td><td style="text-align:right">- ${inr(v.discount)}</td></tr>` : ''}<tr><td><b>Total</b></td><td style="text-align:right"><b>${inr(v.total)}</b></td></tr></table>
  <div class="row between"><span>Payment: <b>${esc(v.payment.method.toUpperCase())}${v.payment.last4 ? ' ••••' + esc(v.payment.last4) : ''}</b> ${statusTag(v.payment.status)}</span>${v.payment.txn ? `<span class="muted">Txn ${esc(v.payment.txn)}</span>` : ''}</div>
  <p class="muted" style="font-size:12px;margin-top:16px">Booking ref: ${esc(v.bookingId)} · This is a computer-generated invoice.</p></div>
  <div class="row noprint" style="margin-top:12px"><button class="btn" onclick="window.print()">🖨 Print / Save as PDF</button><button class="btn ghost" onclick="closeModal()">Close</button></div>`);
}

/* ---------- customer support & complaints ---------- */
const CT_CATS = { service_quality: 'Service quality', billing: 'Billing / payment', technician_behaviour: 'Technician behaviour', delay: 'Delay / no-show', app_issue: 'App issue', other: 'Other' };
const ctTag = (s) => `<span class="tag ${s === 'resolved' ? 'completed' : s === 'in_review' ? 'confirmed' : 'pending'}">${s.replace('_', ' ')}</span>`;
function complaintModal(bookingId) {
  modal(`<h2>Report an issue</h2><form id="cf"><label>Category</label><select name="category">${Object.entries(CT_CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  <label>Subject</label><input name="subject" required><label>Describe the problem</label><textarea name="message" required></textarea>
  <div class="row" style="margin-top:12px"><button class="btn">Submit</button><button type="button" class="btn ghost" onclick="closeModal()">Cancel</button></div></form>`);
  $('#cf').onsubmit = guard(async (e) => {
    e.preventDefault(); const r = await api('/complaints', { body: { ...Object.fromEntries(new FormData(e.target)), bookingId } });
    closeModal(); toast('Complaint ' + r.ticket + ' submitted'); refreshNotifs(); if (location.hash === '#/support') pageSupport();
  });
}
async function pageSupport() {
  const list = await api('/complaints');
  view(`<div class="row between"><h1>Support & complaints</h1><button class="btn" id="newc">+ New complaint</button></div>
  <p class="muted">Having trouble with a booking? Report it and track the status here. You can also report directly from <a href="#/bookings">My Bookings</a>.</p>
  ${list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${list.map((c) => `<div class="card"><div class="row between"><b>${esc(c.ticket)}</b>${ctTag(c.status)}</div><div><b>${esc(c.subject)}</b></div>
   <div class="muted" style="font-size:13px">${esc(CT_CATS[c.category])}${c.bookingLabel ? ' · ' + esc(c.bookingLabel) : ''} · ${new Date(c.createdAt).toLocaleDateString()}</div><p>${esc(c.message)}</p>
   ${c.response ? `<div class="reply"><b>Support reply:</b> ${esc(c.response)}</div>` : '<div class="muted" style="font-size:13px">Awaiting response…</div>'}</div>`).join('')}</div>` : '<div class="empty">No complaints raised. 🎉</div>'}`);
  $('#newc').onclick = () => complaintModal(null);
}

/* ---------- boot ---------- */
(async function boot() {
  try { state.meta = await api('/meta'); } catch (e) { view('<div class="empty">Cannot reach server.</div>'); return; }
  await loadMe(); router();
})();
