import { json, getVideoStreams } from "../_lib/inn.js";

export async function onRequest(context) {
  const vid = new URL(context.request.url).searchParams.get("id") || "";
  if (!vid) return json({ error: "missing id" }, 400);
  const info = await getVideoStreams(vid);
  if (info.err || !info.single) return json({ error: "no playable stream" }, 502);
  return new Response(null, { status: 302, headers: { Location: info.single } });
}