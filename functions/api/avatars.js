import { json, cached, ytJson, channelHeader } from "../_lib/inn.js";

export async function onRequest(context) {
  const ids = (new URL(context.request.url).searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = {};
  for (const chid of ids.slice(0, 8)) {
    const h = await cached(`channel:${chid}`, 3600, async () => {
      try {
        const r = await ytJson("browse", { browseId: chid });
        return channelHeader(r.data);
      } catch {
        return null;
      }
    });
    out[chid] = (h && h.avatar) || "";
  }
  return json(out);
}