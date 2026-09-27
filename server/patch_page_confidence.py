"""Add per-page confidence to docling-serve responses.

docling computes a ConfidenceReport with per-page scores, but docling-serve's ConfidenceScores response model is
document-level only ("A per-page breakdown can be added later as an optional `pages` field"). This adds exactly
that optional field. Fails the build if the upstream code changed, so it can never apply silently to other code.
"""
import docling.datamodel.service.responses as mod

path = mod.__file__
src = open(path, encoding="utf-8").read()

field_anchor = "    low_grade: QualityGrade = QualityGrade.UNSPECIFIED\n\n    @classmethod\n    def from_scores("
return_anchor = "            low_grade=scores.low_grade,\n        )"
assert src.count(field_anchor) == 1 and src.count(return_anchor) == 1, "docling-serve changed: update patch_page_confidence.py"

src = src.replace(field_anchor, field_anchor.replace(
    "\n\n    @classmethod",
    "\n    # per-page scores, keyed by page number (added by ai-sdk-docling's image build)\n"
    "    pages: Optional[dict[str, dict[str, Optional[float]]]] = None\n\n    @classmethod",
))
src = src.replace(return_anchor, (
    "            low_grade=scores.low_grade,\n"
    "            pages={\n"
    "                str(k): {\n"
    "                    'low_score': _nan_to_none(v.low_score), 'mean_score': _nan_to_none(v.mean_score),\n"
    "                    'ocr_score': _nan_to_none(v.ocr_score), 'layout_score': _nan_to_none(v.layout_score),\n"
    "                    'parse_score': _nan_to_none(v.parse_score), 'table_score': _nan_to_none(v.table_score),\n"
    "                }\n"
    "                for k, v in getattr(scores, 'pages', {}).items()\n"
    "            } or None,\n"
    "        )"
))
open(path, "w", encoding="utf-8").write(src)
print("patched", path)
