import { json } from "../_lib/inn.js";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const params = new URLSearchParams();
  const id = url.searchParams.get("id") || url.searchParams.get("v");
  if (id) params.set("videoID", id);
  const cats = url.searchParams.get("categories");
  if (cats) params.set("categories", cats);
  const target = "https://sponsor.ajay.app/api/skipSegments?" + params.toString();
  try {
    const resp = await fetch(target, { headers: { "User-Agent": "actuallyYOUtube/1.0" } });
    const body = await resp.text();
    let segments = [];
    try { segments = JSON.parse(body); } catch { /* non-json */ }
    return json({ segments: Array.isArray(segments) ? segments : [] });
  } catch {
    return json({ segments: [] });
  }
}