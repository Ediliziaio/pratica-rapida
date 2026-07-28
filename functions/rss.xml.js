// /rss.xml → 301 verso il feed canonico /feed.xml (evita contenuto duplicato).
export async function onRequest() {
  return Response.redirect("https://www.praticarapida.it/feed.xml", 301);
}
