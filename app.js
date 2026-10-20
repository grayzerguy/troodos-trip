'use strict';

const TZ = 'Asia/Nicosia';
const LS = {
  trip: 'troodos.tripText',
  weather: 'troodos.weather',
  gear: 'troodos.gearChecks',
};

const state = {
  trip: null,
  tripText: '',
  selectedDate: null, // for the "today" tab day picker
};

/* ---------- Helpers ---------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

function hasCoords(p) {
  return p && Number.isFinite(+p.lat) && Number.isFinite(+p.lng) && (+p.lat !== 0 || +p.lng !== 0);
}

function gmapsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function wazeUrl(lat, lng) {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

function navButtons(p, label = '') {
  if (!hasCoords(p)) return '';
  const suffix = label ? ` ${esc(label)}` : '';
  return `
    <a class="btn" href="${gmapsUrl(p.lat, p.lng)}" target="_blank" rel="noopener">🗺️ Google Maps${suffix}</a>
    <a class="btn" href="${wazeUrl(p.lat, p.lng)}" target="_blank" rel="noopener">🚗 Waze${suffix}</a>`;
}

function telHref(phone) {
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`;
}

function waHref(phone) {
  return `https://wa.me/${String(phone).replace(/\D/g, '')}`;
}

function callBtn(phone, text = '📞 חיוג', cls = 'btn') {
  if (!phone) return '<span class="muted small">אין מספר – יש להשלים</span>';
  return `<a class="${cls}" href="${telHref(phone)}">${esc(text)}</a>`;
}

function copyRow(value) {
  if (!value) return '<span class="muted">—</span>';
  return `<span class="copy-row"><span class="mono">${esc(value)}</span>
    <button class="btn small" type="button" data-copy="${esc(value)}">📋 העתק</button></span>`;
}

function kv(rows) {
  const items = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v, raw]) => `<dt>${esc(k)}</dt><dd>${raw ? v : esc(v)}</dd>`)
    .join('');
  return items ? `<dl class="kv">${items}</dl>` : '';
}

/** YYYY-MM-DD of "now" in Cyprus time. */
function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86400000);
}

function fmtDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', { ...opts, timeZone: 'UTC' });
}

/** Formats "YYYY-MM-DDTHH:mm" (local time at the place) without timezone conversion. */
function fmtDateTime(value) {
  if (!value) return '';
  const [date, time] = String(value).split('T');
  if (!time) return fmtDate(date) || value;
  return `${fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${time.slice(0, 5)}`;
}

function fmtTime(date) {
  return date.toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtStamp(ms) {
  return new Date(ms).toLocaleString('he-IL', {
    timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 1800);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('הועתק ✓');
}

/* ---------- Sunrise / sunset (NOAA-style sunrise equation, no API) ---------- */

function sunTimes(isoDate, lat, lng) {
  const rad = Math.PI / 180;
  const J2000 = 2451545.0;
  const jd = Date.parse(`${isoDate}T12:00:00Z`) / 86400000 + 2440587.5;
  const n = Math.ceil(jd - J2000 - 0.0009 + 0.0008);
  const jStar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * jStar) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const jTransit = J2000 + jStar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const sinDec = Math.sin(lambda * rad) * Math.sin(23.4397 * rad);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinDec) / (Math.cos(lat * rad) * cosDec);
  if (cosH > 1 || cosH < -1) return null; // polar day/night – irrelevant for Cyprus
  const H = Math.acos(cosH) / rad;
  const toDate = (j) => new Date((j - 2440587.5) * 86400000);
  return { sunrise: toDate(jTransit - H / 360), sunset: toDate(jTransit + H / 360), noon: toDate(jTransit) };
}

/* ---------- Data loading ---------- */

async function fetchTripText(noStore = false) {
  const res = await fetch('trip.json', noStore ? { cache: 'no-store' } : {});
  if (!res.ok) throw new Error(`trip.json HTTP ${res.status}`);
  return res.text();
}

function applyTrip(text) {
  state.trip = JSON.parse(text);
  state.tripText = text;
  lsSet(LS.trip, text);
  const t = state.trip.trip || {};
  document.getElementById('trip-name').textContent = t.name || 'טיול';
  document.title = t.name || 'טיול';
  document.getElementById('trip-updated').textContent = t.lastUpdated ? `עודכן: ${t.lastUpdated}` : '';
  cacheGpxFiles();
}

