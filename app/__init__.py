from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "app" / "static"
CONFIG_DIR = BASE_DIR / "data" / "user-config"

app = FastAPI(
    title="MSFS Career Simulator",
    version="1.0.0",
    description="Backend locale in FastAPI per la generazione di voli e la gestione dei file di configurazione.",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/data", StaticFiles(directory=str(BASE_DIR)), name="data")


@app.on_event("startup")
async def ensure_local_dirs() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def healthcheck() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "FastAPI",
        "config_dir": str(CONFIG_DIR),
    }


@app.get("/", include_in_schema=False)
async def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "pages" / "index.html")


@app.get("/index.html", include_in_schema=False)
async def serve_index_html() -> FileResponse:
    return FileResponse(STATIC_DIR / "pages" / "index.html")


@app.get("/generazioni-voli", include_in_schema=False)
async def serve_generazioni_voli() -> FileResponse:
    return FileResponse(STATIC_DIR / "pages" / "generazione-voli.html")


async def save_upload(file: UploadFile | None, target_name: str) -> str | None:
    if file is None:
        return None

    content = await file.read()
    destination = CONFIG_DIR / target_name
    await asyncio.to_thread(destination.write_bytes, content)
    return str(destination.relative_to(BASE_DIR))


@app.post("/api/config/upload")
async def upload_config_files(
    aircraft: UploadFile | None = File(default=None),
    airports: UploadFile | None = File(default=None),
    missions: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    saved: dict[str, str] = {}

    if aircraft is not None:
        result = await save_upload(aircraft, aircraft.filename or "aircraft.js")
        if result:
            saved["aircraft"] = result

    if airports is not None:
        result = await save_upload(airports, airports.filename or "airports.js")
        if result:
            saved["airports"] = result

    if missions is not None:
        result = await save_upload(missions, missions.filename or "missions.js")
        if result:
            saved["missions"] = result

    return {
        "status": "ok",
        "saved": saved,
        "config_dir": str(CONFIG_DIR),
    }


@app.get("/api/config")
async def list_saved_configs() -> dict[str, Any]:
    files: list[dict[str, str]] = []
    if CONFIG_DIR.exists():
        for item in sorted(CONFIG_DIR.iterdir()):
            files.append(
                {
                    "name": item.name,
                    "path": str(item.relative_to(BASE_DIR)),
                    "size": str(item.stat().st_size),
                }
            )

    return {
        "status": "ok",
        "config_dir": str(CONFIG_DIR),
        "files": files,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
