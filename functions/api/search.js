import { json, ytJson, searchItems, videoFromRenderer } from "../_lib/inn.js";

export async function onRequest(context) {
  const q = new URL(context.request.url).searchParams.get("q") || "";
  if (q.trim().length < 2) return json({ results: [] });
  let data;
  try {
    const r = await ytJson("search", { query: q.trim() });
    data = r.data;
  } catch {
    return json({ error: "search failed" }, 502);
  }
  const results = [];
  for (const c of searchItems(data)) {
    const v = videoFromRenderer(c);
    if (v) results.push(v);
    if (results.length >= 20) break;
  }
  return json({ results });
}