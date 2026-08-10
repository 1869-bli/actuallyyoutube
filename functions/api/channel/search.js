import { json, ytJson, searchItems, cached, parseCount } from "../../_lib/inn.js";

export async function onRequest(context) {
  const q = (new URL(context.request.url).searchParams.get("q") || "").trim().replace(/^@/, "");
  if (!q) return json({ found: false });
  try {
    const found = await cached(`handle:${q.toLowerCase()}`, 1800, async () => {
      const r = await ytJson("search", { query: q, params: "EgIQAg%3D%3D" });
      for (const c of searchItems(r.data)) {
        const ch = c.channelRenderer;
        if (!ch || !ch.channelId) continue;
        const thumbs = ch.thumbnail?.thumbnails || [];
        return {
          id: ch.channelId,
          name: ch.title?.simpleText || ch.title?.runs?.map((x) => x.text).join("") || "",
          avatar: thumbs.length && !/sponsor|banner/i.test((thumbs[thumbs.length - 1].url || "") + (ch.thumbnail?.thumbnails?.[0]?.url || ""))
            ? thumbs[thumbs.length - 1].url || ""
            : "",
          subscribers: parseCount(ch.subscriberCountText?.simpleText),
        };
      }
      return null;
    });
    if (!found) return json({ found: false });
    return json({ found: true, channel: found });
  } catch {
    return json({ found: false });
  }
}