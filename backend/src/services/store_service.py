"""
Store service — lookup, creation and favicon access for online stores.

A store is identified by the normalized domain of a product URL, so every
product pointing to the same domain shares one ``Store`` row (and its
favicon, which is therefore downloaded only once).
"""

from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from src.models.database_models import Store
from src.schemas.store import StoreResponse

# Second-level labels used under country-code TLDs (e.g. "amazon.co.uk"),
# skipped when deriving a store name from its domain.
_SECOND_LEVEL_LABELS = {"co", "com", "org", "net", "gov", "ac", "edu"}


def normalize_domain(url: str) -> str:
    """Return the store domain for a product URL.

    The hostname is lower-cased, and a trailing dot and a leading ``www.``
    are removed. Other subdomains are kept, so ``es.aliexpress.com`` and
    ``aliexpress.com`` are different stores.

    Args:
        url (str): An absolute product URL.

    Returns:
        str: The normalized domain, e.g. ``"amazon.es"``.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    hostname = urlparse((url or "").strip()).hostname
    if not hostname or not hostname.strip("."):
        raise HTTPException(
            status_code=422, detail="Invalid product URL: no domain found."
        )
    return hostname.lower().rstrip(".").removeprefix("www.")


def derive_name(domain: str) -> str:
    """Build a readable fallback store name from its domain.

    Uses the registrable name label: ``pccomponentes.com`` → ``Pccomponentes``,
    ``es.aliexpress.com`` → ``Aliexpress``, ``amazon.co.uk`` → ``Amazon``.

    Args:
        domain (str): A normalized domain.

    Returns:
        str: The capitalized name label.
    """
    labels = domain.split(".")
    if len(labels) >= 3 and labels[-2] in _SECOND_LEVEL_LABELS:
        core = labels[-3]
    elif len(labels) >= 2:
        core = labels[-2]
    else:
        core = labels[0]
    return core.capitalize()


def get_by_domain(session: Session, domain: str) -> Store | None:
    """Return the store for a normalized domain, if any.

    Args:
        session (Session): Active database session.
        domain (str): A normalized domain.

    Returns:
        Store | None: The matching store.
    """
    return session.exec(select(Store).where(Store.domain == domain)).first()


def get_or_create(
    session: Session,
    url: str,
    name: str | None = None,
    favicon: bytes | None = None,
    favicon_mime: str | None = None,
) -> Store:
    """Return the store for a URL's domain, creating it if needed.

    An existing store is returned unchanged (the first name and favicon
    stored for a domain win). A new store uses ``name`` or, when it is
    empty, a name derived from the domain.

    Args:
        session (Session): Active database session.
        url (str): The product URL.
        name (str | None): Store name to use if the store is created.
        favicon (bytes | None): Favicon bytes to store if the store is created.
        favicon_mime (str | None): Favicon mime type (ignored without ``favicon``).

    Returns:
        Store: The existing or newly created store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = normalize_domain(url)
    store = get_by_domain(session, domain)
    if store:
        return store

    store = Store(
        domain=domain,
        name=(name or "").strip() or derive_name(domain),
        favicon=favicon,
        favicon_mime=favicon_mime if favicon else None,
    )
    session.add(store)
    try:
        session.commit()
    except IntegrityError:
        # Another request created this domain in the meantime: reuse it.
        session.rollback()
        return get_by_domain(session, domain)
    session.refresh(store)
    return store


def get_favicon(session: Session, store_id: int) -> tuple[bytes, str]:
    """Return a store's favicon bytes and mime type.

    Args:
        session (Session): Active database session.
        store_id (int): The store's primary key.

    Returns:
        tuple[bytes, str]: The favicon content and its mime type.

    Raises:
        HTTPException: 404 if the store does not exist or has no favicon.
    """
    store = session.get(Store, store_id)
    if not store or not store.favicon or not store.favicon_mime:
        raise HTTPException(status_code=404, detail="Favicon not found")
    return store.favicon, store.favicon_mime


def to_response(store: Store) -> StoreResponse:
    """Convert a store into its public response schema.

    Args:
        store (Store): The store to convert.

    Returns:
        StoreResponse: Store data without the favicon bytes.
    """
    return StoreResponse(
        id=store.id,
        name=store.name,
        domain=store.domain,
        has_favicon=bool(store.favicon),
    )
