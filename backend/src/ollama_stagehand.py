"""TEMPORARY feasibility test: run the Stagehand product extractions on Ollama.

Stagehand v4 only supports five hosted providers by name (openai, anthropic,
google, groq, cerebras) and has no ``base_url`` option, so Ollama cannot be
selected with a ``"ollama/<model>"`` string. Instead, v4 accepts a
"bring-your-own-LLM" async callback as ``model``: Stagehand sends every
inference request (a prompt plus a JSON schema) to that callback, which here
forwards it to Ollama's ``/api/chat`` with structured outputs (``format``).

Usage (from ``backend/``)::

    uv run python -m src.ollama_stagehand <url> [--model gemma4:e4b]

Environment:
    OLLAMA_URL: Ollama base URL (default ``http://localhost:11434``).
    OLLAMA_MODEL: default model when ``--model`` is not given.
"""

import argparse
import asyncio
import json
import os
import time

import httpx
from src.stagehand_utils import (
    CHROME_ARGS,
    DISMISS_POPUPS_INSTRUCTION,
    ProductInfoExtraction,
    ProductStatusExtraction,
)
from stagehand import LLMStructuredGenerateResult, Stagehand, local_browser

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "qwen3.8:latest")

# Local models on CPU/consumer GPUs can take a while on big page snapshots.
OLLAMA_TIMEOUT_SECONDS = 600

TEST_LANGUAGE = "english"
TEST_CATEGORIES = ["Electronics", "Books", "Clothing", "Home & Kitchen"]


def _to_ollama_message(message) -> dict:
    """Convert a Stagehand ``LLMMessage`` into an Ollama chat message.

    Text blocks are concatenated; image blocks (sent by
    ``extract(screenshot=True)``) go to Ollama's ``images`` field.
    """
    blocks = message.content if isinstance(message.content, list) else [message.content]
    texts: list[str] = []
    images: list[str] = []
    for block in blocks:
        content = block.root
        if content.type == "text":
            texts.append(content.text)
        elif content.type == "image":
            images.append(content.data)
    ollama_message = {"role": message.role.value, "content": "\n".join(texts)}
    if images:
        ollama_message["images"] = images
    return ollama_message


def _sanitize_schema(node):
    """Make a Stagehand JSON schema compatible with Ollama's grammar converter.

    Ollama (llama.cpp grammar) fails with "failed to parse grammar" on regex
    shorthand classes such as ``\\d`` in ``pattern`` (Stagehand's act schema
    uses ``^\\d+-\\d+$`` for element ids), so they are rewritten as explicit
    character classes, keeping the constraint.
    """
    if isinstance(node, dict):
        return {
            key: (
                value.replace("\\d", "[0-9]")
                if key == "pattern" and isinstance(value, str)
                else _sanitize_schema(value)
            )
            for key, value in node.items()
        }
    if isinstance(node, list):
        return [_sanitize_schema(item) for item in node]
    return node


def make_ollama_generate(model: str, client: httpx.AsyncClient):
    """Build the Stagehand LLM callback that runs inference on Ollama.

    Args:
        model (str): The Ollama model tag (e.g. ``gemma4:e4b``).
        client (httpx.AsyncClient): HTTP client used to reach Ollama.

    Returns:
        Callable: An async callback suitable for ``Stagehand.create(model=...)``.
    """

    async def generate(params) -> LLMStructuredGenerateResult:
        response_format = getattr(params, "response_format", None)
        if response_format is None or response_format.type != "json_schema":
            raise TypeError("Only structured (json_schema) generations are supported")

        messages = []
        if params.system_prompt:
            messages.append({"role": "system", "content": params.system_prompt})
        messages.extend(_to_ollama_message(message) for message in params.messages)

        options = {}
        if params.temperature is not None:
            options["temperature"] = params.temperature

        schema = _sanitize_schema(response_format.schema_.model_dump(mode="json"))
        started = time.perf_counter()
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "format": schema,
                "stream": False,
                "think": False,
                "options": options,
            },
        )
        if response.is_error:
            raise RuntimeError(
                f"Ollama returned {response.status_code}: {response.text[:500]}"
            )
        body = response.json()
        text = body["message"]["content"]
        input_tokens = body.get("prompt_eval_count", 0)
        output_tokens = body.get("eval_count", 0)
        print(
            f"  [ollama] {response_format.name}: {time.perf_counter() - started:.1f}s, "
            f"{input_tokens} in / {output_tokens} out tokens"
        )

        return LLMStructuredGenerateResult.model_validate(
            {
                "role": "assistant",
                "content": {"type": "text", "text": text},
                "output_format": "json_schema",
                "structured_content": json.loads(text),
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
            }
        )

    return generate


async def run(url: str, model: str) -> None:
    """Open ``url`` and run the product-info and price/stock extractions."""
    async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT_SECONDS) as client:
        browser = await local_browser.launch(
            headless=True,
            executable_path=os.getenv("CHROME_PATH") or None,
            chromium_sandbox=False,
            args=CHROME_ARGS,
        )
        try:
            stagehand = await Stagehand.create(
                browser=browser, model=make_ollama_generate(model, client)
            )
            try:
                page = (await browser.context.pages())[0]
                await page.goto(url)

                print(f"Model: {model}\n\n== act: dismiss pop-ups")
                await stagehand.act(DISMISS_POPUPS_INSTRUCTION, page=page)

                print("\n== extract: product info")
                started = time.perf_counter()
                info = await stagehand.extract(
                    (
                        f"Extract the product name, category, currency, description and store name. "
                        f"The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc. "
                        f"For description, provide a concise summary of the product's key features and uses. "
                        f"For categories, select one from the following list, the most accurate: {', '.join(TEST_CATEGORIES)} "
                        f"For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price. "
                        f"For store name, give the brand name of the online store selling the product (e.g., Amazon, Decathlon, PcComponentes), not the product brand. "
                        f"The product information should be provided in {TEST_LANGUAGE} language."
                    ),
                    ProductInfoExtraction,
                    page=page,
                )
                print(f"  ({time.perf_counter() - started:.1f}s) {info.data!r}")

                print("\n== extract: price and stock")
                started = time.perf_counter()
                status = await stagehand.extract(
                    "Extract the price of the product as a float number and if it's in stock as boolean",
                    ProductStatusExtraction,
                    page=page,
                )
                print(f"  ({time.perf_counter() - started:.1f}s) {status.data!r}")
            finally:
                await stagehand.close()
        finally:
            await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("url", help="Product page URL")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama model tag")
    args = parser.parse_args()
    asyncio.run(run(args.url, args.model))
