import { json, ytJson, browseTabs, tabRichItems, videoFromRenderer, cached, CHANNEL_VIDEOS_PARAMS } from "../../_lib/inn.js";

export async function onRequest(context) {
  const chid = new URL(context.request.url).searchParams.get("id") || "";
  if (!chid) return json({ error: "missing id" }, 400);
  const results = await cached(`cvideos:${chid}`, 300, async () => {
    try {
      const r = await ytJson("browse", { browseId: chid, params: CHANNEL_VIDEOS_PARAMS });
      const out = [];
      for (const tab of browseTabs(r.data)) {
        for (const item of tabRichItems(tab)) {
          const v = videoFromRenderer(item);
          if (v) out.push(v);
          if (out.length >= 12) break;
        }
        if (out.length >= 12) break;
      }
      return out;
    } catch {
      return [];
    }
  });
  return json({ results });
}