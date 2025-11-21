import os
import sys


from pydantic import BaseModel
from typing import Annotated
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, create_engine, select

from src.database_models import Config, Category, Product, ProductHist
from src.stagehand_utils import get_product_info
from src.telegram_utils import get_chat_id, send_test_message


class ConfigUpdate(BaseModel):
    analysys_hour: int | None = None
    hist_window_size: int | None = None
    is_price_drop_alert: bool | None = None
    is_stock_change_alert: bool | None = None
    telegram_bot_token: str | None = None
    telegram_bot_chat_id: str | None = None
    selected_language: str | None = None
    google_api_key: str | None = None


class ConfigResponse(BaseModel):
    analysys_hour: int
    hist_window_size: int
    is_price_drop_alert: bool
    is_stock_change_alert: bool
    telegram_bot_token: str | None
    telegram_bot_chat_id: str | None
    selected_language: str
    google_api_key: str | None


class CategoryCreate(SQLModel):
    name: str
    color: str


class CategoryUpdate(SQLModel):
    name: str | None = None
    color: str | None = None


class ProductCreate(SQLModel):
    name: str
    url: str
    priority: str
    category_id: int
    description: str
    currency: str


class ProductUpdate(SQLModel):
    name: str | None = None
    url: str | None = None
    priority: str | None = None
    category_id: int | None = None
    currency: str | None = None


class ProductInfoRequest(BaseModel):
    url: str


class ProductInfoResponse(BaseModel):
    name: str
    category: str
    description: str
    currency: str


class ProductDashboardSummary(BaseModel):
    id: int
    name: str
    category_id: int
    category_name: str
    category_color: str
    priority: str
    current_price: float | None
    price_change_60d: float | None
    is_in_stock: bool | None
    currency: str


class ProductHistResponse(BaseModel):
    price: float
    is_in_stock: bool
    timestamp: int


class ProductDetailResponse(BaseModel):
    id: int
    name: str
    url: str
    priority: str
    category_id: int
    category_name: str
    category_color: str
    description: str
    current_price: float | None
    min_price: float | None
    is_in_stock: bool | None
    price_history: list[ProductHistResponse]
    currency: str


sqlite_file_name = "db/database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Verify database exists
    if not os.path.exists(sqlite_file_name):
        print(f"\n✗ ERROR: Database not found at '{sqlite_file_name}'")
        print("\nPlease run the setup script first:")
        print("  python src/setup_backend.py")
        print("\nTo also populate with test data:")
        print("  python src/setup_backend.py --populate\n")
        sys.exit(1)

    print(f"✓ Database found at '{sqlite_file_name}'")
    yield
    # Shutdown (if needed in the future)


