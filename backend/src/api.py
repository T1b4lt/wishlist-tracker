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


class ConfigResponse(BaseModel):
    analysys_hour: int
    hist_window_size: int
    is_price_drop_alert: bool
    is_stock_change_alert: bool
    telegram_bot_token: str | None
    telegram_bot_chat_id: str | None
    selected_language: str


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


class ProductUpdate(SQLModel):
    name: str | None = None
    url: str | None = None
    priority: str | None = None
    category_id: int | None = None


class ProductInfoRequest(BaseModel):
    url: str


class ProductInfoResponse(BaseModel):
    name: str
    category: str
    description: str


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

    return ConfigResponse(
        analysys_hour=int(analysys_hour_config.value) if analysys_hour_config else 12,
        hist_window_size=int(hist_window_size_config.value) if hist_window_size_config else 60,
        is_price_drop_alert=is_price_drop_alert_config.value.lower() == "true" if is_price_drop_alert_config else False,
        is_stock_change_alert=is_stock_change_alert_config.value.lower() == "true" if is_stock_change_alert_config else False,
        telegram_bot_token=telegram_bot_token_config.value if telegram_bot_token_config and telegram_bot_token_config.value else None,
        telegram_bot_chat_id=telegram_bot_chat_id_config.value if telegram_bot_chat_id_config and telegram_bot_chat_id_config.value else None,
        selected_language=selected_language_config.value if selected_language_config else "english"
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

    # If no categories exist, return an error
    if not category_names:
        raise HTTPException(status_code=400, detail="No categories found in database. Please create categories first.")

    # Call stagehand to extract product info
    product_info = await get_product_info(request.url, selected_language, category_names)

    return ProductInfoResponse(name=product_info.name, category=product_info.category, description=product_info.description)


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


@app.get("/products/{product_id}")
def read_product(product_id: int, session: SessionDep) -> Product:
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


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
    session.delete(product)
    session.commit()
    return {"ok": True}


# Product History endpoints
@app.get("/product-history/{product_id}")
def get_product_history(product_id: int, session: SessionDep) -> list[ProductHist]:
    # Verify product exists
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # Get all product history for this product, ordered by timestamp
    product_history = session.exec(
        select(ProductHist).where(ProductHist.product_id == product_id).order_by(ProductHist.timestamp)
    ).all()

    return product_history


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
