from pathlib import Path
import math
import sys

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_luca_programma as B  # noqa: E402


OUT = ROOT / "output"
ASSETS = OUT / "assets_campagna_2027"
ASSETS.mkdir(parents=True, exist_ok=True)
DOCX_PATH = OUT / "Brianza_2027_Piano_Campagna_Territorio_Social.docx"

NAVY = B.NAVY
BLUE = B.BLUE
BLUE_LIGHT = B.BLUE_LIGHT
RED = B.RED
RED_LIGHT = B.RED_LIGHT
GREEN = B.GREEN
GOLD = B.GOLD
INK = B.INK
MUTED = B.MUTED
LIGHT = B.LIGHT
MID = B.MID
WHITE = B.WHITE
TEAL = B.TEAL
GRAY = B.GRAY


def font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def add_image(doc, path, width_cm=16.6, before=5, after=5):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.add_run().add_picture(str(path), width=Cm(width_cm))
    return p


def add_label(doc, label, text, fill=LIGHT, accent=BLUE):
    table = doc.add_table(rows=1, cols=2)
    B.set_table_fixed(table, [3.25, 14.55])
    B.shade(table.cell(0, 0), accent)
    B.shade(table.cell(0, 1), fill)
    B.borders(table.cell(0, 0), accent)
    B.borders(table.cell(0, 1), fill)
    B.cell_text(table.cell(0, 0), label.upper(), size=8.2, color=WHITE, bold=True)
    B.cell_text(table.cell(0, 1), text, size=9.0)
    return table


def add_two_up(doc, items, fill=LIGHT):
    rows = math.ceil(len(items) / 2)
    table = doc.add_table(rows=rows, cols=2)
    B.set_table_fixed(table, [8.9, 8.9])
    for cell, item in zip([c for r in table.rows for c in r.cells], items):
        title, body = item
        B.shade(cell, fill)
        B.borders(cell, WHITE, 10)
        cell.text = ""
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(3)
        B.set_run(p.add_run(title), size=10.0, color=NAVY, bold=True)
        p2 = cell.add_paragraph()
        p2.paragraph_format.space_after = Pt(0)
        p2.paragraph_format.line_spacing = 1.08
        B.set_run(p2.add_run(body), size=8.8, color=INK)
        B.cell_margins(cell, top=130, bottom=130, start=145, end=145)
    return table


def add_small_bullet(doc, text, color=INK):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.08
    B.set_run(p.add_run(text), size=8.9, color=color)
    return p


