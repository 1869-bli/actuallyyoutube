"use strict";

const $ = (s) => document.querySelector(s);

const state = {
  results: [],        // active play list
  index: 0,
  accounts: [],
  account: null,
  cloud: false,       // web mode: no backend server, accounts live in localStorage
  current: null,      // watched video meta
  sb: { segments: [], ptr: 0, saved: 0, on: localStorage.getItem("ayt_sb") !== "0" },
  player: { total: 0, offset: 0, playing: false, hideTimer: null },
};

const HISTORY_KEY = "ayt_history";
const LS_ACCOUNTS = "ayt_cloud_accounts";
const CHIPS = ["music", "gaming", "lofi beats", "news", "podcast", "cooking", "science", "coding", "space", "travel"];
const ACC_COLORS = ["#ff0033", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#06b6d4", "#f97316"];
const SB_NAMES = { sponsor: "Sponsor", intro: "Intro", outro: "Outro", selfpromo: "Self-promo", interaction: "Interaction", intermission: "Intermission" };

function lsAccounts() {
  try { return JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]"); } catch { return []; }
}
function saveLsAccounts(list) {
  localStorage.setItem(LS_ACCOUNTS, JSON.stringify(list));
}
function saveLsAccount(acc) {
  const list = lsAccounts();
  const i = list.findIndex((a) => a.id === acc.id);
  if (i >= 0) list[i] = acc; else list.push(acc);
  saveLsAccounts(list);
}

const nf = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

function fmtDur(t) {
  if (t == null || !isFinite(t)) return "--:--";
  t = Math.max(0, Math.round(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") + ":" : m + ":") + String(s).padStart(2, "0");
}
const fmtViews = (v) => (v == null ? "" : nf.format(v) + " views");

function daysAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.slice(0, 4) + "-" + dateStr.slice(4, 6) + "-" + dateStr.slice(6, 8));
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  if (days < 365) return Math.floor(days / 30) + " months ago";
  return Math.floor(days / 365) + " years ago";
}

/* ---------- theme ---------- */
function applyThemeIcon() {
  const light = document.documentElement.dataset.theme === "light";
  $("#theme-btn").innerHTML = light
    ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = cur;
  localStorage.setItem("ayt_theme", cur);
  applyThemeIcon();
}

/* ---------- views ---------- */
function show(id) {
  ["home", "results", "watch"].forEach((v) => $(`#${v}`).classList.toggle("hidden", v !== id));
  if (id !== "watch") $("#player")?.pause();
}

function goHome() {
  show("home");
  renderHome();
}

/* ---------- player ---------- */
const IC_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const IC_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const IC_SND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>';
const IC_MUTE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 3.7-3.7-1.4-1.4-3.7 3.7-3.7-3.7-1.4 1.4 3.7 3.7-3.7 3.7 1.4 1.4 3.7-3.7 3.7 3.7 1.4-1.4z"/></svg>';
const IC_FS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const IC_FSX = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';

function bufEnd() {
  const v = $("#player");
  try {
    const b = v.buffered;
    return b.length ? b.end(b.length - 1) : 0;
  } catch { return 0; }
}

const okAvatar = (u) => !!u && !/-fcrop|-ndf/.test(u);

function absTime() {
  return (state.player.offset || 0) + ($("#player").currentTime || 0);
}

function seekTo(t) {
  const total = state.player.total;
  if (!total || !state.current) return;
  t = Math.min(Math.max(0, t), total);
  if (Math.abs(t - absTime()) < 1.2) return;
  if (state.cloud) {
    if (mse.active) mseSeek(t);
    else $("#player").currentTime = t;
    return;
  }
  const offset = state.player.offset || 0;
  if (t >= offset && t <= offset + bufEnd()) {
    const v = $("#player");
    v.currentTime = t - offset;
    return;
  }
  serverSeek(t);
}

function serverSeek(t) {
  t = Math.min(Math.max(0, t), state.player.total || 0);
  state.player.offset = t;
  const video = $("#player");
  video.removeAttribute("src");
  video.load();
  const overlay = $("#overlay");
  overlay.classList.remove("err");
  overlay.classList.remove("hidden");
  $("#overlay-msg").textContent = "Seeking...";
  state.sb.ptr = state.sb.segments.findIndex((s) => s.segment[1] > t);
  if (state.sb.ptr < 0) state.sb.ptr = state.sb.segments.length;
  setTimeout(() => {
    video.src = "/api/stream?id=" + state.current.id + (t > 0.05 ? "&t=" + t.toFixed(2) : "");
    video.play().catch(() => {});
  }, 120);
}

function updateControls() {
  const v = $("#player");
  const total = state.player.total || v.duration || 0;
  const abs = (state.player.offset || 0) + (v.currentTime || 0);
  $("#pplay").style.width = (total ? (abs / total) * 100 : 0) + "%";
  const be = (state.player.offset || 0) + bufEnd();
  $("#pbuf").style.width = (total ? (be / total) * 100 : 0) + "%";
  $("#time").textContent = fmtDur(abs) + " / " + fmtDur(total);
  const seek = $("#seek");
  if (total && seek.max !== String(total)) seek.max = String(total);
  seek.value = String(Math.min(abs, total));
  $("#btn-mute").innerHTML = v.muted || v.volume === 0 ? IC_MUTE : IC_SND;
  $("#vol").value = String(v.muted ? 0 : v.volume);
  $("#vol").style.background = `linear-gradient(to right, #fff ${v.muted ? 0 : v.volume * 100}%, rgba(255,255,255,.25) 0)`;
}

function renderSbMarkers() {
  const psb = $("#psb");
  psb.innerHTML = "";
  const total = state.player.total;
  if (!total || !state.sb.segments.length) return;
  state.sb.segments.forEach((s) => {
    const [a, b] = s.segment;
    const w = Math.max(3, ((b - a) / total) * 100 * 40);
    const i = document.createElement("i");
    i.className = (b - a) / total > 0.04 ? "big" : "";
    i.style.left = (a / total) * 100 + "%";
    i.style.width = w + "px";
    psb.appendChild(i);
  });
}

function setupSb(vid, total) {
  state.sb.ptr = 0;
  state.sb.saved = 0;
  state.sb.segments = [];
  renderSbMarkers();
  fetch("/api/sponsor?id=" + vid).then((r) => r.json()).then((d) => {
    state.sb.segments = (d.segments || []).sort((x, y) => x.segment[0] - y.segment[0]);
    renderSbMarkers();
  }).catch(() => {});
}

function sbTick(ct) {
  if (!state.sb.on || !state.sb.segments.length) return;
  const segs = state.sb.segments;
  while (state.sb.ptr < segs.length && segs[state.sb.ptr].segment[1] <= ct) state.sb.ptr++;
  const next = segs[state.sb.ptr];
  if (!next) return;
  const [a, b] = next.segment;
  if (ct < a || ct >= b) return;
  if (b - ct < 1.5) { state.sb.ptr++; return; }
  const end = Math.min(b, state.player.total || b);
  if (end <= ct) { state.sb.ptr++; return; }
  state.sb.saved += end - ct;
  seekTo(end);
  state.sb.ptr++;
  toast("Skipped " + (SB_NAMES[next.category] || "segment") + " \u2014 saved " + fmtDur(state.sb.saved));
}

function showCtrl(force) {
  const c = $("#ctrl");
  c.classList.add("show");
  clearTimeout(state.player.hideTimer);
  state.player.hideTimer = setTimeout(() => {
    if (!state.player.playing) return;
    c.classList.remove("show");
  }, force ? 4000 : 2500);
}

/* ---------- search ---------- */
async function doSearch(q) {
  q = q.trim();
  if (q.length < 2) return;
  if (/^@[\w.-]+$/.test(q)) {
    searchChannel(q);
    return;
  }
  show("results");
  $("#results-title").textContent = "Results";
  const grid = $("#results-grid");
  grid.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  $("#results-empty").classList.add("hidden");
  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(q));
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const results = data.results;
    const ids = [...new Set(results.map((r) => r.channel_id).filter(Boolean))].slice(0, 8);
    if (ids.length) {
      try {
        const av = await (await fetch("/api/avatars?ids=" + ids.join(","))).json();
        results.forEach((r) => { if (r.channel_id) r.avatar = av[r.channel_id] || ""; });
      } catch { /* pfp optional */ }
    }
    grid.innerHTML = "";
    if (!results.length) {
      $("#results-empty").textContent = "Nothing found for \u201C" + q + "\u201D.";
      $("#results-empty").classList.remove("hidden");
      return;
    }
    state.results = results;
    state.index = 0;
    window.location.hash = "?q=" + encodeURIComponent(q);
    renderCards(results, grid, (i) => openVideo(i));
  } catch (e) {
    grid.innerHTML = "";
    toast("Search failed: " + e.message);
    $("#results-empty").textContent = "Could not reach YouTube. Check your internet.";
    $("#results-empty").classList.remove("hidden");
  }
}

