"""Response schemas for stores."""

from pydantic import BaseModel


class StoreResponse(BaseModel):
    """Public store information (the favicon is served separately)."""

    id: int
    name: str
    domain: str
    has_favicon: bool
