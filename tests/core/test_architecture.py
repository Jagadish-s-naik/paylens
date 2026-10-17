"""
tests/core/test_architecture.py
Enforces the architectural boundary:
Zero imports of app.ai, google, or fastapi inside app/core/*.py
Uses rglob to recursively inspect all python modules.
"""

import ast
from pathlib import Path

def test_core_has_zero_ai_or_cloud_dependencies():
    core_dir = Path(__file__).resolve().parent.parent.parent / "app" / "core"
    forbidden_prefixes = ("app.ai", "google", "fastapi")
    
    python_files = list(core_dir.rglob("*.py"))
    assert len(python_files) >= 5, f"Expected at least 5 core modules, found {len(python_files)}"
    
    for py_file in python_files:
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    for prefix in forbidden_prefixes:
                        assert not alias.name.startswith(prefix), (
                            f"Architectural Violation in {py_file.name}: imports forbidden module '{alias.name}'"
                        )
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for prefix in forbidden_prefixes:
                    assert not module.startswith(prefix), (
                        f"Architectural Violation in {py_file.name}: imports from forbidden module '{module}'"
                    )