function cardHtml(v, grouped) {
  const letter = esc((v.channel || "?").trim()[0] || "?");
  const av = okAvatar(v.avatar)
    ? `<img class="c-av" src="${esc(v.avatar)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'c-av letter',textContent:'${letter}'}))">`
    : `<span class="c-av letter">${letter}</span>`;
  return `
    <div class="thumb-box">
      <img class="thumb" loading="lazy" src="${esc(v.thumb)}" alt=""
        onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22><rect width=%22100%25%22 height=%22100%25%22 fill=%22%23141414%22/></svg>'">
      ${v.isLive ? '<span class="live-badge">LIVE</span>' : `<span class="dur-badge">${fmtDur(v.duration)}</span>`}
    </div>
    <h3>${esc(v.title)}</h3>
    ${grouped ? "" : `<div class="card-chan">${av}<p>${esc(v.channel)}${v.views ? " \u00B7 " + fmtViews(v.views) : ""}</p></div>`}`;
}

function renderCards(list, into, onclick, grouped = false) {
  into.innerHTML = "";
  list.forEach((v, i) => {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    card.addEventListener("click", () => onclick(i));
    card.addEventListener("keydown", (e) => { if (e.key === "Enter") onclick(i); });
    card.innerHTML = cardHtml(v, grouped);
    into.appendChild(card);
  });
}

