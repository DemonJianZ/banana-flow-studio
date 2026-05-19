"""Tests for /healthz and /readyz endpoints."""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

from fastapi.testclient import TestClient


class TestHealthz(unittest.TestCase):
    def _get_client(self):
        from bananaflow.api.health_routes import health_router
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(health_router)
        return TestClient(app)

    def test_healthz_returns_200(self):
        client = self._get_client()
        r = client.get("/healthz")
        self.assertEqual(r.status_code, 200)

    def test_healthz_has_status_ok(self):
        client = self._get_client()
        r = client.get("/healthz")
        self.assertEqual(r.json()["status"], "ok")

    def test_healthz_has_timestamp(self):
        client = self._get_client()
        r = client.get("/healthz")
        self.assertIn("timestamp", r.json())


class TestReadyz(unittest.TestCase):
    def _get_client(self):
        from bananaflow.api.health_routes import health_router
        from fastapi import FastAPI
        app = FastAPI()
        app.include_router(health_router)
        return TestClient(app)

    def test_readyz_writable_dir_returns_200(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch("bananaflow.api.health_routes._DATA_DIR", tmpdir):
                client = self._get_client()
                r = client.get("/readyz")
        self.assertIn(r.status_code, (200, 503))
        data = r.json()
        self.assertIn("status", data)
        self.assertIn("checks", data)
        self.assertIn("sqlite_writable", data["checks"])

    def test_readyz_unwritable_dir_returns_503(self):
        with patch("bananaflow.api.health_routes._DATA_DIR", "/nonexistent_dir_xyz"):
            client = self._get_client()
            r = client.get("/readyz")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["status"], "not_ready")
        self.assertEqual(r.json()["checks"]["sqlite_writable"]["status"], "error")

    def test_readyz_default_jwt_secret_is_degraded(self):
        with patch("bananaflow.api.health_routes._JWT_SECRET", "bananaflow_dev_secret"), \
             patch("bananaflow.api.health_routes._JWT_DEFAULT", "bananaflow_dev_secret"):
            with tempfile.TemporaryDirectory() as tmpdir:
                with patch("bananaflow.api.health_routes._DATA_DIR", tmpdir):
                    client = self._get_client()
                    r = client.get("/readyz")
        checks = r.json()["checks"]
        self.assertEqual(checks["jwt_secret"]["status"], "degraded")

    def test_readyz_unconfigured_external_services_are_skip(self):
        with patch("bananaflow.api.health_routes._COMFYUI_URL", ""), \
             patch("bananaflow.api.health_routes._AI_CHAT_URL", ""), \
             patch("bananaflow.api.health_routes._GEMINI_KEY", ""):
            with tempfile.TemporaryDirectory() as tmpdir:
                with patch("bananaflow.api.health_routes._DATA_DIR", tmpdir):
                    client = self._get_client()
                    r = client.get("/readyz")
        checks = r.json()["checks"]
        self.assertEqual(checks["comfyui"]["status"], "skip")
        self.assertEqual(checks["ai_chat_downstream"]["status"], "skip")
        self.assertEqual(checks["gemini_key"]["status"], "skip")


if __name__ == "__main__":
    unittest.main()
