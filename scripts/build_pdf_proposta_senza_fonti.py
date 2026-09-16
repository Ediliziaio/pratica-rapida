from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/Users/giulianolavoro/Desktop/futuro nazionale/x luca /presentazione alla prima riunione/proposta coordinamento.pdf")
OUT = ROOT / "output" / "pdf" / "Proposta_Coordinamento_Luca_Viviani_senza_fonti.pdf"
TMP = Path("/private/tmp/proposta_luca_pagina15_pulita.pdf")

NAVY = HexColor("#092343")
BLUE = HexColor("#2767B7")
RED = HexColor("#D64050")
GOLD = HexColor("#F0C400")
INK = HexColor("#283648")
MUTED = HexColor("#66748A")
BLUE_LIGHT = HexColor("#E8F1FD")
GOLD_LIGHT = HexColor("#FFF7D9")


def footer_header(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(1.6 * cm, A4[1] - 0.88 * cm, "NOTA PERSONALE · NON CONSEGNARE CON IL DOSSIER")
    canvas.drawRightString(A4[0] - 1.6 * cm, A4[1] - 0.88 * cm, "PAGINA 15")
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(A4[0] / 2, 0.72 * cm, "PER LUCA · PROMEMORIA RISERVATO")
    canvas.restoreState()


def callout(title, text, fill, accent, styles):
    content = [
        Paragraph(title, styles["callout_title"]),
        Paragraph(text, styles["callout_body"]),
    ]
    table = Table([[content]], colWidths=[17.45 * cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (0, 0), 0, fill),
        ("LINEBEFORE", (0, 0), (0, 0), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 11),
        ("RIGHTPADDING", (0, 0), (-1, -1), 11),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def make_clean_page():
    styles = {
        "kicker": ParagraphStyle("kicker", fontName="Helvetica-Bold", fontSize=8.2,
                                 leading=10, textColor=RED, spaceAfter=5),
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=23,
                                leading=27, textColor=NAVY, spaceAfter=9),
        "lead": ParagraphStyle("lead", fontName="Helvetica-Bold", fontSize=11.2,
                               leading=14.2, textColor=NAVY, spaceAfter=10),
        "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=13,
                             leading=16, textColor=NAVY, spaceBefore=11, spaceAfter=6),
        "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.7,
                                 leading=12.4, textColor=INK, leftIndent=13,
                                 firstLineIndent=-9, bulletIndent=0, spaceAfter=5),
        "callout_title": ParagraphStyle("callout_title", fontName="Helvetica-Bold",
                                        fontSize=9, leading=11, textColor=NAVY, spaceAfter=3),
        "callout_body": ParagraphStyle("callout_body", fontName="Helvetica",
                                       fontSize=9, leading=12, textColor=INK),
    }
    doc = SimpleDocTemplate(str(TMP), pagesize=A4, leftMargin=1.6 * cm,
                            rightMargin=1.6 * cm, topMargin=1.55 * cm,
                            bottomMargin=1.5 * cm, title="Come leggere le schede dei comuni")
    story = [
        Spacer(1, 0.25 * cm),
        Paragraph("NOTA PERSONALE · PAGINA SEPARATA", styles["kicker"]),
        Paragraph("Luca, questo foglio tienitelo per te", styles["title"]),
        Paragraph(
            "Questa pagina aiuta a leggere correttamente le schede dei diciotto comuni e a rispondere "
            "in modo semplice se durante la riunione vengono chiesti chiarimenti su colori e percentuali.",
            styles["lead"],
        ),
        callout(
            "Come usarlo martedì",
            "Fai il tuo intervento senza leggere il dossier. Quando hai finito, senza troppa teatralità, "
            "puoi dire: «Ho messo tutto per iscritto, con tempi e dati». Poi lasci una copia a chi decide. "
            "Questa pagina resta un promemoria personale per eventuali domande sulle schede territoriali.",
            GOLD_LIGHT, GOLD, styles,
        ),
        Paragraph("Come leggere le schede dei comuni", styles["h2"]),
    ]
    bullets = [
        "La percentuale grande è quella ottenuta dal sindaco vincente nell’ultima elezione comunale disponibile: 2021, 2022 oppure 2024 nel caso di Bovisio-Masciago.",
        "Il blu indica un’amministrazione ricondotta al centrodestra, il rosso al centrosinistra e il verde acqua una lista civica; Bovisio-Masciago è evidenziata come commissariata.",
        "Nelle tre caselle in basso compaiono i dati delle Europee 2024: area CDX uguale a Fratelli d’Italia, Lega e Forza Italia; area CSX uguale a Partito Democratico e Alleanza Verdi e Sinistra; la terza cifra è l’affluenza.",
        "I risultati europei sono fotografie del territorio, non una previsione di voto per Futuro Nazionale e nemmeno una stima automatica delle future elezioni comunali.",
        "Maggio 2027 è una finestra di pianificazione: la data ufficiale arriverà soltanto con la convocazione delle elezioni.",
    ]
    for item in bullets:
        story.append(Paragraph("• " + item, styles["bullet"]))
    story.extend([
        Spacer(1, 0.15 * cm),
        callout(
            "Una cosa importante",
            "Le deleghe, le cinque aree e gli obiettivi sono una proposta da discutere e adattare. "
            "Vanno presentati come un metodo aperto alla squadra, non come decisioni già prese.",
            BLUE_LIGHT, BLUE, styles,
        ),
    ])
    doc.build(story, onFirstPage=footer_header)


def merge():
    make_clean_page()
    source = PdfReader(SOURCE)
    clean = PdfReader(TMP)
    writer = PdfWriter()
    for page in source.pages[:14]:
        writer.add_page(page)
    clean_page = clean.pages[0]
    reference_box = source.pages[0].mediabox
    exact_box = RectangleObject([
        float(reference_box.left), float(reference_box.bottom),
        float(reference_box.right), float(reference_box.top),
    ])
    clean_page.mediabox = exact_box
    clean_page.cropbox = RectangleObject(list(exact_box))
    writer.add_page(clean_page)
    if source.metadata:
        writer.add_metadata({k: str(v) for k, v in source.metadata.items() if v is not None})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("wb") as stream:
        writer.write(stream)
    print(OUT)


if __name__ == "__main__":
    merge()
