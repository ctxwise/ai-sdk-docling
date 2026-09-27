# docling-serve (CPU) + LibreOffice + per-page confidence.
# - LibreOffice: the official image leaves it out; docling needs it for .doc/.xls/.ppt/.rtf.
# - patch_page_confidence.py: docling computes per-page confidence, docling-serve only returns the document
#   score; the patch adds the optional `pages` field its own code comment anticipates.
# Release tag, not :latest - on quay :latest follows the main branch, not releases. Bump + rerun tests.
ARG DOCLING_VERSION=v1.35.0
FROM quay.io/docling-project/docling-serve-cpu:${DOCLING_VERSION}
USER 0
RUN dnf install -y --setopt=install_weak_deps=False libreoffice-writer libreoffice-calc libreoffice-impress \
 && dnf clean all && rm -rf /var/cache/dnf
COPY patch_page_confidence.py /tmp/
RUN python /tmp/patch_page_confidence.py && rm /tmp/patch_page_confidence.py
USER 1001
