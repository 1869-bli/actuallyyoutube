import { json, cached, ytJson, channelHeader } from "../_lib/inn.js";

export async function onRequest(context) {
  const ids = (new URL(context.request.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const results = await Promise.all(ids.slice(0, 8).map(async (chid) => {
    const h = await cached(`channel:${chid}`, 3600, async () => {
      try {
        const r = await ytJson("browse", { browseId: chid, params: "EgVjaGFubg==" });
        return channelHeader(r.data);
      } catch {
        return null;
      }
    });
    return [chid, (h && h.avatar) || ""];
  }));
  const out = {};
  for (const [chid, avatar] of results) out[chid] = avatar;
  return json(out);
}