/* ---------- MSE mux (web HD: browser merges video+audio tracks) ---------- */
const mse = {
  active: false,
  ms: null,
  sbv: null,
  sba: null,
  gen: 0,
  tracks: {},
  tables: {},
  gotInit: { v: false, a: false },
  failed: 0,
};

function mseClose() {
  mse.gen++;
  mse.active = false;
  for (const k of ["v", "a"]) {
    const t = mse.tracks[k];
    if (t && t.signal) { try { t.signal.abort(); } catch { /* ok */ } }
  }
  mse.tracks = {};
  if (mse.ms && mse.ms.readyState !== "closed") {
    try { mse.ms.endOfStream(); } catch { /* ok */ }
  }
  mse.sbv = null;
  mse.sba = null;
  mse.ms = null;
  mse.tables = {};
}

function mseQuality() {
  const vf = state.current?.formats?.video || [];
  const af = state.current?.formats?.audio || [];
  if (typeof MediaSource === "undefined") return 0;
  for (const f of vf) {
    if (!f.url) continue;
    if (mse.usable(f.codecs)) return { vid: f, aud: af.find((x) => mse.usable(x.codecs)) };
  }
  return 0;
}
mse.usable = (mime) => {
  try {
    return !!(window.MediaSource && window.MediaSource.isTypeSupported(mime));
  } catch { return false; }
};

function mseStart() {
  const q = mseQuality();
  if (!q || !q.aud) return false;
  const video = $("#player");
  try {
    mse.ms = new MediaSource();
    mse.active = true;
    mse.gotInit = { v: false, a: false };
    video.src = URL.createObjectURL(mse.ms);
    mse.ms.addEventListener("sourceopen", () => {
      try {
        mse.sbv = mse.ms.addSourceBuffer(q.vid.codecs);
        mse.sba = mse.ms.addSourceBuffer(q.aud.codecs);
        mse.sbv._q = [];
        mse.sba._q = [];
        mse.sbv.addEventListener("updateend", () => { msePump(mse.sbv); mseAfter(mse.sbv); });
        mse.sba.addEventListener("updateend", () => { msePump(mse.sba); mseAfter(mse.sba); });
        mseRun("v", q.vid.url, 0);
        mseRun("a", q.aud.url, 0);
      } catch (e) {
        mseFail("init: " + e.message);
      }
    });
    return true;
  } catch (e) {
    mseFail("mse: " + e.message);
    return false;
  }
}

function msePump(sb) {
  if (sb.updating) return;
  const d = (sb._q || []).shift();
  if (!d) return;
  try { sb.appendBuffer(d); } catch (e) { mseFail("append: " + e.message); }
}

function mseAfter(sb) {
  const after = sb._after;
  if (after) { sb._after = null; after(); }
  if (!sb._q?.length && mse.tracks.v?.done && mse.tracks.a?.done && !sb.updating) {
    try { if (mse.ms && mse.ms.readyState === "open") mse.ms.endOfStream(); } catch { /* ok */ }
  }
}

function concatArrays(list) {
  let len = 0;
  for (const p of list) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of list) { out.set(p, off); off += p.length; }
  return out;
}

function parseSidx(box, boxEndAbs) {
  try {
    const dv = new DataView(box.buffer, box.byteOffset, box.byteLength);
    const ver = dv.getUint8(0);
    const timescale = dv.getUint32(16) || 1;
    let p;
    let ept, firstOffset;
    if (ver === 0) {
      ept = dv.getUint32(20);
      firstOffset = dv.getUint32(24);
      p = 28;
    } else {
      ept = Number(dv.getBigUint64(20));
      firstOffset = Number(dv.getBigUint64(28));
      p = 36;
    }
    const count = dv.getUint16(p + 2);
    const anchor = boxEndAbs + Number(firstOffset);
    const entries = [];
    let time = ept, total = 0;
    for (let i = 0; i < count; i++) {
      const e = p + 4 + i * 12;
      const size = dv.getUint32(e) & 0x7fffffff;
      const dur = dv.getUint32(e + 4);
      entries.push({ t: time / timescale, dur: dur / timescale, start: anchor + total });
      time += dur;
      total += size;
    }
    return entries;
  } catch { return null; }
}

function pickEntry(table, t) {
  let best = null;
  for (const e of table || []) {
    if (e.t <= t + 0.05) best = e;
    else break;
  }
  return best;
}

