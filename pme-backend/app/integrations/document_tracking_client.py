from __future__ import annotations

from typing import Any

import requests

from app.config import settings


def fetch_document_by_dtn(dtn_no: str) -> list[dict[str, Any]]:
    """
    Fetch all document files linked to a DTN/document_id.
    """

    if (
        not settings.DOCUMENT_TRACKING_API_BASE_URL
        or not settings.DOCUMENT_TRACKING_API_KEY
    ):
        return []

    url = (
        f"{settings.DOCUMENT_TRACKING_API_BASE_URL.rstrip('/')}"
        "/document_files"
    )

    try:
        response = requests.get(
            url,
            headers={
                "apikey": settings.DOCUMENT_TRACKING_API_KEY,
                "Authorization": f"Bearer {settings.DOCUMENT_TRACKING_API_KEY}",
                "Content-Type": "application/json",
            },
            params={
                "document_id": f"eq.{dtn_no}",
                "select": (
                    "id,"
                    "document_id,"
                    "name,"
                    "uploaded_at,"
                    "uploaded_by,"
                    "url"
                ),
                "order": "uploaded_at.desc",
            },
            timeout=settings.EXTERNAL_API_TIMEOUT_SECONDS,
        )

        response.raise_for_status()

        data = response.json()

        if isinstance(data, list):
            return data

        return []

    except requests.RequestException:
        return []
