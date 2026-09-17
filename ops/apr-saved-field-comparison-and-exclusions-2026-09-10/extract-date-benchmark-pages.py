import json
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parent
COMPARISON = json.loads((ROOT / "saved-non-geometric-field-comparison.json").read_text())
TARGET_FIELDS = {"intervento.data_inizio", "intervento.data_fine"}


for case in COMPARISON["cases"]:
    differences = [item for item in case["differences"] if item["fieldId"] in TARGET_FIELDS]
    if not differences:
        continue
    pdf_path = Path(case["references"]["humanBenchmark"]["localPdf"])
    reader = PdfReader(str(pdf_path))
    for difference in differences:
        hits = []
        for page_number, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            compact = " ".join(text.split())
            if difference["humanValue"] in compact or difference["aprValue"] in compact:
                start = min(
                    [position for value in (difference["humanValue"], difference["aprValue"])
                     if (position := compact.find(value)) >= 0],
                    default=0,
                )
                hits.append({
                    "page": page_number,
                    "snippet": compact[max(0, start - 170):start + 310],
                })
        print(json.dumps({
            "displayName": case["displayName"],
            "fieldId": difference["fieldId"],
            "humanValue": difference["humanValue"],
            "aprValue": difference["aprValue"],
            "pdfPath": str(pdf_path),
            "pageCount": len(reader.pages),
            "hits": hits,
        }, ensure_ascii=False))