def add_stage(doc, number, title, body, color=RED):
    table = doc.add_table(rows=1, cols=3)
    B.set_table_fixed(table, [0.9, 3.8, 13.1])
    for c in table.rows[0].cells:
        B.borders(c, WHITE, 8)
    B.shade(table.cell(0, 0), color)
    B.shade(table.cell(0, 1), NAVY)
    B.shade(table.cell(0, 2), LIGHT)
    B.cell_text(table.cell(0, 0), str(number), size=9, color=WHITE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    B.cell_text(table.cell(0, 1), title, size=8.6, color=WHITE, bold=True)
    B.cell_text(table.cell(0, 2), body, size=8.6)
    return table


def circle_text(draw, xy, r, fill, number, label):
    x, y = xy
    draw.ellipse((x-r, y-r, x+r, y+r), fill=fill)
    draw.text((x, y-10), number, font=font(36, True), fill="white", anchor="mm")
    draw.text((x, y+28), label, font=font(16, True), fill="white", anchor="mm")


def make_flywheel():
    img = Image.new("RGB", (1500, 720), "white")
    d = ImageDraw.Draw(img)
    nodes = [
        (750, 95, RED, "1", "ASCOLTO"),
        (1120, 230, BLUE, "2", "CONTENUTO"),
        (1120, 500, TEAL, "3", "PRESENZA"),
        (750, 625, GREEN, "4", "CONTATTO"),
        (380, 500, "7A5A00", "5", "ATTIVAZIONE"),
        (380, 230, NAVY, "6", "PROVA"),
    ]
    for i, node in enumerate(nodes):
        x, y, color, num, label = node
        nx, ny, *_ = nodes[(i+1) % len(nodes)]
        d.line((x, y, nx, ny), fill="#CBD3DF", width=24)
    for x, y, color, num, label in nodes:
        circle_text(d, (x, y), 86, "#" + color, num, label)
    d.ellipse((590, 250, 910, 570), fill="#F3F5F8", outline="#061B3A", width=6)
    d.text((750, 355), "FIDUCIA", font=font(48, True), fill="#061B3A", anchor="mm")
    d.text((750, 415), "misurata in persone", font=font(22), fill="#667085", anchor="mm")
    d.text((750, 450), "che tornano e partecipano", font=font(22), fill="#667085", anchor="mm")
    path = ASSETS / "campagna_flywheel.png"
    img.save(path)
    return path


def make_channel_map():
    img = Image.new("RGB", (1500, 760), "white")
    d = ImageDraw.Draw(img)
    boxes = [
        (70, 70, 480, 220, RED, "SOCIAL", "scoperta e racconto"),
        (1020, 70, 1430, 220, BLUE, "STAMPA LOCALE", "credibilità e agenda"),
        (70, 540, 480, 690, TEAL, "WHATSAPP / EMAIL", "relazione con consenso"),
        (1020, 540, 1430, 690, GREEN, "PIAZZA E BANCHETTI", "ascolto e conversione"),
    ]
    # Connections stay behind every node so labels remain fully legible.
    for x1, y1, x2, y2, *_ in boxes:
        cx, cy = (x1+x2)//2, (y1+y2)//2
        d.line((cx, cy, 750, 380), fill="#C5CEDA", width=12)
    for x1, y1, x2, y2, color, title, body in boxes:
        cx, cy = (x1+x2)//2, (y1+y2)//2
        d.rounded_rectangle((x1, y1, x2, y2), radius=22, fill="#"+color)
        d.text((cx, cy-20), title, font=font(26, True), fill="white", anchor="mm")
        d.text((cx, cy+26), body, font=font(18), fill="white", anchor="mm")
    d.rounded_rectangle((520, 270, 980, 490), radius=32, fill="#061B3A")
    d.text((750, 335), "PORTALE PROVINCIALE", font=font(34, True), fill="white", anchor="mm")
    d.text((750, 390), "fonte unica · 18 pagine comune", font=font(20), fill="#F0C419", anchor="mm")
    d.text((750, 430), "agenda · proposte · iscrizione", font=font(20), fill="white", anchor="mm")
    path = ASSETS / "architettura_canali.png"
    img.save(path)
    return path


def make_protocol():
    img = Image.new("RGB", (1500, 690), "white")
    d = ImageDraw.Draw(img)
    d.line((105, 345, 1395, 345), fill="#CBD3DF", width=12)
    steps = [
        ("D-7", "domanda\nlocale", RED),
        ("D-5", "video\ndal posto", BLUE),
        ("D-3", "invito +\npagina comune", TEAL),
        ("D-1", "promemoria\nopt-in", "7A5A00"),
        ("D0", "banchetto\ne ascolto", NAVY),
        ("D+1", "foto +\nringraziamento", GREEN),
        ("D+3", "risposta\nalle domande", BLUE),
        ("D+7", "scheda esito\ne prossima data", RED),
    ]
    for i, (day, label, color) in enumerate(steps):
        x = 105 + i * (1290/(len(steps)-1))
        d.ellipse((x-42, 303, x+42, 387), fill="#"+color)
        d.text((x, 345), day, font=font(18, True), fill="white", anchor="mm")
        y = 245 if i % 2 == 0 else 455
        d.text((x, y), label, font=font(18, True), fill="#172033", anchor="mm", spacing=4, align="center")
        d.line((x, 303 if i % 2 == 0 else 387, x, y+35 if i % 2 == 0 else y-42), fill="#CBD3DF", width=4)
    path = ASSETS / "protocollo_comune_7_2.png"
    img.save(path)
    return path


def make_funnel():
    img = Image.new("RGB", (1500, 700), "white")
    d = ImageDraw.Draw(img)
    levels = [
        ("2.000-6.000", "visualizzazioni locali", NAVY, 1320),
        ("80-250", "visite alla pagina comune", BLUE, 1050),
        ("20-60", "azioni RSVP / QR", TEAL, 780),
        ("15-40", "presenze fisiche", "7A5A00", 580),
        ("12-30", "contatti con consenso", GREEN, 410),
        ("2-6", "volontari disponibili", RED, 250),
    ]
    y = 45
    for value, label, color, width in levels:
        x1, x2 = (1500-width)//2, (1500+width)//2
        d.rounded_rectangle((x1, y, x2, y+84), radius=16, fill="#"+color)
        d.text((750, y+28), value, font=font(27, True), fill="white", anchor="mm")
        d.text((750, y+60), label, font=font(17), fill="white", anchor="mm")
        y += 102
    path = ASSETS / "funnel_attivazione.png"
    img.save(path)
    return path


def priority_rows(eu_data):
    rows = []
    for name, orientation, year, municipal, size in B.TOWNS:
        d = eu_data[name]
        scale = 30 if size == "oltre 15mila" else 18
        competitive = max(5, 25 - abs(municipal - 50) * 1.5)
        urgency = {"CSX": 20, "COMM": 20, "CIV": 15, "CDX": 10}[orientation]
        turnout_room = max(5, min(25, (65 - d["turnout"]) * 1.2))
        score = round(scale + competitive + urgency + turnout_room)
        tier = "A" if score >= 80 else "B" if score >= 65 else "C"
        action = {
            "A": "2 azioni/mese + squadra locale",
            "B": "1 azione/mese + referente",
            "C": "ascolto + presidio di area",
        }[tier]
        rows.append({"name": name, "orientation": orientation, "year": year, "municipal": municipal,
                     "cdx": d["cdx"], "csx": d["csx"], "turnout": d["turnout"],
                     "score": score, "tier": tier, "action": action})
    return sorted(rows, key=lambda x: (-x["score"], x["name"]))


def page_cover(doc, logo):
    table = doc.add_table(rows=1, cols=2)
    B.set_table_fixed(table, [12.7, 5.1])
    for c in table.rows[0].cells:
        B.shade(c, NAVY); B.borders(c, NAVY); B.cell_margins(c, top=180, bottom=180, start=180, end=180)
    left, right = table.rows[0].cells
    left.text = ""
    p = left.paragraphs[0]
    B.set_run(p.add_run("PIANO STRATEGICO INTEGRATO"), size=9.2, color=GOLD, bold=True)
    p2 = left.add_paragraph(); p2.paragraph_format.space_before = Pt(4)
    B.set_run(p2.add_run("TERRITORIO · SOCIAL · PIAZZA"), size=12, color=WHITE, bold=True)
    right.text = ""; rp = right.paragraphs[0]; rp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    rp.add_run().add_picture(str(logo), width=Cm(2.7))
    B.add_p(doc, "BRIANZA", size=37, color=NAVY, bold=True, before=72, after=0)
    B.add_p(doc, "CAMPAGNA 2027", size=43, color=RED, bold=True, after=12)
    B.add_p(doc, "Dalla presenza occasionale a una macchina elettorale.", size=17, color=NAVY, bold=True, after=18)
    B.add_p(doc, "Piano operativo per il coordinamento provinciale di Futuro Nazionale", size=13, color=INK, bold=True, after=5)
    B.add_p(doc, "Orizzonte di lavoro: settembre 2026 - amministrative primavera 2027", size=10.8, color=MUTED, after=36)
    B.add_metric_strip(doc, [("18", "comuni prioritari"), ("5", "macroaree"),
                             ("9", "mesi di lavoro"), ("1", "cabina di regia")])
    B.add_p(doc, "BOZZA STRATEGICA · CONFRONTO INTERNO", size=8.2, color=MUTED, bold=True, before=42, after=2)
    B.add_p(doc, "28 agosto 2026 · Obiettivi e soglie da approvare dopo la misurazione iniziale", size=8.2, color=MUTED)


def page_executive(doc):
    B.add_heading(doc, "Una campagna permanente che porta persone dal telefono alla piazza", kicker="Sintesi esecutiva")
    B.add_p(doc, "La campagna non parte con i manifesti e non coincide con il mese prima del voto. Parte ora: costruisce fiducia, raccoglie problemi verificabili, forma referenti locali e trasforma ogni iniziativa pubblica in un ciclo misurabile di ascolto, contenuto, contatto e partecipazione.", size=11.2, line=1.24, after=10)
    B.add_callout(doc, "La tesi", "Un solo centro strategico provinciale, cinque nodi territoriali e diciotto pagine-comune. Il digitale prepara la presenza fisica; la presenza fisica produce relazioni e contenuti; il portale conserva dati, proposte e contatti con consenso.")
    B.add_heading(doc, "Che cosa porta Luca al tavolo", level=2)
    add_two_up(doc, [
        ("Strategia già disegnata", "Fasi, responsabilità, ritmi e indicatori pronti per essere attivati dopo il mandato."),
        ("Direzione operativa pronta", "Una funzione di regia per comunicazione, agenda, dati e coordinamento dei territori."),
        ("Presenza senza esclusioni", "Deleghe reali, referenti d’area e ruoli locali legati a risultati verificabili."),
        ("Infrastruttura proprietaria", "Portale e liste con consenso per non dipendere interamente dagli algoritmi delle piattaforme."),
    ])
    B.add_heading(doc, "La misura del successo", level=2)
    B.add_callout(doc, "Non follower: capacità organizzativa", "Il risultato non è avere numeri decorativi sui social. È sapere, comune per comune, quante persone partecipano, ritornano, lasciano un contatto consapevole, si offrono come volontari e assumono una responsabilità.", fill="FFF7D9", accent=GOLD)


def page_targets(doc):
    B.add_heading(doc, "Obiettivi, risultati e soglie di controllo", kicker="Grove · lavorare per risultati")
    B.add_p(doc, "Le cifre seguenti sono target operativi iniziali, non previsioni elettorali. Vanno confermate dopo 30 giorni di baseline e aggiornate in base a mandato, risorse, alleanze e disponibilità reali.", size=10.4, color=MUTED, italic=True, after=10)
    B.add_metric_strip(doc, [("2.400", "contatti opt-in D-15"), ("240", "volontari attivi"),
                             ("110", "azioni territoriali"), ("18/18", "comuni con scheda")])
    B.add_heading(doc, "Traguardi progressivi", level=2)
    table = doc.add_table(rows=5, cols=5)
    B.set_table_fixed(table, [2.5, 3.0, 3.0, 3.1, 6.2])
    headers = ["Scadenza", "Contatti", "Volontari", "Azioni", "Risultato organizzativo"]
    for c, h in zip(table.rows[0].cells, headers):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=8.0, color=WHITE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    data = [
        ("T+30", "baseline", "25", "10", "18 schede; 5 referenti d’area; regole approvate"),
        ("T+90", "600", "45", "18", "10 comuni attivi; portale e CRM operativi"),
        ("31 gen", "900", "90", "36", "18 pagine-comune; calendario pubblico"),
        ("31 mar", "1.500", "160", "72", "copertura completa; squadre nei comuni A/B"),
    ]
    for row, values in zip(table.rows[1:], data):
        for i, (cell, value) in enumerate(zip(row.cells, values)):
            B.shade(cell, LIGHT if i != 0 else BLUE_LIGHT); B.borders(cell, WHITE)
            B.cell_text(cell, value, size=8.0, bold=(i == 0), align=WD_ALIGN_PARAGRAPH.CENTER if i < 4 else WD_ALIGN_PARAGRAPH.LEFT)
    B.add_heading(doc, "Indicatori anticipatori", level=2)
    add_two_up(doc, [
        ("Copertura", "comuni con referente, scheda aggiornata, prossima data pubblica e canale di contatto"),
        ("Ritmo", "azioni effettuate / pianificate; contenuti consegnati nei tempi; risposte entro 12 ore"),
        ("Conversione", "visita → contatto; contatto → presenza; presenza → volontario; volontario → responsabilità"),
        ("Qualità", "ritorni alle iniziative, domande risolte, segnalazioni verificabili, assenza di reclami privacy"),
    ])


def page_constraints(doc):
    B.add_heading(doc, "Il nuovo campo digitale: organico, trasparente, proprietario", kicker="Vincoli 2026-2027")
    B.add_p(doc, "L’idea di anticipare ogni banchetto con una campagna nel solo comune resta centrale, ma cambia il mezzo: non può dipendere dalla vecchia pubblicità politica geolocalizzata sulle piattaforme principali.", size=11.0, color=NAVY, bold=True, line=1.2, after=10)
    add_two_up(doc, [
        ("Meta", "Dal 6 ottobre 2025 non consente nell’UE annunci politici, elettorali e su temi sociali. Restano possibili contenuti politici organici."),
        ("Google", "Da settembre 2025 limita nell’UE la pubblicità politica definita dal Regolamento 2024/900."),
        ("Regolamento UE", "Dal 10 ottobre 2025 impone etichette, trasparenza sul finanziatore e forti limiti al targeting politico."),
        ("Privacy italiana", "Contatti elettorali via e-mail, SMS o messaggistica richiedono una base giuridica adeguata; evitare scraping e invii insistenti."),
    ], fill=RED_LIGHT)
    B.add_heading(doc, "Soluzione operativa per il singolo comune", level=2)
    for i, text in enumerate([
        "Pagina web dedicata al comune, indicizzata e collegata tramite QR.",
        "Contenuti organici con geotag, luoghi riconoscibili, temi e parole locali.",
        "Condivisione autorizzata in gruppi civici e reti territoriali, senza spam.",
        "Relazioni con stampa locale, associazioni, amministratori e micro-reti personali.",
        "Inviti WhatsApp/e-mail soltanto a contatti consenzienti e pertinenti al comune.",
        "Locandine, passaparola e presenza fisica per chi non vive sui social.",
    ], 1):
        add_stage(doc, i, f"LEVA {i}", text)
    B.add_callout(doc, "Regola", "Ogni spesa pubblicitaria, raccolta dati, messaggio fuori modello o nuova forma di targeting resta una decisione da approvare prima dell’uso.", fill="FFF7D9", accent=GOLD)


def page_system(doc, flywheel):
    B.add_heading(doc, "La macchina: ogni attività deve alimentare la successiva", kicker="Sistema di campagna")
    add_image(doc, flywheel, width_cm=16.8, before=2, after=7)
    B.add_heading(doc, "La sequenza obbligatoria", level=2)
    add_two_up(doc, [
        ("Ascolto", "partire da problemi osservabili, non da contenuti da pubblicare"),
        ("Contenuto", "rendere il problema comprensibile, locale, verificabile e condivisibile"),
        ("Presenza", "portare la conversazione in piazza con data, luogo e referente"),
        ("Contatto", "raccogliere consenso, comune e interesse organizzativo minimo"),
        ("Attivazione", "proporre un compito concreto entro sette giorni"),
        ("Prova", "pubblicare esiti, risposte e prossima azione: la fiducia nasce dal seguito"),
    ])
    B.add_callout(doc, "Regola anti-vanità", "Un contenuto senza una prossima azione è comunicazione. Un contenuto che conduce a una pagina, una data, un contatto o una responsabilità è organizzazione.")


def page_territory(doc, rows):
    B.add_heading(doc, "Priorità territoriale: concentrare senza abbandonare", kicker="18 comuni · modello provvisorio")
    B.add_p(doc, "La priorità combina quattro fattori: dimensione del comune, contendibilità dell’ultima amministrativa, urgenza politica del contesto e margine di partecipazione alle Europee 2024. È un indice operativo da correggere appena saranno disponibili forza locale, candidature e alleanze.", size=10.0, after=10)
    tiers = {"A": [r for r in rows if r["tier"] == "A"], "B": [r for r in rows if r["tier"] == "B"], "C": [r for r in rows if r["tier"] == "C"]}
    B.add_metric_strip(doc, [(str(len(tiers["A"])), "priorità A"), (str(len(tiers["B"])), "priorità B"),
                             (str(len(tiers["C"])), "presidio C"), ("T+30", "ricalibrazione")])
    B.add_heading(doc, "Tre intensità", level=2)
    add_label(doc, "A · attacco", "Due azioni al mese, squadra locale minima, pagina-comune sempre aggiornata, produzione video e relazione stampa.", fill=RED_LIGHT, accent=RED)
    add_label(doc, "B · costruzione", "Un’azione al mese, referente identificato, raccolta contatti e presenza coordinata dalla macroarea.", fill=BLUE_LIGHT, accent=BLUE)
    add_label(doc, "C · presidio", "Ascolto, iniziative selettive, aggregazione con comuni vicini; nessuna promessa di candidatura automatica.", fill=LIGHT, accent=GRAY)
    B.add_heading(doc, "Decisione elettorale separata", level=2)
    B.add_callout(doc, "Quattro esiti possibili", "Lista autonoma · presenza in coalizione · sostegno a progetto civico compatibile · sola costruzione organizzativa. La priorità di campagna non decide da sola la formula elettorale: candidati e accordi richiedono una scelta politica esplicita.", fill="FFF7D9", accent=GOLD)
    B.add_heading(doc, "Primi comuni da stress-testare", level=2)
    B.add_p(doc, ", ".join(r["name"] for r in rows[:5]) + ".", size=12, color=NAVY, bold=True)


def add_town_table(doc, subset, title):
    B.add_heading(doc, title, kicker="Matrice operativa")
    B.add_p(doc, "Blu = ultima amministrazione di centrodestra; rosso = centrosinistra; verde acqua = civica; grigio = commissariata. L’indice è provvisorio e non misura il consenso a Futuro Nazionale.", size=8.8, color=MUTED, italic=True, after=7)
    table = doc.add_table(rows=len(subset)+1, cols=8)
    B.set_table_fixed(table, [3.1, 1.35, 1.5, 1.45, 1.45, 1.35, 1.15, 6.45])
    heads = ["Comune", "Gov.", "Com.%", "EU CDX", "EU CSX", "Affl.", "P", "Prima intensità"]
    for c, h in zip(table.rows[0].cells, heads):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=7.2, color=WHITE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
    color_map = {"CDX": BLUE, "CSX": RED, "CIV": TEAL, "COMM": GRAY}
    for row, item in zip(table.rows[1:], subset):
        values = [item["name"], item["orientation"], f'{item["municipal"]:.1f}', f'{item["cdx"]:.1f}', f'{item["csx"]:.1f}', f'{item["turnout"]:.1f}', item["tier"], item["action"]]
        for i, (cell, value) in enumerate(zip(row.cells, values)):
            fill = LIGHT
            if i == 0: fill = "E8F0FC" if item["orientation"] == "CDX" else "FBEAEC" if item["orientation"] == "CSX" else "E4F3F1" if item["orientation"] == "CIV" else "ECEEF2"
            if i == 1: fill = color_map[item["orientation"]]
            if i == 6: fill = RED if item["tier"] == "A" else BLUE if item["tier"] == "B" else GRAY
            B.shade(cell, fill); B.borders(cell, WHITE)
            B.cell_text(cell, str(value), size=7.4, color=WHITE if i in (1, 6) else INK, bold=(i in (0, 1, 6)), align=WD_ALIGN_PARAGRAPH.CENTER if i not in (0, 7) else WD_ALIGN_PARAGRAPH.LEFT)
    B.add_heading(doc, "Come usare la matrice", level=2)
    add_small_bullet(doc, "Non confondere area di centrodestra alle Europee con consenso già disponibile per il movimento.")
    add_small_bullet(doc, "Entro T+30 sostituire l’indice teorico con dati reali: referenti, iscritti, relazioni, candidato possibile e accesso alle coalizioni.")
    add_small_bullet(doc, "Ogni comune deve avere una prossima azione, un responsabile e una data di revisione.")


def page_audiences(doc):
    B.add_heading(doc, "Pubblici diversi, una sola identità", kicker="Relazioni · non microtargeting")
    B.add_p(doc, "La segmentazione utile non indovina l’orientamento politico individuale. Distingue il tipo di relazione e propone il passo successivo più naturale, usando soltanto dati necessari e dichiarati.", size=10.8, color=NAVY, bold=True, after=10)
    add_two_up(doc, [
        ("Conosce già", "iscritto, simpatizzante o ex amministratore → chiedere disponibilità e competenza"),
        ("Partecipa alla comunità", "associazioni, professioni, commercio, sport → ascolto tematico e proposta concreta"),
        ("Arriva da un problema", "mobilità, sicurezza, scuola, servizi → risposta documentata e incontro locale"),
        ("Scopre il progetto", "contenuto o stampa locale → pagina semplice: chi siamo, cosa facciamo, prossima data"),
        ("È giovane o nuovo alla politica", "formato breve, compito delimitato, formazione e riconoscimento reale"),
        ("È pronto ad agire", "micro-compito entro sette giorni → accoglienza, responsabile e verifica"),
    ])
    B.add_heading(doc, "Scala di partecipazione", level=2)
    for i, (title, body) in enumerate([
        ("Vede", "contenuto locale o notizia"), ("Risponde", "sondaggio, domanda, QR"),
        ("Partecipa", "banchetto o incontro"), ("Ritorna", "seconda attività entro 30 giorni"),
        ("Aiuta", "compito di due ore"), ("Guida", "responsabilità con obiettivo e controllo"),
    ], 1):
        add_stage(doc, i, title, body, color=TEAL if i < 4 else RED)


def page_narrative(doc):
    B.add_heading(doc, "Una voce riconoscibile: locale, competente, umana", kicker="Architettura del messaggio")
    B.add_callout(doc, "Cornice da testare", "BRIANZA CHE CONTA · Un territorio che lavora, decide e pretende istituzioni all’altezza.", fill="FFF7D9", accent=GOLD)
    B.add_heading(doc, "Casa del messaggio", level=2)
    table = doc.add_table(rows=4, cols=1)
    B.set_table_fixed(table, [17.8])
    blocks = [
        (NAVY, WHITE, "PROMESSA", "Portare problemi reali dentro una struttura politica capace di seguirli fino a una risposta."),
        (BLUE, WHITE, "PROVA", "Esperienza amministrativa, presenza quotidiana, dati pubblici, scadenze e rendicontazione."),
        (TEAL, WHITE, "TONO", "Fermo sui valori, concreto sui comuni, rispettoso verso persone e avversari."),
        (LIGHT, INK, "AZIONE", "Ascolta · verifica · propone · torna a riferire."),
    ]
    for cell, (fill, color, label, body) in zip([r.cells[0] for r in table.rows], blocks):
        B.shade(cell, fill); B.borders(cell, WHITE, 8); cell.text = ""
        p = cell.paragraphs[0]; B.set_run(p.add_run(label + "  "), size=9.0, color=color, bold=True); B.set_run(p.add_run(body), size=9.3, color=color)
        B.cell_margins(cell, top=130, bottom=130, start=160, end=160)
    B.add_heading(doc, "Otto filoni territoriali", level=2)
    add_two_up(doc, [
        ("Sicurezza e legalità", "presìdi, degrado, commercio, polizia locale integrata"),
        ("Lavoro e impresa", "PMI, artigianato, burocrazia, formazione e attrattività"),
        ("Famiglia e scuola", "merito, orientamento, ITS, sport e servizi"),
        ("Territorio e ambiente", "urbanistica, consumo di suolo, bonifiche, acqua e parchi"),
        ("Mobilità", "ferrovia, strade, trasporto locale e collegamenti est-ovest"),
        ("Salute e sociale", "medicina territoriale, disabilità, tempi e integrazione dei servizi"),
        ("Identità e cultura", "storia locale, tradizioni, patrimonio, biblioteche ed eventi"),
        ("Innovazione civica", "open data, servizi digitali e partecipazione verificabile"),
    ])


def page_channels(doc, channel_map):
    B.add_heading(doc, "Un ecosistema, non una collezione di profili", kicker="Architettura dei canali")
    add_image(doc, channel_map, width_cm=16.8, before=1, after=5)
    B.add_heading(doc, "Scelte di piattaforma", level=2)
    add_two_up(doc, [
        ("Portale", "fonte ufficiale, 18 pagine-comune, moduli, agenda, dossier e tracciamento QR"),
        ("Facebook / Instagram", "racconto locale, prove di presenza, video brevi, dirette selettive e community"),
        ("WhatsApp / e-mail", "mobilitazione opt-in, promemoria, ringraziamento e micro-compiti; mai liste acquistate"),
        ("YouTube / LinkedIn", "archivio interventi, competenza professionale e contenuti lunghi riutilizzabili"),
        ("Stampa locale", "notiziabilità, autorevolezza, temi e appuntamenti con referente disponibile"),
        ("Piazza", "luogo in cui il pubblico diventa relazione: ascolto, consenso, compito e ritorno"),
    ])
    B.add_callout(doc, "Principio", "Una pagina provinciale forte è preferibile a diciotto profili vuoti. I comuni vivono attraverso pagine web, rubriche, geotag, referenti e kit locali; un profilo autonomo nasce solo quando esiste una squadra in grado di mantenerlo.")


def page_content(doc):
    B.add_heading(doc, "La redazione: contenuti prodotti come un servizio", kicker="Motore editoriale")
    B.add_metric_strip(doc, [("20", "contenuti master/mese"), ("8", "video brevi"),
                             ("5", "kit comune"), ("2", "newsletter")])
    B.add_heading(doc, "Mix editoriale", level=2)
    items = [
        ("35% · Problemi locali", "dato, luogo, testimonianza autorizzata, domanda e prossimo passo"),
        ("25% · Presenza", "banchetti, sopralluoghi, incontri, volontari e risultati"),
        ("20% · Proposte", "schede chiare: problema, competenza, soluzione, vincoli e stato"),
        ("10% · Identità", "valori V.I.T.A.L.E., storia, metodo e profilo di Luca"),
        ("10% · Risposta", "domande frequenti, correzioni, verifica dei fatti e gestione del dissenso"),
    ]
    for i, (title, body) in enumerate(items, 1):
        add_stage(doc, i, title, body, color=[RED, BLUE, TEAL, NAVY, "7A5A00"][i-1])
    B.add_heading(doc, "Settimana tipo", level=2)
    table = doc.add_table(rows=6, cols=3)
    B.set_table_fixed(table, [2.5, 6.0, 9.3])
    for c, h in zip(table.rows[0].cells, ["Giorno", "Formato", "Funzione"]):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=8, color=WHITE, bold=True)
    for row, values in zip(table.rows[1:], [
        ("Lun", "agenda + tema", "apre la settimana e la domanda locale"),
        ("Mar", "video breve", "volto, luogo, una tesi, una CTA"),
        ("Mer/Gio", "scheda o carosello", "spiega dati e proposta"),
        ("Ven", "invito / stampa", "porta alla presenza del fine settimana"),
        ("Weekend", "piazza + recap", "ascolto, prove e raccolta opt-in"),
    ]):
        for cell, value in zip(row.cells, values): B.shade(cell, LIGHT); B.borders(cell, WHITE); B.cell_text(cell, value, size=8.3)