async function mseRun(tag, url, startByte) {
  const gen = mse.gen;
  const track = { done: false, signal: null, initDone: false };
  mse.tracks[tag] = track;
  if (startByte === 0) mse.initParts = mse.initParts || {};
  const sb = tag === "v" ? mse.sbv : mse.sba;
  try {
    const ctrl = new AbortController();
    track.signal = ctrl;
    const resp = await fetch("/api/raw?u=" + encodeURIComponent(url), {
      signal: ctrl.signal,
      headers: startByte > 0 ? { Range: "bytes=" + startByte + "-" } : {},
    });
    if (!resp.ok || !resp.body) throw new Error("track " + resp.status);
    const reader = resp.body.getReader();
    let buf = new Uint8Array(0);
    let eof = false;
    let frag = null;
    const take = async (n) => {
      while (buf.length < n && !eof) {
        const { done, value } = await reader.read();
        if (done) { eof = true; break; }
        const nb = new Uint8Array(buf.length + value.length);
        nb.set(buf);
        nb.set(value, buf.length);
        buf = nb;
      }
      return buf.length >= n;
    };
    while (!eof) {
      if (mse.gen !== gen) return;
      if (!(await take(8))) break;
      let size = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
      const type = String.fromCharCode(buf[4], buf[5], buf[6], buf[7]);
      if (size === 1) {
        if (!(await take(16))) break;
        const lo = (buf[8] << 24 | buf[9] << 16 | buf[10] << 8 | buf[11]) >>> 0;
        const hi = (buf[12] << 24 | buf[13] << 16 | buf[14] << 8 | buf[15]) >>> 0;
        size = hi * 0x100000000 + lo;
      }
      if (size === 0) break;
      if (!(await take(size))) break;
      const abs = startByte + (mse.tracks[tag]._off || 0);
      const data = buf.subarray(0, size);
      buf = buf.subarray(size);
      mse.tracks[tag]._off = (mse.tracks[tag]._off || 0) + size;
      if (type === "sidx" && startByte === 0 && !mse.tables[tag]) {
        mse.tables[tag] = parseSidx(data, abs + size);
      } else if (type === "moof") {
        if (startByte === 0 && !track.initDone && mse.initParts[tag]) {
          track.initDone = true;
          sb._q.push(concatArrays(mse.initParts[tag]));
          msePump(sb);
        }
        frag = [data];
      } else if (type === "mdat" && frag) {
        frag.push(data);
        const blob = concatArrays(frag);
        frag = null;
        if (mse.gen !== gen) return;
        if (startByte === 0) mse.gotInit[tag] = true;
        sb._q.push(blob);
        msePump(sb);
      } else if ((type === "ftyp" || type === "moov") && startByte === 0) {
        (mse.initParts[tag] = mse.initParts[tag] || []).push(data);
      }
    }
    track.done = true;
    mseAfter(sb);
  } catch (e) {
    if (mse.gen === gen && e.name !== "AbortError") mseFail("track: " + e.message);
  }
}

function mseRange(t) {
  const sb = mse.sbv;
  if (!sb || !sb.buffered || !sb.buffered.length) return null;
  const b = sb.buffered;
  return { start: b.start(0), end: b.end(b.length - 1) };
}

function mseSeek(t) {
  const video = $("#player");
  const r = mseRange(t);
  if (r && t >= r.start - 0.2 && t <= r.end) {
    video.currentTime = t;
    return;
  }
  const total = state.player.total || 0;
  if (!total || r === null || t >= total) { video.currentTime = t; return; }
  const vEntry = pickEntry(mse.tables.v, t);
  const aEntry = pickEntry(mse.tables.a, t);
  if (!vEntry || !aEntry || !mse.gotInit.v || !mse.gotInit.a) { video.currentTime = t; return; }
  mse.gen++;
  const gen = mse.gen;
  for (const sb of [mse.sbv, mse.sba]) {
    if (!sb) continue;
    sb._q = [];
    removeAll(sb);
  }
  mseRun("v", state.current.formats.video.find((f) => f.url)?.url || "", vEntry.start);
  mseRun("a", state.current.formats.audio.find((f) => f.url)?.url || "", aEntry.start);
  video.currentTime = t;
}

function removeAll(sb) {
  if (!sb || !sb.buffered || !sb.buffered.length) return;
  if (sb.updating) { sb._after = () => removeAll(sb); return; }
  try { sb.remove(0, sb.buffered.end(sb.buffered.length - 1)); } catch { /* ok */ }
}

function mseFail(msg) {
  if (mse.failed > 0) return;
  mse.failed++;
  mseClose();
  const video = $("#player");
  video.removeAttribute("src");
  video.load();
  toast("HD mux failed (" + msg + ") \u2014 falling back to low-res stream");
  setTimeout(() => {
    video.src = "/api/stream?id=" + (state.current?.id || "");
    video.play().catch(() => {});
  }, 150);
}

function startCloudPlay() {
  mse.failed = 0;
  const v = state.current?.formats?.video?.find((f) => f.url);
  if (v && mse.usable(v.codecs)) {
    if (mseStart()) {
      toast(v.height >= 720 ? v.height + "p \u2022 web mux" : v.height + "p");
      return;
    }
  }
  const video = $("#player");
  video.src = "/api/stream?id=" + state.current.id;
  video.play().catch(() => {});
}

/* ---------- watch ---------- */
function playFrom(list, i) {
  if (!list[i]) return false;
  state.results = list;
  state.index = i;
  openVideo(i);
  return true;
}

