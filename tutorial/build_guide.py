#!/usr/bin/env python3
"""Compone le tre guide dell'area riservata riusando le pagine della guida
unica (area-riservata.html) più alcune pagine nuove. Rigenera piè di pagina e
numerazione. NON modifica area-riservata.html (resta come sorgente delle pagine)."""
import re

# area-riservata.html è la fonte delle pagine riusabili (cover, i 5 passi,
# scheda cliente, colonne pipeline, ecc.). Da qui estraiamo head + sezioni.
_SRC = open('area-riservata.html').read()
HEAD = _SRC.split('</head>')[0] + '</head>\n<body>\n'
PAGES = re.findall(r'(<section\b.*?</section>)', _SRC, re.S)  # 13 sezioni

def strip_foot(html):
    """Toglie il footer esistente da una pagina riusata: lo rimettiamo noi."""
    return re.sub(r'\s*<div class="foot">.*?</div>\s*</section>', '\n</section>', html, flags=re.S)

def foot(guide, n):
    return (f'<div class="foot"><div>Guida rapida — {guide}</div>'
            f'<div><span class="brand">app.praticarapida.it</span> · Pag. {n}</div></div>')

def with_foot(page_html, guide, n):
    return strip_foot(page_html).replace('\n</section>', f'\n{foot(guide, n)}\n</section>')

def cover(kicker, h1, lead, chips):
    chip_html = ''.join(f'<span class="chip">{c}</span>' for c in chips)
    return f'''<section class="page cover">
  <div class="logo"><img src="logo-white-1200.png" alt="Pratica Rapida"></div>
  <div class="kicker">{kicker}</div>
  <h1>{h1}</h1>
  <p class="lead">{lead}</p>
  <div class="chips">{chip_html}</div>
  <div class="footer-row"><div>Area riservata · Portale ENEA</div><div><strong>app.praticarapida.it</strong></div></div>
</section>'''

def final(guide, n, h1, p, label_l, val_l, label_r, val_r):
    return f'''<section class="page">
  <div class="final-hero">
    <div class="icon">✓</div>
    <h1>{h1}</h1>
    <p>{p}</p>
    <div class="contact-card">
      <div class="col-c"><div class="label">{label_l}</div><div class="val" style="color:#111">{val_l}</div></div>
      <div class="col-c"><div class="label">{label_r}</div><div class="val" style="color:var(--green)">{val_r}</div></div>
    </div>
  </div>
  <div class="final-logo"><img src="logo-green-1200.png" alt="Pratica Rapida"></div>
  {foot(guide, n)}
</section>'''

def build(title, pages):
    body = '\n\n'.join(pages)
    return HEAD.replace(
        "<title>Come usare l'area riservata — Guida rivenditori</title>",
        f"<title>{title}</title>") + '\n' + body + '\n\n</body>\n</html>\n'


# ══════════════════════════════════════════════════════════════════════════
# GUIDA 1 — Inserire una pratica ENEA
# ══════════════════════════════════════════════════════════════════════════
G1 = "Inserire una pratica ENEA"

g1_cover = cover(
    "GUIDA RAPIDA · AREA RISERVATA",
    "Come inserire<br/>una Pratica ENEA",
    "Carica la pratica ENEA del tuo cliente dal portale in pochi minuti. Bastano i dati del cliente e la fattura: <strong>al resto pensiamo noi</strong>.",
    ["✦ 5 semplici passi", "◷ ~2 minuti a pratica", "▤ Tutto dal portale"])

# pointer alla scheda documenti (guida 3), prima del final
g1_pointer = f'''<section class="page">
  <div class="kicker-box"><span class="dot">▦</span>A LAVORAZIONE CONCLUSA</div>
  <h2 class="section-title">Dove trovi la pratica finita</h2>
  <p class="lead-p">Una volta che abbiamo trasmesso la pratica ad ENEA, non devi cercarla da nessuna parte: apri <strong>«Le mie Pratiche»</strong>, clicca sulla <strong>card del cliente</strong> e nella sezione <strong>Documenti</strong> trovi tutto pronto da scaricare.</p>
  <div class="cards-row" style="margin-top:4mm">
    <div class="info-card hero">
      <h3>▣ Pratica ENEA conclusa</h3>
      <p>La <strong>ricevuta della pratica inviata ad ENEA</strong>: il documento che il cliente conserva per la detrazione.</p>
    </div>
    <div class="info-card">
      <h3>▦ Dichiarazione Requisiti Tecnici</h3>
      <p>L'<strong>asseverazione tecnica già precompilata</strong> con i dati del cliente e della tua azienda. La scarichi, la controlli, la firmi.</p>
    </div>
  </div>
  <div class="callout tip"><div class="ci">💡</div><div>Il dettaglio su come scaricarli è nella guida <strong>«Documenti da scaricare»</strong>, nel menu «Come usare il portale».</div></div>
  {foot(G1, 10)}
</section>'''