def page_protocol(doc, protocol):
    B.add_heading(doc, "Protocollo COMUNE 7+2", kicker="La tua idea resa replicabile")
    B.add_p(doc, "Ogni banchetto viene anticipato e seguito da una micro-campagna dedicata al solo comune nei contenuti, nei luoghi, nelle reti e nella pagina di atterraggio. Il protocollo dura quattordici giorni: sette prima, il giorno dell’evento e sette dopo.", size=10.7, color=NAVY, bold=True, after=5)
    add_image(doc, protocol, width_cm=17.2, before=0, after=4)
    B.add_heading(doc, "Kit minimo per ogni comune", level=2)
    add_two_up(doc, [
        ("Pagina", "URL breve, mappa, orari, tema, modulo opt-in, referente funzionale e privacy"),
        ("Creatività", "copertina, video verticale, carosello dati, locandina, QR e messaggio stampa"),
        ("Distribuzione", "canali provinciali, reti locali autorizzate, gruppi, newsletter e stampa"),
        ("Esito", "presenze, domande, contatti, volontari, foto liberate, impegni e prossima data"),
    ])
    B.add_callout(doc, "Cosa significa “solo in quel comune”", "Non profilare politicamente gli abitanti. Significa parlare di quel luogo, usare reti pertinenti, invitare contatti che hanno scelto quel comune e misurare l’URL/QR dedicato.", fill="FFF7D9", accent=GOLD)