async function openVideo(listIndex) {
  const v = state.results[listIndex];
  if (!v) return;
  state.index = listIndex;
  location.hash = "/watch/" + v.id;
  show("watch");
  const video = $("#player");
  const overlay = $("#overlay");
  overlay.classList.remove("err");
  $("#overlay-msg").textContent = "Preparing stream...";
  mseClose();
  video.removeAttribute("src");
  video.load();
  state.player.total = 0;
  state.player.offset = 0;
  state.current = null;
  updateControls();
  renderSbMarkers();
  document.title = v.title + " \u2014 actuallyYOUtube";
  $("#w-title").textContent = v.title;
  $("#w-stats").textContent = "";
  $("#w-channel").textContent = "";
  $("#w-desc").textContent = "";
  $("#w-desc-box").classList.add("hidden");
  $("#w-original").href = "https://www.youtube.com/watch?v=" + v.id;
  setSubButton(false);
  pushHistory(v);
  try {
    const res = await fetch("/api/video?id=" + v.id);
    const info = await res.json();
    if (info.error) throw new Error(info.error);
    state.current = info;
    state.player.total = info.duration || 0;
    $("#w-title").textContent = info.title;
    $("#w-channel").textContent = info.channel;
    const initial = (info.channel || "?").trim()[0]?.toUpperCase() || "?";
    $("#w-avatar").className = "avatar letter";
    $("#w-avatar").textContent = initial;
    if (info.channel_id) {
      fetch("/api/channel?id=" + info.channel_id).then((r) => r.json()).then((ch) => {
        if (okAvatar(ch.avatar) && state.current && state.current.channel_id === info.channel_id) {
          const av = $("#w-avatar");
          av.className = "avatar";
          av.textContent = "";
          const img = document.createElement("img");
          img.src = ch.avatar;
          img.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover;display:block";
          img.onerror = () => { av.className = "avatar letter"; av.textContent = initial; };
          img.alt = "";
          av.appendChild(img);
        }
      }).catch(() => {});
    }
    $("#w-stats").textContent = [
      fmtViews(info.views),
      daysAgo(info.date),
      info.duration ? fmtDur(info.duration) : "",
      info.channel_id ? "Subscribed \u2014 \u2713 saved locally" : "",
    ].filter(Boolean).join(" \u00B7 ").replace(" \u00B7 Subscribed", "");
    $("#w-original").href = "https://www.youtube.com/watch?v=" + v.id;
    if (info.description) {
      $("#w-desc").textContent = info.description;
      $("#w-desc-box").classList.remove("hidden");
    }
    setSubButton(isSubbed(info.channel_id));
    updateControls();
    renderSbMarkers();
    setupSb(v.id, info.duration);
    video.poster = info.thumbnail;
    if (info.isLive) toast("Live streams may not play in this version.");
    setTimeout(() => {
      if (state.cloud) {
        startCloudPlay();
      } else {
        video.src = "/api/stream?id=" + v.id;
        video.play().catch(() => {});
      }
    }, 150);
  } catch (e) {
    overlay.classList.add("err");
    $("#overlay-msg").textContent = "Could not play \u2014 " + e.message;
  }
}

function nextVideo() {
  return playFrom(state.results, state.index + 1);
}

function openChannel(channelId) {
  if (!channelId) return;
  show("results");
  const grid = $("#results-grid");
  grid.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  $("#results-title").textContent = "Channel videos";
  $("#results-empty").classList.add("hidden");
  fetch("/api/channel/videos?id=" + channelId).then((r) => r.json()).then((data) => {
    if (data.error) throw new Error(data.error);
    grid.innerHTML = "";
    if (!data.results.length) {
      $("#results-empty").textContent = "No videos found for this channel.";
      $("#results-empty").classList.remove("hidden");
      return;
    }
    state.results = data.results;
    state.index = 0;
    renderCards(data.results, grid, (i) => openVideo(i), true);
  }).catch((e) => {
    grid.innerHTML = "";
    toast("Channel failed: " + e.message);
  });
}

function renderChSub() {
  const b = $("#ch-sub");
  if (!b) return;
  const on = isSubbed(state.current?.channel_id);
  b.textContent = on ? "Subscribed" : "Subscribe";
  b.classList.toggle("done", on);
}

async function searchChannel(q) {
  show("results");
  const hero = $("#chan-hero");
  const grid = $("#results-grid");
  hero.classList.add("hidden");
  grid.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  $("#results-title").textContent = q;
  $("#results-empty").classList.add("hidden");
  try {
    const res = await fetch("/api/channel/search?q=" + encodeURIComponent(q));
    const data = await res.json();
    if (!data.found || !data.channel) throw new Error("not found");
    const ch = data.channel;
    state.current = { channel_id: ch.id, channel: ch.name };
    $("#results-title").textContent = ch.name;
    hero.classList.remove("hidden");
    hero.innerHTML = "";
    const letter = esc((ch.name || "?")[0] || "?");
    const av = okAvatar(ch.avatar)
      ? "<img class=\"ch-av\" src=\"" + esc(ch.avatar) + "\" alt=\"\" onerror=\"this.replaceWith(Object.assign(document.createElement('span'),{className:'ch-av letter',textContent:'" + letter + "'}))\">"
      : "<span class=\"ch-av letter\">" + letter + "</span>";
    hero.innerHTML =
      av +
      '<div class="ch-info"><b>' + esc(ch.name) + "</b>" +
      '<p class="muted">' + (ch.subscribers ? fmtViews(ch.subscribers) + " subscribers" : "") + "</p></div>" +
      '<button class="sub" id="ch-sub">Subscribe</button>';
    renderChSub();
    $("#ch-sub").addEventListener("click", toggleSub);
    const videos = (data.videos && data.videos.length)
      ? data.videos
      : ((await (await fetch("/api/channel/videos?id=" + ch.id)).json()).results || []);
    grid.innerHTML = "";
    if (!videos.length) {
      $("#results-empty").textContent = "No videos found for this channel.";
      $("#results-empty").classList.remove("hidden");
      return;
    }
    state.results = videos;
    state.index = 0;
    renderCards(videos, grid, (i) => openVideo(i), true);
  } catch (e) {
    hero.classList.add("hidden");
    grid.innerHTML = "";
    $("#results-empty").textContent = "No channel found for " + q + ". Check the spelling.";
    $("#results-empty").classList.remove("hidden");
  }
}

