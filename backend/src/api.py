from contextlib import asynccontextmanager
from typing import Annotated

from pydantic import BaseModel
from fastapi import Depends, FastAPI, HTTPException
from sqlmodel import Field, Session, SQLModel, create_engine, select

from src.stagehand_utils import get_product_info


class ProductInfoRequest(BaseModel):
    url: str


class ProductInfoResponse(BaseModel):
    name: str
    category: str


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)


class CategoryCreate(SQLModel):
    name: str


class Product(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    url: str
    priority: str = Field(index=True)  # high, medium, low
    category_id: int | None = Field(default=None, foreign_key="category.id")


class ProductCreate(SQLModel):
    name: str
    url: str
    priority: str
    category_id: int | None = None


class ProductUpdate(SQLModel):
    name: str | None = None
    url: str | None = None
    priority: str | None = None
    category_id: int | None = None


sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    create_db_and_tables()
    yield
    # Shutdown (if needed in the future)


app = FastAPI(
    title="Wishlist Tracker API",
    version="0.0.1 RC1",
    lifespan=lifespan)


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

    # If no categories exist, return an error
    if not category_names:
        raise HTTPException(status_code=400, detail="No categories found in database. Please create categories first.")

    # Call stagehand to extract product info
    product_info = await get_product_info(request.url, category_names)

    return ProductInfoResponse(name=product_info.name, category=product_info.category)


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