def page_field(doc):
    B.add_heading(doc, "Il banchetto come unità di organizzazione", kicker="Piazza · procedura standard")
    B.add_metric_strip(doc, [("90'", "presidio minimo"), ("3", "ruoli essenziali"),
                             ("1", "tema principale"), ("24h", "tempo per follow-up")])
    B.add_heading(doc, "Prima", level=2)
    add_small_bullet(doc, "Autorizzazioni, posizione, meteo, materiali, briefing, QR testato e piano sicurezza.")
    add_small_bullet(doc, "Obiettivo scritto: ascolto, contatti, volontari oppure tema; mai quattro obiettivi indistinti.")
    B.add_heading(doc, "Durante", level=2)
    add_two_up(doc, [
        ("Accoglienza", "saluto, motivo del presidio, domanda aperta e nessuna pressione"),
        ("Ascolto", "scheda anonima del problema; dati personali soltanto se la persona sceglie di lasciarli"),
        ("Contatto", "informativa breve, consenso chiaro, comune, canale preferito e possibilità di revoca"),
        ("Responsabilità", "un compito concreto: volantino, foto, sala, gruppo di lavoro o prossima presenza"),
    ])
    B.add_heading(doc, "Dopo", level=2)
    for i, text in enumerate([
        "Entro 4 ore: conteggio, materiali e incidenti nel registro.",
        "Entro 24 ore: ringraziamento e contenuto recap.",
        "Entro 72 ore: risposte alle domande verificabili e assegnazione dei contatti.",
        "Entro 7 giorni: micro-compito e prossima data; chi non viene ricontattato si perde.",
    ], 1):
        add_stage(doc, i, f"FOLLOW-UP {i}", text, color=TEAL)