async function loadTrip() {
  try {
    applyTrip(await fetchTripText());
  } catch (err) {
    const saved = lsGet(LS.trip, null);
    if (!saved) throw err;
    applyTrip(saved);
  }
}

/** Ask the service worker to keep every GPX referenced in trip.json available offline. */
function cacheGpxFiles() {
  const urls = (state.trip.routes || []).map((r) => r.gpx).filter(Boolean);
  if (urls.length && navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_URLS', urls });
  }
}

/** Compares the live trip.json with the one on screen and offers a refresh when it changed. */
async function checkForContentUpdate() {
  if (!navigator.onLine || !state.tripText) return;
  try {
    const fresh = await fetchTripText(true);
    if (fresh.trim() !== state.tripText.trim()) {
      JSON.parse(fresh); // only offer valid content
      showUpdateBanner(() => {
        applyTrip(fresh);
        render();
      });
    }
  } catch { /* offline or invalid JSON – ignore */ }
}

/* ---------- Banners ---------- */

let updateAction = null;

function showUpdateBanner(action) {
  updateAction = action;
  document.getElementById('banner-update').hidden = false;
}

function updateOnlineBanner() {
  document.getElementById('banner-offline').hidden = navigator.onLine;
}

/* ---------- Views ---------- */

function findRoute(id) { return (state.trip.routes || []).find((r) => r.id === id); }
function findHotel(id) { return (state.trip.hotels || []).find((h) => h.id === id); }

function difficultyClass(d = '') {
  if (/קל/.test(d) && !/בינוני/.test(d)) return 'easy';
  if (/קש/.test(d)) return 'hard';
  return 'medium';
}

function routeStats(r) {
  return `<div class="stats">
    <div class="stat"><b>${esc(r.lengthKm)}</b><span>ק"מ</span></div>
    <div class="stat"><b>${esc(r.ascentM)}</b><span>מ' טיפוס</span></div>
    <div class="stat"><b>${esc(r.durationH)}</b><span>שעות</span></div>
  </div>`;
}

function viewToday() {
  const { trip, itinerary = [] } = state.trip;
  const today = todayISO();
  const days = [...itinerary].sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return '<div class="empty">אין ימים ב-itinerary</div>';

  let html = '';
  const start = trip.startDate || days[0].date;
  const end = trip.endDate || days[days.length - 1].date;

  if (today < start) {
    const n = daysBetween(today, start);
    html += `<div class="card countdown">
      <div class="muted">הטיול מתחיל בעוד</div>
      <div class="num">${n}</div>
      <div>${n === 1 ? 'יום' : 'ימים'}</div>
      <div class="muted small">${esc(fmtDate(start))}</div>
    </div>`;
  }

  if (today > end) {
    html += '<div class="card center">הטיול הסתיים 🎉 הנה כל הימים:</div>';
    html += days.map((d, i) => dayCard(d, i + 1)).join('');
    return html;
  }

  // During (or before) the trip: show a single day, with a picker for the others.
  if (!state.selectedDate) {
    const current = days.find((d) => d.date === today) || days.find((d) => d.date > today) || days[0];
    state.selectedDate = current.date;
  }
  html += `<div class="chips">${days.map((d, i) => `
    <button type="button" class="chip ${d.date === state.selectedDate ? 'active' : ''}" data-day="${esc(d.date)}">
      יום ${i + 1}${d.date === today ? ' · היום' : ''}</button>`).join('')}</div>`;
  const idx = days.findIndex((d) => d.date === state.selectedDate);
  html += dayCard(days[idx], idx + 1);
  return html;
}

function dayCard(day, num) {
  const route = findRoute(day.routeId);
  const hotel = findHotel(day.hotelId);
  const mp = day.meetingPoint || {};
  const sunAt = hasCoords(mp) ? mp : (route?.start || state.trip.weatherPoints?.[0]);
  const sun = hasCoords(sunAt) ? sunTimes(day.date, +sunAt.lat, +sunAt.lng) : null;

  return `<section class="card">
    <div class="muted small">יום ${num} · ${esc(fmtDate(day.date))}</div>
    <h2>${esc(day.title)}</h2>
    ${kv([
      ['שעת יציאה', day.departure],
      ['נקודת מפגש', mp.name],
      ['נהג/ת', day.driver],
    ])}
    <div class="btns">${navButtons(mp)}</div>
    ${day.notes ? `<p>${esc(day.notes)}</p>` : ''}
  </section>
  ${sun ? `<section class="card"><div class="sun">
      <div>🌅<b>${fmtTime(sun.sunrise)}</b><span class="muted small">זריחה</span></div>
      <div>☀️<b>${fmtTime(sun.noon)}</b><span class="muted small">צהריים</span></div>
      <div>🌇<b>${fmtTime(sun.sunset)}</b><span class="muted small">שקיעה</span></div>
    </div></section>` : ''}
  ${route ? `<section class="card">
      <div class="card-title"><h3>🥾 ${esc(route.name)}</h3>
        <span class="badge ${difficultyClass(route.difficulty)}">${esc(route.difficulty)}</span></div>
      ${routeStats(route)}
      <div class="btns"><a class="btn" href="#routes/${esc(route.id)}">לפרטי המסלול</a></div>
    </section>` : ''}
  ${hotel ? `<section class="card">
      <h3>🛏️ לינה: ${esc(hotel.name)}</h3>
      ${kv([['כתובת', hotel.address]])}
      <div class="btns">${hotel.phone ? callBtn(hotel.phone) : ''}${navButtons(hotel)}</div>
    </section>` : ''}`;
}