/* ---------- accounts & subscriptions ---------- */
async function loadAccounts() {
  try {
    const res = await fetch("/api/accounts");
    state.cloud = !res.ok;
  } catch {
    state.cloud = true;
  }
  state.accounts = state.cloud ? lsAccounts() : await (await fetch("/api/accounts")).json();
  const id = localStorage.getItem("ayt_account");
  state.account = state.accounts.find((a) => a.id === id) || state.accounts[0] || null;
  if (state.account) localStorage.setItem("ayt_account", state.account.id);
  renderAccountMenu();
}

function isSubbed(chid) {
  if (!state.account || !chid) return false;
  return state.account.subs.some((s) => s.channel_id === chid);
}

function setSubButton(on) {
  const b = $("#w-sub");
  b.textContent = on ? "Subscribed" : "Subscribe";
  b.classList.toggle("done", on);
  b.disabled = !state.current?.channel_id;
}

async function refreshAccount() {
  const prev = state.account?.id;
  await loadAccounts();
  if (prev) {
    state.account = state.accounts.find((a) => a.id === prev) || state.account;
    localStorage.setItem("ayt_account", state.account?.id || "");
  }
  renderAccountMenu();
}

async function toggleSub() {
  const info = state.current;
  if (!info?.channel_id) return;
  if (!state.account) {
    toast("Create an account first \u2014 click the + button up top.");
    openAccMenu(true);
    return;
  }
  const on = isSubbed(info.channel_id);
  if (on) {
    if (state.cloud) {
      const acc = state.account;
      acc.subs = acc.subs.filter((s) => s.channel_id !== info.channel_id);
      saveLsAccount(acc);
      setSubButton(false);
      toast("Unsubscribed from " + info.channel);
    } else {
      await fetch(`/api/account/${state.account.id}/subs/${info.channel_id}`, { method: "DELETE" });
      setSubButton(false);
      toast("Unsubscribed from " + info.channel);
    }
  } else {
    let avatar = "";
    try {
      const ch = await (await fetch("/api/channel?id=" + info.channel_id)).json();
      avatar = okAvatar(ch.avatar) ? ch.avatar : "";
    } catch { /* ok */ }
    if (state.cloud) {
      const acc = state.account;
      const idx = acc.subs.findIndex((s) => s.channel_id === info.channel_id);
      const sub = { channel_id: info.channel_id, name: info.channel, avatar, ts: Date.now() };
      if (idx >= 0) acc.subs[idx] = sub; else acc.subs.push(sub);
      saveLsAccount(acc);
      setSubButton(true);
      toast("Subscribed to " + info.channel + " \u2014 saved on this device");
    } else {
      await fetch(`/api/account/${state.account.id}/subs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: info.channel_id, name: info.channel, avatar }),
      });
      setSubButton(true);
      toast("Subscribed to " + info.channel + " \u2014 saved locally");
    }
  }
  await refreshAccount();
  renderChSub();
}

function renderAccountMenu() {
  const menu = $("#acct-menu");
  const btn = $("#acct-btn");
  if (state.account) {
    btn.style.background = state.account.color;
    btn.textContent = state.account.name.trim()[0].toUpperCase();
    btn.classList.remove("plus");
  } else {
    btn.style.background = "var(--panel)";
    btn.textContent = "+";
    btn.classList.add("plus");
  }
  menu.innerHTML = "";
  if (state.accounts.length) {
    const t = document.createElement("p");
    t.className = "menu-title";
    t.textContent = "Local accounts";
    menu.appendChild(t);
  }
  state.accounts.forEach((a) => {
    const row = document.createElement("button");
    row.className = "m-row";
    row.innerHTML = `<span class="dot" style="background:${esc(a.color)}">${esc(a.name.trim()[0]?.toUpperCase() || "?")}</span>
      <span>${esc(a.name)}</span><span class="cnt">${a.subs.length} sub(s)</span>
      <span class="x" title="Delete account">\u00D7</span>`;
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("x")) {
        if (confirm("Delete account \u201C" + a.name + "\u201D?")) {
          if (state.cloud) {
            const list = lsAccounts().filter((x) => x.id !== a.id);
            saveLsAccounts(list);
            loadAccounts();
          } else {
            fetch("/api/accounts/" + a.id, { method: "DELETE" }).then(loadAccounts);
          }
        }
        return;
      }
      localStorage.setItem("ayt_account", a.id);
      state.account = a;
      document.body.classList.remove("menu-open");
      menu.classList.add("hidden");
      loadAccounts().then(() => { renderHome(); setSubButton(isSubbed(state.current?.channel_id)); });
    });
    menu.appendChild(row);
  });
  if (state.accounts.length) {
    const sep = document.createElement("div");
    sep.className = "m-sep";
    menu.appendChild(sep);
  }
  const form = document.createElement("div");
  form.className = "acc-form";
  let color = ACC_COLORS[Math.floor(Math.random() * ACC_COLORS.length)];
  form.innerHTML = `
    <input id="acc-name" maxlength="30" placeholder="Your name...">
    <div class="swatches">${ACC_COLORS.map((c) => `<button style="background:${c}" data-c="${c}"></button>`).join("")}</div>
    <button class="save">Create account</button>`;
  form.querySelector(".swatches").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    color = b.dataset.c;
    form.querySelectorAll(".swatches button").forEach((x) => x.classList.remove("sel"));
    b.classList.add("sel");
  });
  form.querySelector(".save").addEventListener("click", async () => {
    const name = form.querySelector("#acc-name").value.trim();
    if (!name) return;
    let acc;
    if (state.cloud) {
      acc = { id: Math.random().toString(36).slice(2, 10), name, color, subs: [] };
      saveLsAccounts(lsAccounts().concat(acc));
    } else {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      acc = await res.json();
    }
    localStorage.setItem("ayt_account", acc.id);
    menu.classList.add("hidden");
    await loadAccounts();
    renderHome();
    setSubButton(isSubbed(state.current?.channel_id));
    toast("Account \u201C" + name + "\u201D created \u2014 saved on this device");
  });
  menu.appendChild(form);
}

function openAccMenu(forceForm) {
  $("#acct-menu").classList.toggle("hidden");
}

/* ---------- home ---------- */
async function renderHome() {
  $("#subs-wrap").classList.add("hidden");
  $("#history-wrap").classList.add("hidden");
  renderHistory();
  if (!state.account) {
    $("#subs-list").innerHTML = "";
    $("#home-empty").classList.remove("hidden");
    return;
  }
  $("#home-empty").classList.add("hidden");
  let groups = [];
  if (state.cloud) {
    const subs = state.account.subs || [];
    if (!subs.length) {
      $("#subs-list").innerHTML = "";
      $("#subs-wrap").classList.add("hidden");
      if (!document.querySelector("#history .card")) {
        $("#home-empty").classList.remove("hidden");
      }
      return;
    }
    const fetched = await Promise.all(subs.slice(0, 5).map(async (sub) => {
      try {
        const r = await (await fetch("/api/channel/videos?id=" + sub.channel_id)).json();
        return { channel: sub, videos: (r.results || []).slice(0, 8) };
      } catch { return null; }
    }));
    groups = fetched.filter(Boolean);
  } else {
    try {
      const res = await fetch("/api/home?acc=" + state.account.id);
      groups = (await res.json()).groups || [];
    } catch (e) {
      toast("Subscriptions failed to load: " + e.message);
      groups = [];
    }
  }
  const subsList = $("#subs-list");
  subsList.innerHTML = "";
  if (!groups.length) {
    $("#subs-wrap").classList.add("hidden");
    if (!document.querySelector("#history .card")) {
      $("#home-empty").classList.remove("hidden");
    }
    return;
  }
  $("#subs-wrap").classList.remove("hidden");
  groups.forEach((g) => {
      const grp = document.createElement("div");
      grp.className = "group";
      const ch = g.channel;
      const letter = esc((ch.name || "?")[0] || "?");
      const avatarHtml = okAvatar(ch.avatar)
        ? "<img class=\"g-av\" src=\"" + esc(ch.avatar) + "\" alt=\"\" onerror=\"this.className='g-av letter';this.textContent='" + letter + "'\">"
        : "<span class=\"g-av letter\">" + letter + "</span>";
      grp.innerHTML = `
        <div class="group-head">
          ${avatarHtml}
          <b class="g-name">${esc(ch.name)}</b>
          <span class="g-subs"></span>
        </div>`;
      grp.querySelector(".g-name").addEventListener("click", () => openChannel(ch.channel_id));
      const grid = document.createElement("div");
      grid.className = "grid";
      g.videos.forEach((v, i) => {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = cardHtml(v, true);
        card.addEventListener("click", () => playFrom(g.videos, i));
        grid.appendChild(card);
      });
      grp.appendChild(grid);
      subsList.appendChild(grp);
    });
}

/* ---------- history (local only) ---------- */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); } catch { return []; }
}

function pushHistory(v) {
  const items = getHistory().filter((h) => h.id !== v.id);
  items.unshift({ id: v.id, title: v.title, channel: v.channel, thumb: v.thumb, ts: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 24)));
}

function renderHistory() {
  const items = getHistory().slice(0, 12);
  const wrap = $("#history-wrap");
  if (!items.length) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  renderCards(items, $("#history"), (i) => playFrom(getHistory(), i));
}

/* ---------- toast ---------- */
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.add("hidden"), 4200);
}

/* ---------- routing ---------- */
function route() {
  const h = location.hash;
  if (h.startsWith("#/watch/")) {
    const id = h.slice(8);
    const found = state.results.findIndex((r) => r.id === id);
    if (found >= 0) { openVideo(found); return; }
    const hist = getHistory().find((r) => r.id === id);
    playFrom(hist ? [hist] : [{ id, title: "Loading...", channel: "", thumb: "" }], 0);
    return;
  }
  if (h.startsWith("#?q=")) {
    doSearch(decodeURIComponent(h.slice(4)));
    return;
  }
  if (h === "#watch" || h === "#/") { location.hash = ""; } 
  goHome();
}

/* ---------- init ---------- */
function init() {
  applyThemeIcon();
  $("#theme-btn").addEventListener("click", toggleTheme);
  $("#sb-toggle").textContent = state.sb.on ? "SB ON" : "SB OFF";
  $("#sb-toggle").classList.toggle("sb-off", !state.sb.on);
  $("#sb-toggle").addEventListener("click", () => {
    state.sb.on = !state.sb.on;
    localStorage.setItem("ayt_sb", state.sb.on ? "1" : "0");
    $("#sb-toggle").textContent = state.sb.on ? "SB ON" : "SB OFF";
    $("#sb-toggle").classList.toggle("sb-off", !state.sb.on);
    toast("SponsorBlock " + (state.sb.on ? "on" : "off"));
  });

  $("#search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    doSearch($("#search-input").value);
    $("#search-input").blur();
  });
  $("#back-btn").addEventListener("click", () => history.back());
  $("#chips").innerHTML = CHIPS.map((c) => `<button>${esc(c)}</button>`).join("");
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    $("#search-input").value = b.textContent;
    doSearch(b.textContent);
  });

  $("#acct-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openAccMenu();
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".acct")) $("#acct-menu").classList.add("hidden");
  });
  $("#w-channel").addEventListener("click", () => openChannel(state.current?.channel_id));
  $("#w-sub").addEventListener("click", toggleSub);

  /* player */
  const wrap = $("#wrap"), video = $("#player");
  $("#btn-play").innerHTML = IC_PLAY;
  $("#btn-fs").innerHTML = IC_FS;
  $("#btn-play").addEventListener("click", () => {
    if (video.paused) video.play(); else video.pause();
  });
  video.addEventListener("click", () => { if (video.paused) video.play(); else video.pause(); });
  video.addEventListener("play", () => {
    state.player.playing = true;
    $("#btn-play").innerHTML = IC_PAUSE;
    showCtrl(true);
  });
  video.addEventListener("pause", () => {
    state.player.playing = false;
    $("#btn-play").innerHTML = IC_PLAY;
    showCtrl(true);
  });
  video.addEventListener("playing", () => $("#overlay").classList.add("hidden"));
  video.addEventListener("timeupdate", () => {
    updateControls();
    sbTick(absTime());
  });
  video.addEventListener("progress", updateControls);
  video.addEventListener("waiting", () => {
    $("#overlay").classList.remove("hidden");
    $("#overlay-msg").textContent = "Buffering...";
  });
  video.addEventListener("error", () => {
    const o = $("#overlay");
    o.classList.add("err");
    $("#overlay-msg").textContent = "Could not play this video \u2014 it may be restricted or removed.";
  });
  video.addEventListener("ended", () => {
    if (nextVideo()) toast("Up next...");
    else goHome();
  });
  $("#seek").addEventListener("change", (e) => seekTo(parseFloat(e.target.value)));
  $("#seek").addEventListener("input", () => {
    const total = state.player.total;
    if (!total) return;
    const p = parseFloat($("#seek").value || "0");
    $("#pplay").style.width = (p / total) * 100 + "%";
    $("#time").textContent = fmtDur(p) + " / " + fmtDur(total);
  });
  $("#vol").addEventListener("input", (e) => {
    const v = parseFloat(e.target.value);
    video.volume = v;
    video.muted = v === 0;
    updateControls();
  });
  $("#btn-mute").addEventListener("click", () => {
    video.muted = !video.muted;
    updateControls();
  });
  $("#btn-fs").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else wrap.requestFullscreen().catch(() => {});
  });
  document.addEventListener("fullscreenchange", () => {
    $("#btn-fs").innerHTML = document.fullscreenElement ? IC_FSX : IC_FS;
  });
  wrap.addEventListener("mousemove", () => showCtrl(false));
  wrap.addEventListener("mouseleave", () => {
    clearTimeout(state.player.hideTimer);
    if (state.player.playing) $("#ctrl").classList.remove("show");
  });
  document.addEventListener("keydown", (e) => {
    if ($("#watch").classList.contains("hidden")) return;
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.code === "Space") { e.preventDefault(); if (video.paused) video.play(); else video.pause(); }
    if (e.key === "ArrowRight") seekTo(absTime() + 10);
    if (e.key === "ArrowLeft") seekTo(absTime() - 10);
    if (e.key === "m" || e.key === "M") { video.muted = !video.muted; updateControls(); }
    if (e.key === "f" || e.key === "F") $("#btn-fs").click();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#watch").classList.contains("hidden")) history.back();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("#install-btn").classList.remove("hidden");
  });
  $("#install-btn").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("#install-btn").classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => toast("actuallyYOUtube installed \u2014 find it in your Start menu."));

  loadAccounts().then(renderHome);
  window.addEventListener("hashchange", route);
  route();
}

document.addEventListener("DOMContentLoaded", init);