def page_funnel(doc, funnel):
    B.add_heading(doc, "Dal pubblico al volontario: misurare la conversione", kicker="Funnel di una attivazione standard")
    B.add_p(doc, "Le fasce sono ipotesi di partenza per un comune medio. Dopo le prime dieci iniziative si sostituiscono con medie reali per dimensione, canale e tipo di evento.", size=9.3, color=MUTED, italic=True, after=2)
    add_image(doc, funnel, width_cm=15.8, before=0, after=4)
    B.add_heading(doc, "Dati minimi e leciti", level=2)
    add_two_up(doc, [
        ("Obbligatori", "data consenso, comune, recapito, canale scelto, fonte del contatto, stato relazione"),
        ("Facoltativi", "disponibilità oraria e competenze dichiarate dalla persona"),
        ("Da non raccogliere", "inferenze su voto, religione, salute, origine o profili acquistati/scrapati"),
        ("Controlli", "accessi limitati, esportazioni registrate, revoca semplice, cancellazione e revisione periodica"),
    ])
    B.add_callout(doc, "Soglia di allarme", "Opt-out o reclami superiori all’1% per invio: sospendere la lista, verificare consenso, frequenza e pertinenza prima di ripartire.", fill=RED_LIGHT, accent=RED)


def page_timeline(doc):
    B.add_heading(doc, "Da settembre al voto: cinque fasi con porte decisionali", kicker="Roadmap 2026-2027")
    phases = [
        ("SET", "FONDARE", "baseline, ruoli, privacy, canali, 18 schede, primi cinque comuni"),
        ("OTT-NOV", "ASCOLTARE", "tour macroaree, protocollo 7+2, banca temi e primi volontari"),
        ("DIC-GEN", "RADICARE", "18 pagine-comune, formazione, calendario, reti civiche e stampa"),
        ("FEB-MAR", "SCEGLIERE", "candidature, formule elettorali, coalizioni, priorità e messaggi locali"),
        ("APR-MAG", "MOBILITARE", "ritmo settimanale, eventi, porta a porta, materiali e get-out-the-vote"),
    ]
    for i, (when, title, body) in enumerate(phases, 1):
        table = doc.add_table(rows=1, cols=3)
        B.set_table_fixed(table, [2.2, 3.8, 11.8])
        color = [NAVY, BLUE, TEAL, "7A5A00", RED][i-1]
        for cell in table.rows[0].cells:
            B.borders(cell, WHITE, 8)
        B.shade(table.cell(0, 0), color)
        B.shade(table.cell(0, 1), NAVY)
        B.shade(table.cell(0, 2), LIGHT)
        B.cell_text(table.cell(0, 0), when, size=7.8, color=WHITE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER)
        B.cell_text(table.cell(0, 1), title, size=8.4, color=WHITE, bold=True)
        B.cell_text(table.cell(0, 2), body, size=8.4)
    B.add_heading(doc, "Porte a una via", level=2)
    add_two_up(doc, [
        ("31 gennaio", "decidere quali comuni hanno condizioni minime per un impegno elettorale"),
        ("28 febbraio", "formula: lista, coalizione, progetto civico o sola costruzione"),
        ("D-60", "messaggio definitivo, candidati, budget, fornitori e responsabilità pubbliche"),
        ("Convocazione comizi", "attivare controllo par condicio, separazione ruoli istituzionali e archivio materiali"),
    ], fill="FFF7D9")
    B.add_callout(doc, "Data", "La finestra di maggio 2027 è un’ipotesi di pianificazione. Tutte le scadenze relative al voto vanno riallineate quando sarà pubblicato il decreto ufficiale.")


