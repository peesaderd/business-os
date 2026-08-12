"""
Passport Photo System - Web API Server
FastAPI-based server for passport photo processing.
"""

import os
import shutil
import uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

from processor import PassportProcessor
from countries import list_countries, get_country_spec

app = FastAPI(title="Passport Photo System", version="1.0.0")

# Setup directories
UPLOAD_DIR = Path("static/uploads")
OUTPUT_DIR = Path("output")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/output", StaticFiles(directory="output"), name="output")

# Templates
templates = Jinja2Templates(directory="templates")


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """Main page with upload form."""
    countries = list_countries()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"countries": countries},
    )


@app.get("/api/countries")
async def api_countries():
    """List available country standards."""
    return {"countries": list_countries()}


@app.post("/api/upload")
async def api_upload(file: UploadFile = File(...)):
    """Upload a photo for processing."""
    # Validate file type
    if not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    # Save upload
    ext = Path(file.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4().hex[:12]}{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)

    return {
        "filename": filename,
        "url": f"/static/uploads/{filename}",
        "message": "Upload successful",
    }


@app.post("/api/process")
async def api_process(
    filename: str = Form(...),
    country: str = Form("thailand"),
    background: str = Form("white"),
    custom_width: int = Form(35),
    custom_height: int = Form(45),
    print_sheet: bool = Form(True),
):
    """Process uploaded photo into passport format."""
    filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")

    processor = PassportProcessor(str(OUTPUT_DIR))

    try:
        result = processor.process(
            image_path=str(filepath),
            country=country,
            background=background,
            custom_width_mm=custom_width if country == "custom" else None,
            custom_height_mm=custom_height if country == "custom" else None,
            print_sheet=print_sheet,
        )
    except Exception as e:
        raise HTTPException(500, f"Processing failed: {str(e)}")

    # Convert output paths to URLs
    if result.get("outputs"):
        for key, path in result["outputs"].items():
            result["outputs"][key] = f"/output/{Path(path).name}"

    return result


@app.get("/api/download/{job_id}/{file_type}")
async def api_download(job_id: str, file_type: str):
    """Download processed photo."""
    # Find files matching job_id
    for f in OUTPUT_DIR.glob(f"{job_id}_*"):
        if file_type in f.name:
            return FileResponse(
                path=str(f),
                filename=f.name,
                media_type="image/png" if f.suffix == ".png" else "image/jpeg",
            )

    raise HTTPException(404, "File not found")


@app.get("/api/preview/{filename}")
async def api_preview(filename: str):
    """Get preview URL for uploaded image."""
    filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")

    return {"url": f"/static/uploads/{filename}"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "service": "passport-photo"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8090)