function viewRoutes(focusId) {
  const routes = state.trip.routes || [];
  if (!routes.length) return '<div class="empty">אין מסלולים</div>';
  setTimeout(() => focusId && document.getElementById(`route-${focusId}`)?.scrollIntoView({ block: 'start' }));
  return `<h2>מסלולים</h2>${routes.map((r) => `
    <section class="card" id="route-${esc(r.id)}">
      <div class="card-title"><h3>${esc(r.name)}</h3>
        <span class="badge ${difficultyClass(r.difficulty)}">${esc(r.difficulty)}</span></div>
      ${routeStats(r)}
      ${kv([['💧 מים', r.water], ['הערות', r.notes]])}
      <div class="btns">
        ${r.gpx ? `<a class="btn primary" href="${esc(r.gpx)}" download>⬇️ GPX</a>` : ''}
        ${(r.links || []).filter((l) => l.url).map((l) => `
          <a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.label)}</a>`).join('')}
      </div>
      ${hasCoords(r.start) ? `<div class="muted small" style="margin-top:10px">ניווט לנקודת ההתחלה:</div>
        <div class="btns" style="margin-top:4px">${navButtons(r.start)}</div>` : ''}
    </section>`).join('')}`;
}

/* Weather */

const WX_CODES = [
  [[0], '☀️', 'בהיר'], [[1], '🌤️', 'בהיר בעיקר'], [[2], '⛅', 'מעונן חלקית'], [[3], '☁️', 'מעונן'],
  [[45, 48], '🌫️', 'ערפל'], [[51, 53, 55, 56, 57], '🌦️', 'טפטוף'], [[61, 63, 65, 66, 67], '🌧️', 'גשם'],
  [[71, 73, 75, 77, 85, 86], '🌨️', 'שלג'], [[80, 81, 82], '🌦️', 'ממטרים'], [[95, 96, 99], '⛈️', 'סופת רעמים'],
];

function wxIcon(code) {
  const hit = WX_CODES.find(([codes]) => codes.includes(code));
  return hit ? { emo: hit[1], label: hit[2] } : { emo: '❔', label: '' };
}

