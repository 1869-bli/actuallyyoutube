import { json, ytJson, browseTabs, channelHeader, cached } from "../_lib/inn.js";

export async function onRequest(context) {
  const chid = new URL(context.request.url).searchParams.get("id") || "";
  if (!chid) return json({ error: "missing id" }, 400);
  const meta = await cached(`channel:${chid}`, 3600, async () => {
    try {
      const r = await ytJson("browse", { browseId: chid });
      const h = channelHeader(r.data);
      if (!h) return null;
      h.id = chid;
      h.description = h.description || "";
      return h;
    } catch {
      return null;
    }
  });
  if (!meta) return json({ error: "channel metadata unavailable" }, 502);
  return json({ id: meta.id, name: meta.name, avatar: meta.avatar, subscribers: meta.subscribers, description: meta.description });
}