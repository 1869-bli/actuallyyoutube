import { json } from "../_lib/inn.js";

export async function onRequest() {
  return json({ error: "cloud accounts are stored in your browser" }, 404);
}