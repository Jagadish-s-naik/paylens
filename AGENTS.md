# Antigravity Agent Guidelines

## Terminal & Environment Execution
- **Persistent Terminal**: Always run shell commands in a persistent terminal (`RunPersistent: true`, `RequestedTerminalID: "paylens-term"`).
- **Python Virtual Environment**: Always ensure the local `.venv` is active or exported in `PATH` (`export PATH="${PWD}/.venv/bin:$PATH"`). Never run Python commands (`python`, `pytest`, `uvicorn`, etc.) against global system Python.
- **Backend Service**: When running the FastAPI backend daemon, use `uvicorn app.main:app --reload --port 8000`.
- **Testing**: Run tests using `pytest` (configured via `pytest.ini`).
