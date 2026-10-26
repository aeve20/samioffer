// פונקציות משותפות לכל דפי המערכת
(function () {
  'use strict';

  var TZ = 'Asia/Jerusalem';

  function apiUrl() {
    var url = (window.NV_CONFIG && window.NV_CONFIG.API_URL) || '';
    if (!url || url.indexOf('PASTE_') === 0) throw new Error('לא הוגדרה כתובת השרת בקובץ ההגדרות');
    return url;
  }

  // קריאה לשרת. מחזירה את תשובת השרת, או זורקת שגיאת רשת עם הדגל network
  function api(action, data, opts) {
    opts = opts || {};
    var url;
    try {
      url = apiUrl();
    } catch (err) {
      return Promise.reject(err);
    }
    var body = Object.assign({ action: action }, data || {});
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout || 25000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (!res.ok) {
        var e = new Error('השרת לא זמין כרגע');
        e.network = true;
        throw e;
      }
      return res.json();
    }, function () {
      var e = new Error('אין חיבור לשרת');
      e.network = true;
      throw e;
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  var store = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem('nv_' + k);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem('nv_' + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) {
      try { localStorage.removeItem('nv_' + k); } catch (e) { }
    }
  };

  function randomId(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var out = '';
    var arr = new Uint8Array(len || 24);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (var i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  // מזהה קבוע למכשיר, נשמר בדפדפן
  var memDevice = null;
  function deviceId() {
    var d = store.get('device', null);
    if (!d) {
      d = memDevice || ('d' + randomId(23));
      memDevice = d;
      store.set('device', d);
    }
    return d;
  }

  // אסימוני הרשמה לפי אירוע
  function getAuth(eventId) {
    var all = store.get('auth', {});
    return all[eventId] || null;
  }
  function setAuth(eventId, token, event) {
    var all = store.get('auth', {});
    all[eventId] = { token: token, name: event && event.name, date: event && event.date, at: Date.now() };
    store.set('auth', all);
    store.set('lastEvent', eventId);
  }
  function clearAuth(eventId) {
    var all = store.get('auth', {});
    delete all[eventId];
    store.set('auth', all);
  }
  function lastEvent() {
    var last = store.get('lastEvent', null);
    var all = store.get('auth', {});
    if (last && all[last]) return last;
    var best = null;
    Object.keys(all).forEach(function (k) { if (!best || all[k].at > all[best].at) best = k; });
    return best;
  }

  function param(name) {
    try { return new URLSearchParams(location.search).get(name) || ''; } catch (e) { return ''; }
  }
  function hashParam(name) {
    try { return new URLSearchParams(location.hash.replace(/^#/, '')).get(name) || ''; } catch (e) { return ''; }
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function fmtDateTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('he-IL', { timeZone: TZ, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function fmtDate(ymd) {
    if (!ymd) return '';
    var p = String(ymd).split('-');
    if (p.length !== 3) return ymd;
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
    try {
      return d.toLocaleDateString('he-IL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
    } catch (e) { return ymd; }
  }
  // טווח שעות שמוצג נכון גם בכיוון מימין לשמאל
  function timeRange(a, b) {
    if (!a) return '';
    return a + ' עד ' + b;
  }

  function duration(fromIso, toIso) {
    if (!fromIso || !toIso) return '';
    var m = Math.max(0, Math.round((new Date(toIso) - new Date(fromIso)) / 60000));
    var h = Math.floor(m / 60);
    var mm = m % 60;
    return h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function distance(lat1, lng1, lat2, lng2) {
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLng = (lng2 - lng1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('nv-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nv-toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast('הועתק'); }, function () { fallbackCopy(text); });
    }
    fallbackCopy(text);
    return Promise.resolve();
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('הועתק'); } catch (e) { toast('לא ניתן להעתיק, סמן והעתק ידנית'); }
    document.body.removeChild(ta);
  }

  // כתובת בסיס של האתר, לבניית קישורים בין הדפים
  function baseUrl() {
    return location.origin + location.pathname.replace(/[^\/]*$/, '');
  }

  // ציור קוד מרובע על בד ציור
  function drawQr(canvas, text, opts) {
    opts = opts || {};
    var qr = qrcode(0, opts.level || 'M');
    qr.addData(text);
    qr.make();
    var count = qr.getModuleCount();
    var quiet = opts.quiet === undefined ? 4 : opts.quiet;
    var size = opts.size || canvas.clientWidth || 300;
    var ratio = window.devicePixelRatio || 1;
    var cell = Math.floor((size * ratio) / (count + quiet * 2));
    var px = cell * (count + quiet * 2);
    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#FFFFFF';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || '#04170F';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
      }
    }
  }

  window.NV = {
    api: api, store: store, randomId: randomId, deviceId: deviceId,
    getAuth: getAuth, setAuth: setAuth, clearAuth: clearAuth, lastEvent: lastEvent,
    param: param, hashParam: hashParam,
    fmtTime: fmtTime, fmtDateTime: fmtDateTime, fmtDate: fmtDate, duration: duration, timeRange: timeRange,
    distance: distance, esc: esc, toast: toast, copy: copy, baseUrl: baseUrl, drawQr: drawQr
  };
})();
