const KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const CLIENT_WEB = {
  clientName: "WEB",
  clientVersion: "2.20250826.00.00",
};
const CLIENT_VR = {
  clientName: "ANDROID_VR",
  clientVersion: "1.60.19",
  androidSdkVersion: 33,
  userAgent: "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12) gzip",
};
export const CHANNEL_VIDEOS_PARAMS = "EgZ2aWRlb3PyBgQKAjoA";

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function freshVisitor() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return "Cgt" + btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + "Sg";
}

export async function ytJson(endpoint, data, extraContext = {}, client = CLIENT_WEB, visitor = "") {
  const body = JSON.stringify({
    context: { client: { ...client, ...(visitor ? { visitorData: visitor } : {}) }, ...extraContext },
    ...data,
  });
  let resp = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body,
  });
  if (resp.status === 429 || resp.status === 500 || resp.status === 503) {
    await new Promise((r) => setTimeout(r, 1500));
    resp = await fetch(`https://www.youtube.com/youtubei/v1/${endpoint}?key=${KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body,
    });
  }
  let payload = {};
  try {
    const text = await resp.text();
    try { payload = JSON.parse(text); } catch { /* html or empty */ }
  } catch { /* body read failed */ }
  return { status: resp.status, data: payload };
}

export async function cached(key, ttl, fn) {
  const cache = caches.default;
  const req = new Request(`https://ayt-cache.local/${encodeURIComponent(key)}`);
  const hit = await cache.match(req);
  if (hit) return (await hit.json()).value;
  const value = await fn();
  if (value && value.err) return value;
  const resp = new Response(JSON.stringify({ value }), {
    headers: { "Cache-Control": `s-maxage=${ttl}` },
  });
  await cache.put(req, resp);
  return value;
}

export function parseDur(text) {
  const parts = String(text || "").split(":").map((p) => parseInt(p, 10));
  if (!parts.length || parts.some((n) => isNaN(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseCount(text) {
  const m = String(text || "").replace(/,/g, "").match(/([\d.]+)\s*([KMB]?)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase()] || 1;
  return Math.round(n * mult);
}

export function videoFromRenderer(c) {
  const r = c && (c.videoRenderer || c.gridVideoRenderer || c.compactVideoRenderer);
  if (r) {
    if (!r.videoId) return null;
    return {
      id: r.videoId,
      title: r.title?.runs?.[0]?.text || r.title?.simpleText || "",
      channel: r.longBylineText?.runs?.[0]?.text || r.ownerText?.runs?.[0]?.text || r.shortBylineText?.runs?.[0]?.text || "",
      channel_id: r.channelId || r.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || "",
      duration: parseDur(r.lengthText?.simpleText) || parseDur(r.lengthText?.accessibility?.accessibilityData?.label),
      views: parseCount(r.viewCountText?.simpleText),
      thumb: `https://i.ytimg.com/vi/${r.videoId}/hqdefault.jpg`,
    };
  }
  const l = c?.lockupViewModel;
  if (l) {
    const nav = l.rendererContext?.commandContext?.onTap?.innertubeCommand || l.rendererContext?.commandContext?.onTap?.command || {};
    const watch = nav?.watchEndpoint || nav?.innertubeCommand?.watchEndpoint;
    const id = watch?.videoId;
    if (!id) return null;
    const meta = l.metadata?.lockupMetadataViewModel;
    const rows = (meta?.metadata?.contentMetadataViewModel?.metadataRows || []).map((row) =>
      (row.metadataParts || []).map((p) => p.text?.content || "").join(" ")
    );
    return {
      id,
      title: meta?.title?.content || meta?.title || "",
      channel: meta?.metadata?.contentMetadataViewModel?.metadataParts?.[0]?.text?.content || "",
      channel_id: "",
      duration: parseDur(rows[0]),
      views: parseCount(rows[0]) || parseCount(rows[1]),
      thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  return null;
}

export function searchItems(data) {
  const sec = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer;
  return sec?.contents?.find((c) => c.itemSectionRenderer)?.itemSectionRenderer?.contents || [];
}

export function browseTabs(data) {
  return data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
}

export function tabRichItems(tab) {
  const c = tab?.tabRenderer?.content;
  if (!c) return [];
  if (c.richGridRenderer) {
    return (c.richGridRenderer.contents || []).map((i) => i.richItemRenderer?.content || i);
  }
  if (c.sectionListRenderer) {
    const items = [];
    for (const s of c.sectionListRenderer.contents || []) {
      if (s.itemSectionRenderer) items.push(...(s.itemSectionRenderer.contents || []));
    }
    return items;
  }
  return [];
}

export function channelHeader(data) {
  const br = data?.contents?.twoColumnBrowseResultsRenderer;
  const top = br?.header || data?.header;
  const phr = top?.pageHeaderRenderer;
  const pv = phr?.pageHeaderViewModel || phr?.content?.pageHeaderViewModel;
  const c4 = top?.c4TabbedHeaderRenderer;
  const cMR = data?.metadata?.channelMetadataRenderer;
  const flat = (xs) => (xs || []).map((x) => x.url).filter(Boolean);
  let name = "", avatar = "", subs = null, desc = "";
  const rowText = (md) =>
    (md?.metadataRows || []).map((row) => (row.metadataParts || []).map((p) => p.text?.content || "").join(" ")).join(" ");
  if (c4) {
    name = c4.title || "";
    avatar = flat(c4.avatar?.thumbnails).pop() || "";
    subs = parseCount(c4.subscriberCountText?.simpleText) || parseCount(c4.subscriberCountText?.accessibility?.accessibilityData?.label);
    desc = c4.description?.simpleText || "";
  }
  if (pv) {
    const md = pv.metadata || {};
    const cmv = md.contentMetadataViewModel || md;
    if (!name) name = cmv.title || md.title || md.pinnedContentMetadataViewModel?.title?.content || "";
    if (!avatar) {
      const img = pv.image?.contentImage?.image;
      avatar = flat(img?.sources).concat(flat(img?.fallbackSources)).find((u) => !/-fcrop|-ndf/.test(u)) || "";
    }
    if (!avatar) {
      const av = pv.avatar?.avatarViewModel?.image;
      avatar = flat(av?.sources).concat(flat(av?.fallbackSources)).find((u) => !/-fcrop|-ndf/.test(u)) || "";
    }
    if (subs == null) subs = parseCount(rowText(cmv));
    if (!desc) desc = pv.description?.content || "";
  }
  if (!name) name = cMR?.title || "";
  if (!avatar) avatar = flat(cMR?.avatar?.thumbnails).pop() || "";
  if (!desc || desc === "\n") desc = cMR?.description || "";
  if (subs == null) subs = parseCount(cMR?.subscriberCountText) || parseCount(cMR?.subscriberCountText?.simpleText);
  if (!name && !avatar) return null;
  return { name, avatar, subscribers: subs, description: desc, id: "" };
}

export function pickProgressive(formats) {
  const withAudio = (formats || []).filter((f) => f.url && f.audioQuality);
  const mp4 = withAudio.filter((f) => /video\/mp4/.test(f.mimeType || ""));
  const pool = mp4.length ? mp4 : withAudio;
  return pool.sort((a, b) => (b.height || 0) - (a.height || 0))[0] || null;
}

function fmtInfo(f) {
  return { itag: f.itag, url: f.url, codecs: f.mimeType || "", height: f.height, width: f.width, bitrate: f.bitrate };
}

function decipherUrl(f) {
  if (f.url) return f.url;
  if (!f.signatureCipher && !f.cipher) return "";
  const qs = new URLSearchParams(f.signatureCipher || f.cipher);
  const url = qs.get("url") || "";
  const sig = qs.get("s") || "";
  const sp = qs.get("sp") || "signature";
  if (!sig) return url;
  const u = new URL(url);
  u.searchParams.set(sp, sig);
  return u.toString();
}

async function playerFromPage(vid) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${vid}&hl=en&gl=US`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  const visitor = (html.match(/"VISITOR_DATA":"([^"]+)"/) || [])[1] || "";
  const key = "ytInitialPlayerResponse";
  let idx = html.indexOf(key);
  while (idx >= 0) {
    const before = html.slice(idx + key.length, idx + key.length + 20);
    if (/^\s*=/.test(before)) {
      let i = idx + key.length;
      while (i < html.length && html[i] !== "{") i++;
      let depth = 0, instr = false, esc = false;
      for (; i < html.length; i++) {
        const ch = html[i];
        if (instr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') instr = false;
        } else if (ch === '"') instr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (!depth) break; }
      }
      try {
        return { data: JSON.parse(html.slice(html.lastIndexOf("{", i), i + 1)), visitor };
      } catch { /* try next occurrence */ }
    }
    idx = html.indexOf(key, idx + key.length);
  }
  const em = html.match(/"ytInitialPlayerResponse"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (em) {
    try { return { data: JSON.parse(JSON.parse('"' + em[1] + '"')), visitor }; } catch { /* not json */ }
  }
  return { data: null, visitor };
}

function pickInfo(data) {
  const vd = data?.videoDetails;
  if (!vd) return null;
  const sd = data?.streamingData || {};
  const all = (sd.formats || []).concat(sd.adaptiveFormats || []);
  const withUrl = all.map((f) => ({ ...f, url: f.url || decipherUrl(f) })).filter((f) => f.url);
  const video = withUrl
    .filter((f) => /video\/mp4/.test(f.mimeType || "") && !/av01/.test(f.mimeType || ""))
    .map(fmtInfo)
    .sort((a, b) => (b.height || 0) - (a.height || 0));
  const audio = withUrl
    .filter((f) => /audio\/mp4/.test(f.mimeType || ""))
    .map(fmtInfo)
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  const prog = pickProgressive(sd.formats);
  return {
    title: vd.title,
    channel: vd.author,
    channel_id: vd.channelId || "",
    views: vd.viewCount ? parseInt(vd.viewCount, 10) : null,
    date: vd.uploadDate || "",
    duration: vd.lengthSeconds ? parseInt(vd.lengthSeconds, 10) : null,
    description: vd.shortDescription || "",
    isLive: !!vd.isLiveContent,
    single: prog ? prog.url : null,
    formats: { video, audio },
  };
}

async function playerFromEmbed(vid) {
  const resp = await fetch(`https://www.youtube-nocookie.com/embed/${vid}?hl=en&gl=US`, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  if (/reload|Sign in to confirm/i.test(html) && !/"ytInitialPlayerResponse"/.test(html)) return null;
  const key = "ytInitialPlayerResponse";
  let idx = html.indexOf(key);
  while (idx >= 0) {
    if (/^\s*=/.test(html.slice(idx + key.length, idx + key.length + 20))) {
      let i = html.indexOf("{", idx);
      let depth = 0, instr = false, esc = false;
      for (; i < html.length; i++) {
        const ch = html[i];
        if (instr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') instr = false;
        } else if (ch === '"') instr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (!depth) break; }
      }
      try { return JSON.parse(html.slice(html.lastIndexOf("{", i), i + 1)); } catch { /* next */ }
    }
    idx = html.indexOf(key, idx + key.length);
  }
  const em = html.match(/"ytInitialPlayerResponse"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (em) {
    try { return JSON.parse(JSON.parse('"' + em[1] + '"')); } catch { /* not json */ }
  }
  return null;
}

export async function getVisitorData() {
  const cachedGet = await caches.default.match("https://ayt-cache.local/visitorData")
    .then((r) => (r ? r.json() : null))
    .catch(() => null);
  if (cachedGet && Date.now() - cachedGet.at < 25 * 60 * 1000) return cachedGet.v;
  try {
    const html = await (await fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" },
    })).text();
    const m = html.match(/"VISITOR_DATA":"([^"]+)"/) || html.match(/"visitorData":"([^"]+)"/);
    if (m && m[1]) {
      await caches.default.put("https://ayt-cache.local/visitorData", new Response(JSON.stringify({ v: m[1], at: Date.now() }), { headers: { "Cache-Control": "s-maxage=1800" } }));
      return m[1];
    }
  } catch { /* fall through */ }
  return "";
}

const INV_APIS = ["https://inv.nadeko.net", "https://yewtu.be", "https://invidious.nerdvpn.de"];

async function invidiousStreams(vid) {
  for (const base of INV_APIS) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`${base}/api/v1/videos/${vid}?fields=formatStreams,adaptiveFormats,title,author,authorId,lengthSeconds,viewCount,publishedText,descriptionHtml`, { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      if (!j?.title) continue;
      const all = (j.adaptiveFormats || []).concat(j.formatStreams || []);
      const withUrl = all.filter((f) => f.url);
      const stripTags = (s) => String(s || "").replace(/<[^>]*>/g, "");
      const video = withUrl
        .filter((f) => /video\//.test(f.type || ""))
        .map((f) => ({ itag: f.itag, url: f.url, codecs: f.type || "", height: f.height ? parseInt(f.height, 10) : 0, bitrate: f.bitrate || 0 }))
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const audio = withUrl
        .filter((f) => /audio\//.test(f.type || ""))
        .map((f) => ({ itag: f.itag, url: f.url, codecs: f.type || "", height: 0, bitrate: f.bitrate || 0 }))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!video.length && !audio.length) continue;
      const prog = withUrl.find((f) => /video\//.test(f.type || ""));
      return {
        title: j.title,
        channel: j.author || "",
        channel_id: j.authorId || "",
        views: j.viewCount || null,
        date: j.publishedText || "",
        duration: j.lengthSeconds ? parseInt(j.lengthSeconds, 10) : null,
        description: stripTags(j.descriptionHtml) || "",
        isLive: false,
        single: prog ? prog.url : null,
        formats: { video, audio },
        via: "invidious",
      };
    } catch { /* try next instance */ }
  }
  return null;
}

export async function getVideoStreams(vid) {
  return cached(`player:v5:${vid}`, 3600, async () => {
    let page = null;
    try {
      page = await playerFromPage(vid);
      if (page?.data?.playabilityStatus?.status === "OK" && page.data?.streamingData) {
        const info = pickInfo(page.data);
        if (info && (info.formats.video.length || info.single)) return info;
      }
    } catch { /* fall through to ladder */ }
    const realVisitor = page?.visitor || (await getVisitorData());
    const attempts = [
      { client: CLIENT_VR, visitor: page?.visitor || "" },
      { client: CLIENT_VR, visitor: realVisitor },
      { client: { ...CLIENT_VR, androidSdkVersion: 31 }, visitor: freshVisitor(), extra: {} },
      { client: { ...CLIENT_VR, clientVersion: "1.60.20" }, visitor: freshVisitor(), extra: {} },
      { client: CLIENT_VR, visitor: realVisitor, extra: { thirdParty: { embedUrl: "https://www.youtube.com/" } } },
    ];
    let data = null;
    let lastStatus = "";
    for (const a of attempts) {
      try {
        const r = await ytJson("player", { videoId: vid }, { hl: "en", gl: "US", ...a.extra }, a.client, a.visitor);
        const ps = r.data?.playabilityStatus;
        if (ps?.status === "OK") { data = r.data; break; }
        if (ps) lastStatus = ps.reason || ps.status || `http ${r.status}`;
        else lastStatus = `http ${r.status}`;
      } catch { /* keep trying */ }
      await new Promise((res) => setTimeout(res, 700));
    }
    const vd = data?.videoDetails;
    const pageNote = page?.data?.playabilityStatus
      ? `watch page says: ${page.data.playabilityStatus.reason || page.data.playabilityStatus.status}`
      : "watch page unavailable";
    if (!vd || !data) {
      const via = await invidiousStreams(vid);
      if (via) return via;
      const err = {
        err: true,
        error: (lastStatus || "unknown") + ". " + pageNote + ". Retry later, or open the video on youtube.com once and try again.",
      };
      return err;
    }
    return pickInfo(data) || { err: true, error: "YouTube did not return playable streams for this video." };