g1_overview = f'''<section class="page">
  <div class="kicker-box"><span class="dot">ⓘ</span>IN BREVE</div>
  <h2 class="section-title">Cosa fa questa guida</h2>
  <p class="lead-p">Come <strong>rivenditore</strong> puoi caricare le pratiche ENEA dei tuoi clienti in autonomia, in pochi minuti. Qui vediamo come aprire una <strong>Nuova Pratica ENEA</strong> e compilarla passo dopo passo, fino all'invio.</p>
  <div class="step-list">
    <div class="step-row"><div class="num">1</div><div class="icon">☰</div><div class="body"><div class="title">Apri «Nuova Pratica ENEA»</div><div class="sub">Dal menu a sinistra del portale.</div></div></div>
    <div class="step-row"><div class="num">2</div><div class="icon">✦</div><div class="body"><div class="title">Scegli servizio e prodotto</div><div class="sub">Servizio Completo o Documenti Forniti + tipo di prodotto installato.</div></div></div>
    <div class="step-row"><div class="num">3</div><div class="icon">◔</div><div class="body"><div class="title">Inserisci i dati del cliente</div><div class="sub">Nome, cognome, telefono e data di fine lavori.</div></div></div>
    <div class="step-row"><div class="num">4</div><div class="icon">↑</div><div class="body"><div class="title">Allega la fattura e invia</div><div class="sub">Carica la fattura e premi «Invia Pratica ENEA».</div></div></div>
  </div>
  <div class="callout success"><div class="ci">✓</div><div><strong>Prima di iniziare</strong>
    <ul class="checklist" style="margin-top:2mm">
      <li>Accedi a <span class="chip-inline">app.praticarapida.it</span> con le credenziali del tuo account.</li>
      <li>Tieni a portata di mano la <span class="chip-inline">fattura</span> di acquisto/installazione (PDF o foto, max 10 MB).</li>
      <li>Annota <span class="chip-inline">nome, cognome, telefono</span> e la <span class="chip-inline">data di fine lavori</span> del cliente.</li>
    </ul></div></div>
  {foot(G1, 2)}
</section>'''

guide1 = [
    g1_cover,
    g1_overview,                   # overview
    with_foot(PAGES[2], G1, 3),   # step 1
    with_foot(PAGES[3], G1, 4),   # step 2
    with_foot(PAGES[4], G1, 5),   # step 2b documenti forniti
    with_foot(PAGES[5], G1, 6),   # step 3 cliente
    with_foot(PAGES[6], G1, 7),   # step 4 fattura
    with_foot(PAGES[7], G1, 8),   # conferma
    with_foot(PAGES[9], G1, 9),   # documenti per prodotto
    g1_pointer,                    # 10
    final(G1, 11, "È tutto qui!",
          "Ora sai caricare una Pratica ENEA in pochi minuti. Nelle altre due guide vedi come funziona il portale e come scaricare i documenti pronti.",
          "PORTALE", "app.praticarapida.it", "ALTRE GUIDE", "Menu «Come usare il portale»"),
]
open('area-riservata-inserire.html', 'w').write(build(f"{G1} — Guida rivenditori", guide1))


# ══════════════════════════════════════════════════════════════════════════
# GUIDA 2 — Come funziona il portale
# ══════════════════════════════════════════════════════════════════════════
G2 = "Come funziona il portale"

g2_cover = cover(
    "GUIDA RAPIDA · AREA RISERVATA",
    "Come funziona<br/>il portale",
    "Dashboard, pipeline, archivio: tutto quello che vedi nel portale e a cosa serve, così ti muovi senza perderti.",
    ["▤ Dashboard", "▥ Le mie Pratiche", "▢ Archivio"])

