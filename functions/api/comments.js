import { json } from "../_lib/inn.js";

const INV_APIS = ["https://inv.nadeko.net", "https://yewtu.be", "https://invidious.nerdvpn.de", "https://invidious.f5.si"];

export async function onRequest(context) {
  const vid = new URL(context.request.url).searchParams.get("id") || "";
  if (!vid) return json({ error: "missing id" }, 400);
  const out = { comments: [], error: "" };
  for (const base of INV_APIS) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`${base}/api/v1/comments/${vid}?sort_by=top`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!r.ok) continue;
      const j = await r.json();
      const list = j.comments || [];
      if (!Array.isArray(list) || !list.length) continue;
      return json({
        comments: list.slice(0, 20).map((c) => ({
          author: c.author || "?",
          avatar: c.authorThumbnails?.filter((t) => t.url).pop()?.url || "",
          text: c.content || "",
          published: c.publishedText || "",
          likes: c.likeCount || 0,
          replies: c.replies?.count ?? 0,
          pinned: !!c.pinned,
        })),
      });
    } catch { /* try next instance */ }
  }
  return json({ comments: [], error: "Comment servers are temporarily unreachable. Try again later." });
}