def page_12_weeks(doc):
    B.add_heading(doc, "Le prime dodici settimane", kicker="Piano di avvio")
    table = doc.add_table(rows=13, cols=4)
    B.set_table_fixed(table, [1.3, 4.1, 6.0, 6.4])
    for c, h in zip(table.rows[0].cells, ["W", "Focus", "Consegna", "Prova"]):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=7.8, color=WHITE, bold=True)
    weeks = [
        ("1", "Mandato", "ruoli, regole, accessi", "verbale e registro decisioni"),
        ("2", "Baseline", "audit canali e contatti", "cruscotto zero"),
        ("3", "Territorio", "18 schede + mappa reti", "copertura verificata"),
        ("4", "Identità", "messaggi, tono, template", "kit approvato"),
        ("5", "Portale", "architettura + 5 pagine", "moduli e analytics"),
        ("6", "Pilota A", "primo Comune 7+2", "report conversione"),
        ("7", "Pilota B", "seconda macroarea", "confronto risultati"),
        ("8", "Formazione", "referenti e moderazione", "simulazione"),
        ("9", "Stampa", "agenda e dossier temi", "prime uscite"),
        ("10", "Reti", "associazioni e micro-ambasciatori", "incontri registrati"),
        ("11", "Replica", "5 kit comune attivi", "tempi e qualità"),
        ("12", "Revisione", "piano T+90", "decisioni richieste"),
    ]
    for row, values in zip(table.rows[1:], weeks):
        for i, (cell, value) in enumerate(zip(row.cells, values)):
            B.shade(cell, BLUE_LIGHT if i == 0 else LIGHT); B.borders(cell, WHITE); B.cell_text(cell, value, size=7.6, bold=(i == 0))
    B.add_heading(doc, "Ritmo della cabina", level=2)
    B.add_p(doc, "Lunedì 30 minuti: priorità e calendario · Venerdì 30 minuti: numeri, eccezioni e decisioni · Report mensile: risultato, stato, rischi, scelte richieste, prossime azioni.", size=9.7, color=NAVY, bold=True)


