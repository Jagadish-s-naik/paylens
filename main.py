"""
Paylens Root Entrypoint Shim.
Redirects to the production modular application in app.main.
Strictly implements ARCHITECTURE.md §7 & §14.
"""

from app.main import app

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
