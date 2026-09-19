from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "app" / "static"
DATA_ROOT = ROOT

app = FastAPI(title="MSFS Career Simulator")
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.mount("/data", StaticFiles(directory=DATA_ROOT), name="data")


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC / "pages" / "index.html")


@app.get("/generazioni-voli", include_in_schema=False)
async def generation_page() -> FileResponse:
    return FileResponse(STATIC / "pages" / "generazione-voli.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