def page_team(doc):
    B.add_heading(doc, "Una squadra con un solo centro di responsabilità", kicker="Organizzazione di campagna")
    add_label(doc, "Direzione politica", "Messaggio, alleanze, candidati, posizioni pubbliche e rappresentanza. Responsabile ultimo: Coordinatore Provinciale.", fill=NAVY, accent=NAVY)
    add_label(doc, "Regia strategica", "Piano, agenda, priorità, briefing, cruscotto, qualità e integrazione tra social, stampa, portale e piazza.", fill=BLUE_LIGHT, accent=RED)
    B.add_heading(doc, "Ruoli operativi attivabili", level=2)
    add_two_up(doc, [
        ("Responsabile organizzazione", "referenti, volontari, macroaree, formazione e copertura"),
        ("Responsabile editoriale", "calendario, copy, approvazioni, archivio e coerenza"),
        ("Produzione visual/video", "riprese, montaggio, fotografie, grafiche e liberatorie"),
        ("Ufficio stampa", "notizie, relazioni, rassegna, portavoce e risposta"),
        ("Responsabile portale/dati", "pagine-comune, analytics, CRM, accessi e privacy"),
        ("Responsabile eventi", "permessi, materiali, sicurezza, logistica e consuntivo"),
        ("5 referenti d’area", "coordinano comuni e consegnano dati/agenda alla regia"),
        ("Controllo qualità", "fonti, refusi, rischi, conformità e verifica indipendente"),
    ])
    B.add_heading(doc, "Regola di responsabilità", level=2)
    B.add_callout(doc, "Un’attività, un proprietario", "Ogni evento, pagina, lista, contenuto o risposta ha un responsabile, una scadenza, una prova e una procedura di correzione. La delega distribuisce il lavoro; non disperde la direzione.")


def page_governance(doc):
    B.add_heading(doc, "Cabina di Regia: veloci sul reversibile, prudenti sull’irreversibile", kicker="Decisioni e autonomia")
    table = doc.add_table(rows=7, cols=4)
    B.set_table_fixed(table, [3.6, 6.1, 4.2, 3.9])
    for c, h in zip(table.rows[0].cells, ["Decisione", "Esempi", "Tipo", "Chi decide"]):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=7.8, color=WHITE, bold=True)
    data = [
        ("Test editoriali", "orario, formato, CTA, titolo", "2 vie", "regia"),
        ("Calendario", "spostamenti entro modello", "2 vie", "organizzazione"),
        ("Messaggio", "slogan, temi, attacchi, repliche", "1 via", "direzione politica"),
        ("Elezioni", "candidati, liste, alleanze", "1 via", "organi competenti"),
        ("Dati", "nuovi campi, importazioni, targeting", "1 via", "politica + privacy"),
        ("Spese", "fornitori, stampa, eventi, media", "1 via", "titolare autorizzato"),
    ]
    for row, values in zip(table.rows[1:], data):
        for i, (cell, value) in enumerate(zip(row.cells, values)):
            fill = RED_LIGHT if values[2] == "1 via" else BLUE_LIGHT
            B.shade(cell, fill); B.borders(cell, WHITE); B.cell_text(cell, value, size=7.8, bold=(i == 0))
    B.add_heading(doc, "Formato del report", level=2)
    for i, text in enumerate([
        "Risultato: cosa è stato ottenuto.", "Stato: cosa procede e cosa è in ritardo.",
        "Eccezioni: rischi, errori e dati mancanti.", "Decisioni richieste: alternative e conseguenze.",
        "Prossime azioni: chi fa cosa e entro quando.",
    ], 1):
        add_stage(doc, i, f"BLOCCO {i}", text, color=BLUE)


def page_dashboard(doc):
    B.add_heading(doc, "Cruscotto, allarmi e gestione del dissenso", kicker="Controllo settimanale")
    table = doc.add_table(rows=7, cols=4)
    B.set_table_fixed(table, [4.0, 4.4, 4.2, 5.2])
    for c, h in zip(table.rows[0].cells, ["Indicatore", "Verde", "Allarme", "Azione"]):
        B.shade(c, NAVY); B.borders(c, WHITE); B.cell_text(c, h, size=7.8, color=WHITE, bold=True)
    data = [
        ("Azioni / piano", "≥90%", "<70% per 2 settimane", "ridurre calendario o rinforzare ruoli"),
        ("Follow-up 24h", "≥90%", "<75%", "bloccare nuovi eventi e recuperare arretrato"),
        ("Contatti validi", "≥85%", "<70%", "rivedere moduli e formazione"),
        ("Opt-out/reclami", "<0,5%", ">1%", "sospendere invio e audit consenso"),
        ("Volontari attivi", "≥70%/mese", "<50%", "micro-compiti e responsabile accoglienza"),
        ("Errori pubblici", "0 gravi", "1 grave", "correzione, registro causa, nuova approvazione"),
    ]
    for row, values in zip(table.rows[1:], data):
        for i, (cell, value) in enumerate(zip(row.cells, values)):
            B.shade(cell, RED_LIGHT if i == 2 else BLUE_LIGHT if i == 1 else LIGHT); B.borders(cell, WHITE); B.cell_text(cell, value, size=7.7, bold=(i == 0))
    B.add_heading(doc, "Protocollo commenti e crisi", level=2)
    add_two_up(doc, [
        ("Critica civile", "rispondere nel merito, fonte, tono calmo, proposta di confronto"),
        ("Errore nostro", "ammettere, correggere, lasciare traccia e spiegare la causa"),
        ("Provocazione", "una risposta se utile; non alimentare cicli di visibilità tossica"),
        ("Minaccia / illecito", "conservare prova, non improvvisare, escalation al responsabile e alle autorità se necessario"),
    ])
    B.add_callout(doc, "Linea rossa", "Nessuna pubblicazione automatica, profilo falso, acquisto follower, scraping di gruppi, contenuto manipolato o uso di dati sensibili per inferire il voto.", fill=RED_LIGHT, accent=RED)


