from __future__ import annotations

from app.integrations.document_tracking_client import (
    fetch_document_by_dtn,
)


def get_project_documents(dtn_no: str | None) -> list[dict]:
    """
    Return all uploaded files linked to a DTN/document_id.
    """

    if not dtn_no:
        return []

    rows = fetch_document_by_dtn(dtn_no)

    if not rows:
        return []

    documents: list[dict] = []

    for row in rows:
        file_url = row.get("url")

        if not file_url:
            continue

        name = row.get("name") or "Project document"

        documents.append(
            {
                "id": row.get("id"),
                "document_id": row.get("document_id"),
                "name": name,
                "document_name": name,
                "document_url": file_url,
                "uploaded_at": row.get("uploaded_at"),
                "uploaded_by": row.get("uploaded_by"),
            }
        )

    return documents