g2_overview = f'''<section class="page">
  <div class="kicker-box"><span class="dot">ⓘ</span>IN BREVE</div>
  <h2 class="section-title">Le sezioni del portale</h2>
  <p class="lead-p">Il menu a sinistra ha poche voci, ognuna con un compito preciso. Ecco cosa trovi in ognuna.</p>
  <div class="step-list">
    <div class="step-row"><div class="num">▤</div><div class="body"><div class="title">Dashboard ENEA</div><div class="sub">Il colpo d'occhio: quante pratiche hai in ogni fase e le ultime inserite.</div></div></div>
    <div class="step-row"><div class="num">▥</div><div class="body"><div class="title">Le mie Pratiche</div><div class="sub">La pipeline: qui segui ogni pratica mentre avanza, dall'inserimento all'invio.</div></div></div>
    <div class="step-row"><div class="num">◧</div><div class="body"><div class="title">Nuova Pratica ENEA</div><div class="sub">Il modulo per caricare una pratica. Come si compila è nell'altra guida.</div></div></div>
    <div class="step-row"><div class="num">▢</div><div class="body"><div class="title">Archivio ENEA</div><div class="sub">Le pratiche completate, con la ricerca per cliente, email o azienda.</div></div></div>
    <div class="step-row"><div class="num">↓</div><div class="body"><div class="title">Documenti utili</div><div class="sub">Modelli pronti da scaricare e far firmare al cliente.</div></div></div>
  </div>
  {foot(G2, 2)}
</section>'''

g2_dashboard = f'''<section class="page">
  <div class="step-header"><div class="step-num">▤</div><div><div class="step-kicker">LA HOME DEL PORTALE</div><h2>La Dashboard ENEA</h2></div></div>
  <div class="mockup" style="position:relative">
    <div class="mock-shell">
      <div class="mock-side" style="min-height:90mm">
        <div class="brand"><img src="logo-white-1200.png" alt="Pratica Rapida"></div>
        <div class="nav-item active">▤ Dashboard ENEA</div>
        <div class="nav-item">▥ Le mie Pratiche</div>
        <div class="nav-item">◧ Nuova Pratica ENEA</div>
        <div class="nav-item">▢ Archivio ENEA</div>
      </div>
      <div class="mock-main">
        <h3 style="font-size:11pt;margin:0 0 1mm">Dashboard Pipeline</h3>
        <p style="font-size:7.5pt;color:#6B7280;margin:0 0 3mm">Panoramica pratiche ENEA e Conto Termico</p>
        <div class="grid3">
          <div class="mock-card"><div style="font-size:6.5pt;color:#6B7280">In lavorazione</div><div style="font-size:16pt;color:#2563EB;font-weight:800">12</div></div>
          <div class="mock-card"><div style="font-size:6.5pt;color:#6B7280">Trasmissione ad ENEA</div><div style="font-size:16pt;color:#7C3AED;font-weight:800">5</div></div>
          <div class="mock-card"><div style="font-size:6.5pt;color:#6B7280">Pratica inviata</div><div style="font-size:16pt;color:#059669;font-weight:800">28</div></div>
        </div>
        <div class="mock-card" style="margin-top:3mm"><div style="font-size:8pt;font-weight:700;margin-bottom:1mm">Ultime 10 pratiche</div><div style="font-size:7pt;color:#6B7280">Mario Rossi · Giulia Bianchi · Luca Verdi · …</div></div>
      </div>
    </div>
  </div>
  <p class="lead-p">È la prima pagina che vedi entrando. In un colpo d'occhio hai <strong>quante pratiche</strong> sono in ogni fase e l'elenco delle <strong>ultime inserite</strong>.</p>
  <ul class="checklist">
    <li>I numeri in alto sono le pratiche in ogni fase della lavorazione.</li>
    <li>Da qui apri qualsiasi pratica per vederne il dettaglio.</li>
  </ul>
  {foot(G2, 3)}
</section>'''

