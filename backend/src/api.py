"""
Wishlist Tracker API — application factory.

This module creates the FastAPI app, registers middleware, and includes
all domain routers. Business logic lives in ``services/``; route
definitions live in ``routers/``.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from src.core.database import lifespan
from src.routers import (
    category_router,
    config_router,
    product_router,
    telegram_router,
)

app = FastAPI(
    title="Wishlist Tracker API",
    version="0.0.1",
    lifespan=lifespan,
)

# --- CORS middleware ---

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Register routers ---

app.include_router(config_router.router)
app.include_router(category_router.router)
app.include_router(product_router.router)
app.include_router(telegram_router.router)