async function fetchWeather() {
  const points = state.trip.weatherPoints || [];
  const results = await Promise.all(points.map(async (p) => {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${p.lat}&longitude=${p.lng}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,'
      + 'precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max'
      + `&timezone=${encodeURIComponent(TZ)}&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
    const json = await res.json();
    return { name: p.name, elevation: json.elevation, daily: json.daily };
  }));
  const payload = { fetchedAt: Date.now(), points: results };
  lsSet(LS.weather, payload);
  return payload;
}

function weatherHtml(data, status) {
  if (!data) {
    return `<h2>מזג אוויר</h2><div class="empty">${status || 'אין נתונים שמורים. התחברו לרשת כדי לטעון תחזית.'}</div>`;
  }
  return `<h2>מזג אוויר</h2>
    <div class="card-title" style="margin-bottom:10px">
      <span class="muted small">עודכן לאחרונה ב-${esc(fmtStamp(data.fetchedAt))}${status ? ` · ${esc(status)}` : ''}</span>
      <button class="btn small" type="button" data-action="refresh-weather">🔄 רענון</button>
    </div>
    ${data.points.map((p) => `
    <section class="card">
      <h3>📍 ${esc(p.name)} ${p.elevation ? `<span class="muted small">(${Math.round(p.elevation)} מ')</span>` : ''}</h3>
      <table class="wx">
        <thead><tr><th>יום</th><th></th><th>מקס׳/מינ׳</th><th>משקעים</th><th>רוח</th></tr></thead>
        <tbody>${p.daily.time.map((t, i) => {
          const ic = wxIcon(p.daily.weather_code?.[i]);
          const prob = p.daily.precipitation_probability_max?.[i];
          return `<tr>
            <td>${esc(fmtDate(t, { weekday: 'short', day: 'numeric', month: 'numeric' }))}</td>
            <td class="emo" title="${esc(ic.label)}">${ic.emo}</td>
            <td><span class="max">${Math.round(p.daily.temperature_2m_max[i])}°</span>
              / ${Math.round(p.daily.temperature_2m_min[i])}°</td>
            <td class="rain">${p.daily.precipitation_sum[i] ?? 0} מ"מ${prob != null ? `<br><span class="small">${prob}%</span>` : ''}</td>
            <td>${Math.round(p.daily.wind_speed_10m_max[i])}<span class="small"> קמ"ש</span>${
              p.daily.wind_gusts_10m_max ? `<br><span class="small muted">משבים ${Math.round(p.daily.wind_gusts_10m_max[i])}</span>` : ''}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </section>`).join('')}
    <p class="muted small center">נתונים: Open-Meteo.com</p>`;
}

function viewWeather() {
  const cached = lsGet(LS.weather, null);
  const fresh = cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000;
  if (navigator.onLine && !fresh) setTimeout(() => refreshWeather(), 0);
  return weatherHtml(cached, navigator.onLine && !fresh ? 'מעדכן…' : (!navigator.onLine ? 'אופליין' : ''));
}

async function refreshWeather() {
  const view = document.getElementById('view');
  try {
    const data = await fetchWeather();
    if (currentTab() === 'weather') view.innerHTML = weatherHtml(data);
  } catch {
    if (currentTab() === 'weather') view.innerHTML = weatherHtml(lsGet(LS.weather, null), 'העדכון נכשל – מוצג מידע שמור');
  }
}

/* Logistics */

const LOGISTICS = [
  ['flights', 'טיסות'], ['vehicle', 'רכב'], ['hotels', 'מלונות'],
  ['participants', 'משתתפים'], ['gear', 'ציוד'], ['info', 'מידע שימושי'],
];

function viewLogistics(sub) {
  const key = LOGISTICS.some(([k]) => k === sub) ? sub : 'flights';
  const chips = `<div class="chips">${LOGISTICS.map(([k, label]) => `
    <a class="chip ${k === key ? 'active' : ''}" href="#logistics/${k}">${label}</a>`).join('')}</div>`;
  const renderers = { flights, vehicle, hotels, participants, gear, info };
  return chips + renderers[key]();

  function flights() {
    const list = state.trip.flights || [];
    return list.map((f) => `<section class="card">
      <div class="card-title"><h3>✈️ ${esc(f.direction)}</h3><span class="badge mono">${esc(f.flightNo)}</span></div>
      ${kv([['מ-', f.from], ['אל', f.to], ['המראה', fmtDateTime(f.depart)], ['נחיתה', fmtDateTime(f.arrive)]])}
      ${f.checkinUrl ? `<div class="btns"><a class="btn primary" href="${esc(f.checkinUrl)}" target="_blank" rel="noopener">צ'ק-אין</a></div>` : ''}
    </section>`).join('') || '<div class="empty">אין טיסות</div>';
  }

  function vehicle() {
    const v = state.trip.vehicle || {};
    return `<div class="alert">⬅️ נוהגים בצד שמאל! ההגה מימין, בכיכרות נכנסים עם כיוון השעון.</div>
      <div class="alert danger">⛔ הביטוח לא מכסה מעבר לצפון (מעבר לקו הירוק).</div>
      <section class="card">
        <h3>🚙 ${esc(v.company)}</h3>
        ${kv([
          ['מספר הזמנה', copyRow(v.bookingRef), true],
          ['איסוף', [v.pickup?.name, fmtDateTime(v.pickup?.time)].filter(Boolean).join(' · ')],
          ['החזרה', [v.dropoff?.name, fmtDateTime(v.dropoff?.time)].filter(Boolean).join(' · ')],
          ['הערות', v.notes],
        ])}
        <div class="btns">${v.phone ? callBtn(v.phone, '📞 חברת ההשכרה') : ''}</div>
        ${hasCoords(v.pickup) ? `<div class="muted small" style="margin-top:10px">ניווט לנקודת האיסוף:</div>
          <div class="btns" style="margin-top:4px">${navButtons(v.pickup)}</div>` : ''}
        ${hasCoords(v.dropoff) ? `<div class="muted small" style="margin-top:10px">ניווט לנקודת ההחזרה:</div>
          <div class="btns" style="margin-top:4px">${navButtons(v.dropoff)}</div>` : ''}
      </section>`;
  }

  function hotels() {
    return (state.trip.hotels || []).map((h) => `<section class="card">
      <h3>🛏️ ${esc(h.name)}</h3>
      ${kv([
        ['כתובת', h.address],
        ['צ\'ק-אין', fmtDate(h.checkIn)],
        ['צ\'ק-אאוט', fmtDate(h.checkOut)],
        ['מספר הזמנה', copyRow(h.bookingRef), true],
      ])}
      <div class="btns">${h.phone ? callBtn(h.phone) : ''}${navButtons(h)}</div>
    </section>`).join('') || '<div class="empty">אין מלונות</div>';
  }

  function participants() {
    const list = state.trip.participants || [];
    return `<section class="card">${list.map((p) => `
      <div class="list-row">
        <b>${esc(p.name)}</b> ${p.phone ? `<span class="muted small mono" dir="ltr">${esc(p.phone)}</span>` : ''}
        <div class="btns" style="margin-top:6px">
          ${p.phone ? `${callBtn(p.phone, '📞 חיוג', 'btn small')}
            <a class="btn small" href="${waHref(p.phone)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
        </div>
        ${p.emergencyContact ? `<div class="small muted" style="margin-top:6px">איש קשר לחירום: ${esc(p.emergencyContact)}
          ${p.emergencyPhone ? `· <a href="${telHref(p.emergencyPhone)}" dir="ltr">${esc(p.emergencyPhone)}</a>` : ''}</div>` : ''}
      </div>`).join('') || '<div class="empty">אין משתתפים</div>'}</section>`;
  }

  function gear() {
    const checks = lsGet(LS.gear, {});
    const groups = state.trip.gear || [];
    const total = groups.reduce((s, g) => s + (g.items || []).length, 0);
    const done = groups.reduce((s, g) => s + (g.items || []).filter((it) => checks[`${g.category}|${it}`]).length, 0);
    return `<div class="card-title"><span>${done}/${total} נארזו</span>
        <button class="btn small" type="button" data-action="reset-gear">↺ איפוס</button></div>
      <div class="progress"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
      ${groups.map((g) => `<section class="card"><h3>${esc(g.category)}</h3>
        ${(g.items || []).map((it) => {
          const k = `${g.category}|${it}`;
          return `<label class="check-item ${checks[k] ? 'done' : ''}">
            <input type="checkbox" data-gear="${esc(k)}" ${checks[k] ? 'checked' : ''}><span>${esc(it)}</span></label>`;
        }).join('')}</section>`).join('')}
      <p class="muted small center">הסימונים נשמרים רק במכשיר הזה.</p>`;
  }

  function info() {
    const i = state.trip.info || {};
    return `<section class="card"><h3>💶 מטבע</h3><p>${esc(i.currency)}</p></section>
      <section class="card"><h3>🇬🇷 מילים ביוונית</h3>
        <table class="phrases"><tbody>${(i.phrases || []).map((p) => `
          <tr><td>${esc(p.he)}</td><td dir="auto"><b>${esc(p.gr)}</b></td></tr>`).join('')}</tbody></table>
      </section>
      ${i.splitwiseUrl ? `<section class="card"><h3>💸 התחשבנות</h3>
        <a class="btn primary block" href="${esc(i.splitwiseUrl)}" target="_blank" rel="noopener">פתיחה ב-Splitwise</a></section>` : ''}`;
  }
}

/* Emergency */

function viewEmergency() {
  const e = state.trip.emergency || {};
  const numbers = e.numbers || [];
  const main = numbers.find((n) => n.phone === '112') || numbers[0];
  const rest = numbers.filter((n) => n !== main);
  return `
    ${main ? `<a class="sos" href="${telHref(main.phone)}"><span class="big">${esc(main.phone)}</span>
      <span>${esc(main.label)} – לחצו לחיוג</span></a>` : ''}
    ${rest.length ? `<div class="call-grid">${rest.map((n) => `
      <a class="btn danger" href="${telHref(n.phone)}"><b dir="ltr">${esc(n.phone)}</b><span class="small">${esc(n.label)}</span></a>`).join('')}</div>` : ''}

    <section class="card"><h3>🏥 בתי חולים ומרפאות</h3>
      ${(e.medical || []).map((m) => `<div class="list-row"><b>${esc(m.name)}</b>
        ${m.phone ? `<span class="muted small mono" dir="ltr">${esc(m.phone)}</span>` : ''}
        ${m.address ? `<div class="small" dir="auto">${esc(m.address)}</div>` : ''}
        ${m.notes ? `<div class="small muted">${esc(m.notes)}</div>` : ''}
        <div class="btns">${callBtn(m.phone)}${navButtons(m)}</div></div>`).join('') || '<div class="muted">—</div>'}
    </section>

    ${e.embassy ? `<section class="card"><h3>🇮🇱 ${esc(e.embassy.name)}</h3>
      ${kv([['כתובת', e.embassy.address], ['טלפון', e.embassy.phone ? `<span dir="ltr">${esc(e.embassy.phone)}</span>` : '', true], ['הערות', e.embassy.notes]])}
      <div class="btns">${callBtn(e.embassy.phone)}${navButtons(e.embassy)}</div></section>` : ''}

    <section class="card"><h3>🛡️ ביטוח</h3>
      ${(e.insurance || []).map((ins) => `<div class="list-row">
        <b>${esc(ins.participant)}</b> · ${esc(ins.company)}
        <div class="small">פוליסה: ${copyRow(ins.policy)}</div>
        <div class="btns">${callBtn(ins.phone, '📞 מוקד הביטוח', 'btn small')}</div></div>`).join('') || '<div class="muted">—</div>'}
    </section>`;
}

/* ---------- Router ---------- */

function parseHash() {
  const [tab = 'today', sub = ''] = location.hash.replace(/^#/, '').split('/');
  return { tab, sub: decodeURIComponent(sub) };
}

function currentTab() { return parseHash().tab; }

function render() {
  if (!state.trip) return;
  const { tab, sub } = parseHash();
  const views = {
    today: viewToday,
    routes: () => viewRoutes(sub),
    weather: viewWeather,
    logistics: () => viewLogistics(sub),
    emergency: viewEmergency,
  };
  const view = views[tab] || views.today;
  document.getElementById('view').innerHTML = view();
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === (views[tab] ? tab : 'today'));
  });
  if (!(tab === 'routes' && sub)) window.scrollTo(0, 0);
}

/* ---------- Events ---------- */

document.addEventListener('click', (ev) => {
  const copy = ev.target.closest('[data-copy]');
  if (copy) { copyText(copy.dataset.copy); return; }

  const day = ev.target.closest('[data-day]');
  if (day) { state.selectedDate = day.dataset.day; render(); return; }

  const action = ev.target.closest('[data-action]')?.dataset.action;
  if (action === 'reset-gear') {
    if (confirm('לאפס את כל סימוני הציוד?')) { lsSet(LS.gear, {}); render(); }
  } else if (action === 'refresh-weather') {
    if (!navigator.onLine) { toast('אין חיבור לרשת'); return; }
    toast('מעדכן…');
    refreshWeather();
  }
});

document.addEventListener('change', (ev) => {
  const key = ev.target.dataset?.gear;
  if (!key) return;
  const checks = lsGet(LS.gear, {});
  if (ev.target.checked) checks[key] = true; else delete checks[key];
  lsSet(LS.gear, checks);
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
});

document.getElementById('banner-update').addEventListener('click', () => {
  document.getElementById('banner-update').hidden = true;
  if (updateAction) updateAction();
});

window.addEventListener('hashchange', render);
window.addEventListener('online', () => { updateOnlineBanner(); checkForContentUpdate(); });
window.addEventListener('offline', updateOnlineBanner);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForContentUpdate();
});

/* ---------- Service worker ---------- */

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offerWaiting = (worker) => showUpdateBanner(() => worker.postMessage({ type: 'SKIP_WAITING' }));
    if (reg.waiting && navigator.serviceWorker.controller) offerWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offerWaiting(nw);
      });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch((err) => console.warn('SW registration failed', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

/* ---------- Boot ---------- */

(async function init() {
  updateOnlineBanner();
  registerSW();
  try {
    await loadTrip();
    render();
  } catch (err) {
    console.error(err);
    document.getElementById('view').innerHTML =
      '<div class="empty">לא ניתן לטעון את trip.json. בדקו חיבור לרשת ונסו שוב.</div>';
  }
  setInterval(checkForContentUpdate, 10 * 60 * 1000);
}());
