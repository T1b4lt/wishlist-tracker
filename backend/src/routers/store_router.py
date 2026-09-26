"""
Store router — serves store favicons.
"""

from fastapi import APIRouter, Response
from src.core.database import SessionDep
from src.services import store_service

router = APIRouter(tags=["stores"])

# Favicons never change once stored, so browsers may cache them for a week.
# The CSP/nosniff headers keep a stored SVG inert if opened directly.
FAVICON_HEADERS = {
    "Cache-Control": "public, max-age=604800",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
}


@router.get("/stores/{store_id}/favicon")
def get_store_favicon(store_id: int, session: SessionDep) -> Response:
    """Return the stored favicon image of a store."""
    content, mime = store_service.get_favicon(session, store_id)
    return Response(content=content, media_type=mime, headers=FAVICON_HEADERS)
