from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.system import router as system_router
from app.routes.terminal import router as terminal_router

app = FastAPI(
    title="Linux Tactical Dashboard API",
    description="System telemetry API for the Linux dashboard.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"https?://.*:5173",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system_router, prefix="/api/system", tags=["system"])
app.include_router(terminal_router, tags=["terminal"])


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "online"}