g2_archivio = f'''<section class="page">
  <div class="step-header"><div class="step-num">▢</div><div><div class="step-kicker">LE PRATICHE COMPLETATE</div><h2>Archivio e Documenti utili</h2></div></div>
  <div class="cards-row">
    <div class="info-card hero">
      <h3>▢ Archivio ENEA</h3>
      <p>Raccoglie le <strong>pratiche completate</strong>. C'è la <strong>ricerca</strong> per nome cliente, email o azienda, e da qui scarichi i file di ogni pratica quando ti servono.</p>
    </div>
    <div class="info-card">
      <h3>↓ Documenti utili</h3>
      <p>I <strong>modelli pronti</strong> da scaricare e far firmare al cliente — come la dichiarazione sostitutiva del beneficiario e l'asseverazione tecnica in bianco.</p>
    </div>
  </div>
  <div class="callout info"><div class="ci">ⓘ</div><div>Differenza rapida: in <strong>«Le mie Pratiche»</strong> segui le pratiche in corso; in <strong>«Archivio ENEA»</strong> ritrovi quelle già chiuse.</div></div>
  {foot(G2, 6)}
</section>'''

guide2 = [
    g2_cover,
    g2_overview,                   # 2
    g2_dashboard,                  # 3
    with_foot(PAGES[8], G2, 4),    # ritrova la pratica (pipeline)
    with_foot(PAGES[10], G2, 5),   # colonne pipeline
    g2_archivio,                   # 6
    final(G2, 7, "Sai muoverti nel portale",
          "Ora conosci ogni sezione e sai dove ritrovare le tue pratiche. Per caricarne una nuova o scaricare i documenti, vedi le altre due guide.",
          "PORTALE", "app.praticarapida.it", "ALTRE GUIDE", "Menu «Come usare il portale»"),
]
open('area-riservata-portale.html', 'w').write(build(f"{G2} — Guida rivenditori", guide2))


# ══════════════════════════════════════════════════════════════════════════
# GUIDA 3 — Documenti da scaricare
# ══════════════════════════════════════════════════════════════════════════
G3 = "Documenti da scaricare"

g3_cover = cover(
    "GUIDA RAPIDA · AREA RISERVATA",
    "Documenti<br/>da scaricare",
    "A pratica conclusa trovi la pratica ENEA e l'asseverazione tecnica già precompilata nella scheda del cliente. Ecco dove.",
    ["▣ Pratica conclusa", "▦ Asseverazione precompilata"])

g3_where = f'''<section class="page">
  <div class="kicker-box"><span class="dot">▦</span>PASSO PASSO</div>
  <h2 class="section-title">Come arrivarci in 3 passi</h2>
  <div class="step-list">
    <div class="step-row"><div class="num">1</div><div class="body"><div class="title">Apri «Le mie Pratiche»</div><div class="sub">Dal menu a sinistra del portale.</div></div></div>
    <div class="step-row"><div class="num">2</div><div class="body"><div class="title">Clicca sulla card del cliente</div><div class="sub">La pratica conclusa è nella colonna «Pratica inviata».</div></div></div>
    <div class="step-row"><div class="num">3</div><div class="body"><div class="title">Scorri fino a «Documenti»</div><div class="sub">Lì trovi i file pronti, ognuno col suo pulsante «Scarica».</div></div></div>
  </div>
  <div class="callout warn"><div class="ci">⚠</div><div>Se sulla card non vedi ancora i documenti, la pratica non è ancora stata chiusa da noi: compaiono appena la lavorazione è completata.</div></div>
  {foot(G3, 3)}
</section>'''

guide3 = [
    g3_cover,
    with_foot(PAGES[11], G3, 2),   # scheda cliente / documenti pronti
    g3_where,                       # 3
    final(G3, 4, "Tutto a portata di click",
          "I documenti restano sempre nella scheda del cliente: puoi riscaricarli quando vuoi. Per caricare una nuova pratica o capire il portale, vedi le altre guide.",
          "PORTALE", "app.praticarapida.it", "ALTRE GUIDE", "Menu «Come usare il portale»"),
]
open('area-riservata-documenti.html', 'w').write(build(f"{G3} — Guida rivenditori", guide3))

print("Generati:")
for f in ['area-riservata-inserire.html', 'area-riservata-portale.html', 'area-riservata-documenti.html']:
    n = open(f).read().count('class="page')
    print(f"  {f}  →  {n} pagine")
