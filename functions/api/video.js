import { json, getVideoStreams } from "../_lib/inn.js";

export async function onRequest(context) {
  const vid = new URL(context.request.url).searchParams.get("id") || "";
  if (!vid) return json({ error: "missing id" }, 400);
  const info = await getVideoStreams(vid);
  if (info.err) return json({ error: info.error || "unplayable" }, 502);
  return json({
    id: vid,
    title: info.title || "Untitled",
    channel: info.channel || "Unknown",
    channel_id: info.channel_id,
    views: info.views,
    likes: info.likes,
    date: info.date,
    duration: info.duration,
    description: info.description,
    isLive: info.isLive,
    thumbnail: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`,
    thumb_alt: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    stream: { video: null, audio: null, single: info.single },
    formats: info.formats || { video: [], audio: [] },
  });
}