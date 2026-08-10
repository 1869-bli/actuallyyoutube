import { json } from "../_lib/inn.js";

export async function onRequest(context) {
  const target = new URL(context.request.url).searchParams.get("u") || "";
  const ok = /^https:\/\/[a-z0-9-]+\.googlevideo\.com\/.*$/i.test(target) ||
    /^https:\/\/(inv\.nadeko\.net|yewtu\.be|invidious\.nerdvpn\.de)\/.*$/i.test(target);
  if (!ok) {
    return json({ error: "forbidden" }, 403);
  }
  const headers = { "User-Agent": "Mozilla/5.0" };
  const range = context.request.headers.get("range");
  if (range) headers["Range"] = range;
  const upstream = await fetch(target, { headers, redirect: "follow" });
  const out = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
  if (upstream.status === 206) out.headers.set("Content-Range", upstream.headers.get("content-range"));
  return out;
}