def page_close(doc):
    B.add_heading(doc, "La proposta da portare al tavolo", kicker="Chiusura")
    B.add_p(doc, "Non soltanto un coordinatore disponibile, ma una struttura politica con direzione, squadra, strumenti e una campagna già progettata.", size=12, color=NAVY, bold=True, line=1.24, after=12)
    B.add_heading(doc, "Intervento da 75 secondi", level=2)
    B.add_callout(doc, "«Non propongo di aspettare la campagna elettorale: propongo di iniziarla adesso. Abbiamo diciotto comuni da conoscere e cinque aree da organizzare. Ogni banchetto sarà preparato da una campagna locale, sostenuto da una pagina dedicata e seguito da un rendiconto. Il social non servirà a collezionare follower, ma a portare persone agli incontri e trasformare disponibilità in responsabilità. Una regia provinciale coordinerà contenuti, stampa, portale, dati e piazza; i territori avranno deleghe vere e obiettivi verificabili. Entro novanta giorni possiamo avere dieci comuni attivi, un’infrastruttura proprietaria e un primo nucleo di volontari formati. Chiedo un mandato per costruire questa macchina insieme.»", "Versione interna: adattare al mandato effettivo e non presentare i target come promesse elettorali.", fill="FFF7D9", accent=GOLD)
    B.add_heading(doc, "Prime 72 ore dopo il via", level=2)
    for i, text in enumerate([
        "Nominare le funzioni, approvare regole e aprire il registro decisioni.",
        "Bloccare il calendario delle prime quattro settimane e scegliere i cinque comuni pilota.",
        "Avviare audit di canali, contatti, comitati, accessi e conformità privacy.",
        "Preparare il primo protocollo Comune 7+2 e il cruscotto baseline.",
    ], 1):
        add_stage(doc, i, f"MOSSA {i}", text, color=RED)
    B.add_callout(doc, "Decisione richiesta", "Approvare il piano come modalità ombra per 30 giorni: preparazione completa, nessuna spesa o comunicazione esterna fuori dai modelli senza autorizzazione. Revisione al giorno 30 con dati reali.")


def page_sources(doc):
    B.add_heading(doc, "Fonti e base metodologica", kicker="Appendice")
    B.add_heading(doc, "Fonti operative e normative", level=2)
    sources = [
        ("Futuro Nazionale · Statuto / Manifesto / Programma / Comitati", "https://futuronazionale.it/"),
        ("Commissione europea · Regolamento pubblicità politica", "https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/democracy-eu-citizenship-anti-corruption/democracy-and-electoral-rights/transparency-and-targeting-political-advertising_en"),
        ("Meta · fine annunci politici nell’UE", "https://about.fb.com/news/2025/07/ending-political-electoral-and-social-issue-advertising-in-the-eu/"),
        ("Google · Political Content Policy UE", "https://support.google.com/adspolicy/answer/16409999?hl=en"),
        ("Garante Privacy · propaganda elettorale", "https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/9105201"),
        ("AGCOM · par condicio", "https://www.agcom.it/competenze/media/par-condicio"),
        ("Eligendo / onData · Europee 2024", "https://github.com/ondata/elezioni_europee_2024"),
        ("Provincia MB / Prefettura MB / Il Giorno", "fonti territoriali già elencate nel dossier organizzativo"),
    ]
    for label, url in sources:
        p = doc.add_paragraph(style="List Bullet"); p.paragraph_format.space_after = Pt(2)
        B.set_run(p.add_run(label + " · "), size=8.1, color=NAVY, bold=True); B.set_run(p.add_run(url), size=7.4, color=BLUE)
    B.add_heading(doc, "Dispense Mercatorum tradotte in metodo", level=2)
    concepts = [
        ("Datificazione", "pochi dati utili, indicatori e trasparenza sulla raccolta"),
        ("Identità e sincerità", "autenticità pianificata senza artificialità o sovra-produzione"),
        ("Pubblici connessi e legami deboli", "reti locali, micro-ambasciatori e ponti tra comunità"),
        ("Community e partecipazione", "scala dal vedere al guidare; compiti reali e appartenenza"),
        ("Storytelling e città", "ogni comune come racconto verificabile di luoghi, problemi e persone"),
        ("Reputazione e dissenso", "coerenza, risposta, correzione e moderazione proporzionata"),
        ("Algoritmi ed echo chamber", "non dipendere da una piattaforma e non ottimizzare la polarizzazione"),
        ("Open data e cittadinanza", "problemi documentati, fonti accessibili e restituzione pubblica"),
    ]
    add_two_up(doc, concepts, fill=LIGHT)
    B.add_p(doc, "Nota: le dispense universitarie sono state utilizzate come base concettuale e sintetizzate in procedure originali; non ne è stato riprodotto il testo. Le norme e le policy delle piattaforme devono essere ricontrollate prima dell’avvio della campagna ufficiale.", size=8.5, color=MUTED, italic=True, before=7)


def configure(doc):
    B.configure_document(doc)
    sec = doc.sections[0]
    header = sec.header
    header.paragraphs[0].text = ""
    hp = header.paragraphs[0]; hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    B.set_run(hp.add_run("BRIANZA 2027 · PIANO CAMPAGNA TERRITORIO E SOCIAL"), size=7.2, color=MUTED, bold=True)
    footer = sec.footer
    footer.paragraphs[0].text = ""
    fp = footer.paragraphs[0]; fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    B.set_run(fp.add_run("BOZZA STRATEGICA RISERVATA · 28.08.2026"), size=7.0, color=MUTED)


def audit(doc):
    assert len(doc.sections) == 1
    assert round(doc.sections[0].page_width.cm, 1) == 21.0
    assert round(doc.sections[0].page_height.cm, 1) == 29.7
    for table in doc.tables:
        assert table.autofit is False
        for row in table.rows:
            assert row.height is None
    text = "\n".join(p.text for p in doc.paragraphs)
    assert "placeholder" not in text.lower()
    assert "Luca" in text


def build():
    eu_data, _ = B.read_eu_data()
    rows = priority_rows(eu_data)
    logo = B.crop_logo()
    flywheel = make_flywheel()
    channel_map = make_channel_map()
    protocol = make_protocol()
    funnel = make_funnel()
    doc = Document()
    configure(doc)
    pages = [
        lambda: page_cover(doc, logo),
        lambda: page_executive(doc),
        lambda: page_targets(doc),
        lambda: page_constraints(doc),
        lambda: page_system(doc, flywheel),
        lambda: page_territory(doc, rows),
        lambda: add_town_table(doc, rows[:9], "Matrice comuni · priorità 1/2"),
        lambda: add_town_table(doc, rows[9:], "Matrice comuni · priorità 2/2"),
        lambda: page_audiences(doc),
        lambda: page_narrative(doc),
        lambda: page_channels(doc, channel_map),
        lambda: page_content(doc),
        lambda: page_protocol(doc, protocol),
        lambda: page_field(doc),
        lambda: page_funnel(doc, funnel),
        lambda: page_timeline(doc),
        lambda: page_12_weeks(doc),
        lambda: page_team(doc),
        lambda: page_governance(doc),
        lambda: page_dashboard(doc),
        lambda: page_close(doc),
        lambda: page_sources(doc),
    ]
    for i, fn in enumerate(pages):
        if i:
            B.add_page_break(doc)
        fn()
    audit(doc)
    doc.save(DOCX_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    build()