app = FastAPI(
    title="Wishlist Tracker API",
    version="0.0.1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Config endpoints
@app.get("/config/")
def get_config(session: SessionDep) -> ConfigResponse:
    analysys_hour_config = session.exec(select(Config).where(Config.key == "analysys_hour")).first()
    hist_window_size_config = session.exec(select(Config).where(Config.key == "hist_window_size")).first()
    is_price_drop_alert_config = session.exec(select(Config).where(Config.key == "is_price_drop_alert")).first()
    is_stock_change_alert_config = session.exec(select(Config).where(Config.key == "is_stock_change_alert")).first()
    telegram_bot_token_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_token")).first()
    telegram_bot_chat_id_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_chat_id")).first()
    selected_language_config = session.exec(select(Config).where(Config.key == "selected_language")).first()
    google_api_key_config = session.exec(select(Config).where(Config.key == "google_api_key")).first()

    return ConfigResponse(
        analysys_hour=int(analysys_hour_config.value) if analysys_hour_config else 12,
        hist_window_size=int(hist_window_size_config.value) if hist_window_size_config else 60,
        is_price_drop_alert=is_price_drop_alert_config.value.lower() == "true" if is_price_drop_alert_config else False,
        is_stock_change_alert=is_stock_change_alert_config.value.lower() == "true" if is_stock_change_alert_config else False,
        telegram_bot_token=telegram_bot_token_config.value if telegram_bot_token_config and telegram_bot_token_config.value else None,
        telegram_bot_chat_id=telegram_bot_chat_id_config.value if telegram_bot_chat_id_config and telegram_bot_chat_id_config.value else None,
        selected_language=selected_language_config.value if selected_language_config else "english",
        google_api_key=google_api_key_config.value if google_api_key_config and google_api_key_config.value else None
    )


@app.patch("/config/")
def update_config(config_update: ConfigUpdate, session: SessionDep) -> ConfigResponse:
    if config_update.analysys_hour is not None:
        if config_update.analysys_hour < 0 or config_update.analysys_hour > 23:
            raise HTTPException(status_code=400, detail="analysys_hour must be between 0 and 23")

        analysys_hour_config = session.exec(select(Config).where(Config.key == "analysys_hour")).first()
        if analysys_hour_config:
            analysys_hour_config.value = str(config_update.analysys_hour)
        else:
            analysys_hour_config = Config(key="analysys_hour", value=str(config_update.analysys_hour))
            session.add(analysys_hour_config)

    if config_update.hist_window_size is not None:
        if config_update.hist_window_size < 30 or config_update.hist_window_size > 180:
            raise HTTPException(status_code=401, detail="hist_window_size must be between 30 and 180")

        hist_window_size_config = session.exec(select(Config).where(Config.key == "hist_window_size")).first()
        if hist_window_size_config:
            hist_window_size_config.value = str(config_update.hist_window_size)
        else:
            hist_window_size_config = Config(key="hist_window_size", value=str(config_update.hist_window_size))
            session.add(hist_window_size_config)

    if config_update.is_price_drop_alert is not None:
        is_price_drop_alert_config = session.exec(select(Config).where(Config.key == "is_price_drop_alert")).first()
        if is_price_drop_alert_config:
            is_price_drop_alert_config.value = str(config_update.is_price_drop_alert).lower()
        else:
            is_price_drop_alert_config = Config(key="is_price_drop_alert", value=str(
                config_update.is_price_drop_alert).lower())
            session.add(is_price_drop_alert_config)

    if config_update.is_stock_change_alert is not None:
        is_stock_change_alert_config = session.exec(select(Config).where(Config.key == "is_stock_change_alert")).first()
        if is_stock_change_alert_config:
            is_stock_change_alert_config.value = str(config_update.is_stock_change_alert).lower()
        else:
            is_stock_change_alert_config = Config(key="is_stock_change_alert",
                                                  value=str(config_update.is_stock_change_alert).lower())
            session.add(is_stock_change_alert_config)

    if config_update.telegram_bot_token is not None:
        telegram_bot_token_config = session.exec(
            select(Config).where(Config.key == "telegram_bot_token")).first()
        if telegram_bot_token_config:
            telegram_bot_token_config.value = config_update.telegram_bot_token
        else:
            telegram_bot_token_config = Config(key="telegram_bot_token",
                                               value=config_update.telegram_bot_token)
            session.add(telegram_bot_token_config)

    if config_update.telegram_bot_chat_id is not None:
        telegram_bot_chat_id_config = session.exec(
            select(Config).where(Config.key == "telegram_bot_chat_id")).first()
        if telegram_bot_chat_id_config:
            telegram_bot_chat_id_config.value = config_update.telegram_bot_chat_id
        else:
            telegram_bot_chat_id_config = Config(key="telegram_bot_chat_id",
                                                 value=config_update.telegram_bot_chat_id)
            session.add(telegram_bot_chat_id_config)

    if config_update.selected_language is not None:
        selected_language_config = session.exec(select(Config).where(Config.key == "selected_language")).first()
        if selected_language_config:
            selected_language_config.value = config_update.selected_language
        else:
            selected_language_config = Config(key="selected_language", value=config_update.selected_language)
            session.add(selected_language_config)

    if config_update.google_api_key is not None:
        google_api_key_config = session.exec(select(Config).where(Config.key == "google_api_key")).first()
        if google_api_key_config:
            google_api_key_config.value = config_update.google_api_key
        else:
            google_api_key_config = Config(key="google_api_key", value=config_update.google_api_key)
            session.add(google_api_key_config)

    session.commit()

    return get_config(session)


# Category endpoints
@app.post("/categories/")
def create_category(category_create: CategoryCreate, session: SessionDep) -> Category:
    category = Category.model_validate(category_create)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@app.get("/categories/")
def read_categories(session: SessionDep) -> list[Category]:
    categories = session.exec(select(Category)).all()
    return categories


@app.get("/categories/{category_id}")
def read_category(category_id: int, session: SessionDep) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@app.patch("/categories/{category_id}")
def update_category(category_id: int, category_update: CategoryUpdate, session: SessionDep) -> Category:
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    category_data = category_update.model_dump(exclude_unset=True)
    category.sqlmodel_update(category_data)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


@app.delete("/categories/{category_id}")
def delete_category(category_id: int, session: SessionDep):
    category = session.get(Category, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    # Verificar si hay productos con esta categoría
    products_with_category = session.exec(
        select(Product).where(Product.category_id == category_id)
    ).first()

    if products_with_category:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete category with associated products"
        )

    session.delete(category)
    session.commit()
    return {"ok": True}


# Stagehand endpoint
@app.post("/extract-product-info/")
async def extract_product_info(request: ProductInfoRequest, session: SessionDep) -> ProductInfoResponse:
    # Get all categories from the database
    categories = session.exec(select(Category)).all()
    category_names = [category.name for category in categories]
    selected_language_config = session.exec(select(Config).where(Config.key == "selected_language")).first()
    selected_language = selected_language_config.value if selected_language_config else "english"

    # Get Google API key from config
    google_api_key_config = session.exec(select(Config).where(Config.key == "google_api_key")).first()
    if not google_api_key_config or not google_api_key_config.value:
        raise HTTPException(status_code=400, detail="Google API key not configured. Please set it in Settings.")
    google_api_key = google_api_key_config.value

    # If no categories exist, return an error
    if not category_names:
        raise HTTPException(status_code=400, detail="No categories found in database. Please create categories first.")

    # Call stagehand to extract product info
    product_info = await get_product_info(google_api_key, request.url, selected_language, category_names)

    return ProductInfoResponse(name=product_info.name, category=product_info.category, description=product_info.description, currency=product_info.currency)


# Product endpoints
@app.post("/products/")
def create_product(product_create: ProductCreate, session: SessionDep) -> Product:
    product = Product.model_validate(product_create)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@app.get("/products/")
def read_products(session: SessionDep) -> list[Product]:
    products = session.exec(select(Product)).all()
    return products


@app.get("/products/dashboard-summary")
def get_products_dashboard_summary(session: SessionDep) -> list[ProductDashboardSummary]:
    """
    Get all products with enriched data for dashboard display:
    - Current price (most recent ProductHist record)
    - Price change percentage (comparison with average of last N records from config, excluding current)
    - Stock status (from most recent ProductHist record)
    """
    # Get hist_window_size from config
    hist_window_size_config = session.exec(select(Config).where(Config.key == "hist_window_size")).first()
    hist_window_size = int(hist_window_size_config.value) if hist_window_size_config else 60

    products = session.exec(select(Product)).all()
    summary_list = []

    for product in products:
        # Get category information
        category = session.get(Category, product.category_id)
        category_name = category.name if category else "Unknown"
        category_color = category.color if category else "gray"

        # Get product history ordered by timestamp descending (most recent first)
        product_history = session.exec(
            select(ProductHist)
            .where(ProductHist.product_id == product.id)
            .order_by(ProductHist.timestamp.desc())
        ).all()

        current_price = None
        price_change_60d = None
        is_in_stock = None

        if product_history:
            # Current price and stock from most recent record
            current_price = product_history[0].price
            is_in_stock = product_history[0].is_in_stock

            # Calculate price change if we have more than 1 record
            if len(product_history) > 1:
                # Get up to hist_window_size records (excluding the current one)
                historical_records = product_history[1:hist_window_size + 1]  # Skip first (current), take next N

                if historical_records:
                    # Calculate average price of historical records
                    avg_price = sum(record.price for record in historical_records) / len(historical_records)

                    # Calculate percentage change: ((current - avg) / avg) * 100
                    if avg_price > 0:
                        price_change_60d = ((current_price - avg_price) / avg_price) * 100

        summary_list.append(ProductDashboardSummary(
            id=product.id,
            name=product.name,
            category_id=product.category_id,
            category_name=category_name,
            category_color=category_color,
            priority=product.priority,
            current_price=current_price,
            price_change_60d=price_change_60d,
            is_in_stock=is_in_stock,
            currency=product.currency
        ))

    return summary_list


@app.get("/products/{product_id}")
def get_product_detail(product_id: int, session: SessionDep) -> ProductDetailResponse:
    """
    Get complete product details including:
    - Product information
    - Category information
    - Current price and stock status
    - Minimum price from last hist_window_size records
    - Complete price history
    """
    # Get product
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Get category
    category = session.get(Category, product.category_id)
    category_name = category.name if category else "Unknown"
    category_color = category.color if category else "gray"

    # Get hist_window_size from config
    hist_window_size_config = session.exec(select(Config).where(Config.key == "hist_window_size")).first()
    hist_window_size = int(hist_window_size_config.value) if hist_window_size_config else 60

    # Get product history ordered by timestamp descending
    product_history = session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp.desc())
    ).all()

    current_price = None
    min_price = None
    is_in_stock = None

    if product_history:
        # Current price and stock from most recent record
        current_price = product_history[0].price
        is_in_stock = product_history[0].is_in_stock

        # Calculate minimum price from last hist_window_size records
        recent_records = product_history[:hist_window_size]
        if recent_records:
            min_price = min(record.price for record in recent_records)

    # Convert history to response format (reverse to get chronological order for chart)
    price_history = [
        ProductHistResponse(
            price=record.price,
            is_in_stock=record.is_in_stock,
            timestamp=record.timestamp
        )
        for record in reversed(product_history)
    ]

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        url=product.url,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category_name,
        category_color=category_color,
        description=product.description,
        current_price=current_price,
        min_price=min_price,
        is_in_stock=is_in_stock,
        price_history=price_history,
        currency=product.currency
    )


