"""Helpers that create products, offers and history in the test database."""

from src.models.database_models import Category, Offer, OfferHist, Product


def make_category(session, name="Electronics", color="#FF0000"):
    category = Category(name=name, color=color)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def make_product(session, category_id, name="Widget", priority="medium"):
    """Create a product without offers (add them with ``make_offer``)."""
    product = Product(
        name=name, priority=priority, category_id=category_id, description=name
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def make_offer(
    session, product_id, url="https://example.com/widget", currency="USD", store_id=None
):
    offer = Offer(product_id=product_id, url=url, currency=currency, store_id=store_id)
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def add_history(session, offer_id, entries):
    """Insert ``OfferHist`` rows from ``(price, is_in_stock, timestamp)`` tuples."""
    for price, is_in_stock, timestamp in entries:
        session.add(
            OfferHist(
                offer_id=offer_id,
                price=price,
                is_in_stock=is_in_stock,
                timestamp=timestamp,
            )
        )
    session.commit()
