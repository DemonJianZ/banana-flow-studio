"""Tests for bananaflow.core.config_guard."""
from __future__ import annotations

import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

import unittest
from bananaflow.core.config_guard import MissingConfigError, require_endpoint


class TestRequireEndpoint(unittest.TestCase):
    def test_returns_stripped_url(self):
        result = require_endpoint("FOO", "http://localhost:8080/")
        self.assertEqual(result, "http://localhost:8080")

    def test_raises_on_empty_string(self):
        with self.assertRaises(MissingConfigError) as ctx:
            require_endpoint("FOO_URL", "")
        self.assertIn("FOO_URL", str(ctx.exception))

    def test_raises_on_whitespace(self):
        with self.assertRaises(MissingConfigError):
            require_endpoint("FOO_URL", "   ")

    def test_raises_on_none(self):
        with self.assertRaises(MissingConfigError):
            require_endpoint("FOO_URL", None)

    def test_error_is_runtime_error_subclass(self):
        with self.assertRaises(RuntimeError):
            require_endpoint("FOO_URL", "")


if __name__ == "__main__":
    unittest.main()