@app.patch("/products/{product_id}")
def update_product(product_id: int, product_update: ProductUpdate, session: SessionDep) -> Product:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product_data = product_update.model_dump(exclude_unset=True)
    product.sqlmodel_update(product_data)
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


@app.delete("/products/{product_id}")
def delete_product(product_id: int, session: SessionDep):
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Delete all ProductHist records associated with this product
    product_history = session.exec(
        select(ProductHist).where(ProductHist.product_id == product_id)
    ).all()
    for hist_record in product_history:
        session.delete(hist_record)

    # Delete the product
    session.delete(product)
    session.commit()
    return {"ok": True}


# Telegram endpoints
@app.get("/telegram-chat-id")
async def get_telegram_chat_id(session: SessionDep) -> dict:
    """
    Retrieve the most recent chat ID from Telegram and save it to the database.

    Returns:
        dict: Contains the chat_id if found, or an error message
    """
    # Get the bot token from config
    telegram_bot_token_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_token")).first()

    if not telegram_bot_token_config or not telegram_bot_token_config.value:
        raise HTTPException(status_code=400, detail="Telegram bot token not configured")

    # Get the chat ID using the telegram utility
    chat_id = await get_chat_id(telegram_bot_token_config.value)

    if not chat_id:
        raise HTTPException(status_code=404, detail="No chat ID found. Please send a message to the bot first.")

    # Save the chat ID to the database
    telegram_bot_chat_id_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_chat_id")).first()

    if telegram_bot_chat_id_config:
        telegram_bot_chat_id_config.value = chat_id
    else:
        telegram_bot_chat_id_config = Config(key="telegram_bot_chat_id", value=chat_id)
        session.add(telegram_bot_chat_id_config)

    session.commit()

    return {"message": "Chat ID saved successfully"}


@app.post("/telegram-test-message")
async def send_telegram_test_message(session: SessionDep) -> dict:
    """
    Send a test message to the configured Telegram chat.

    Returns:
        dict: Success message
    """
    # Get the bot token from config
    telegram_bot_token_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_token")).first()

    if not telegram_bot_token_config or not telegram_bot_token_config.value:
        raise HTTPException(status_code=400, detail="Telegram bot token not configured")

    # Get the chat ID from config
    telegram_bot_chat_id_config = session.exec(
        select(Config).where(Config.key == "telegram_bot_chat_id")).first()

    if not telegram_bot_chat_id_config or not telegram_bot_chat_id_config.value:
        raise HTTPException(
            status_code=400, detail="Telegram chat ID not configured. Please call /telegram-chat-id first.")

    # Get the selected language
    selected_language_config = session.exec(select(Config).where(Config.key == "selected_language")).first()
    selected_language = selected_language_config.value if selected_language_config else "english"

    # Send the test message
    try:
        await send_test_message(
            telegram_bot_token_config.value,
            telegram_bot_chat_id_config.value,
            selected_language
        )
        return {"message": "Test message sent successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test message: {str(e)}")
