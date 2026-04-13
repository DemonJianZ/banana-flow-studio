import os
import sys
import unittest
from typing import Optional
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.services import comfyui  # noqa: E402


class _FakeResponse:
    def __init__(self, status_code: int, text: str = "", payload: Optional[dict] = None):
        self.status_code = status_code
        self.text = text
        self._payload = payload or {}

    def json(self):
        return self._payload


class ComfyUiUploadTests(unittest.TestCase):
    def test_upload_file_should_retry_transient_502_then_succeed(self):
        responses = [
            _FakeResponse(502, text="bad gateway"),
            _FakeResponse(200, payload={"name": "uploaded.png"}),
        ]
        with (
            mock.patch.object(comfyui.requests, "post", side_effect=responses) as mock_post,
            mock.patch.object(comfyui.time, "sleep") as mock_sleep,
        ):
            uploaded = comfyui._upload_file(b"img_bytes", "input.png", "image/png")

        self.assertEqual(uploaded, "uploaded.png")
        self.assertEqual(mock_post.call_count, 2)
        mock_sleep.assert_called_once()

    def test_upload_file_should_not_retry_on_non_retryable_status(self):
        with mock.patch.object(comfyui.requests, "post", return_value=_FakeResponse(400, text="bad request")) as mock_post:
            with self.assertRaises(comfyui.ComfyUiError) as ctx:
                comfyui._upload_file(b"img_bytes", "input.png", "image/png")

        self.assertIn("ComfyUI upload failed: 400", str(ctx.exception))
        self.assertEqual(mock_post.call_count, 1)

    def test_upload_image_should_forward_mime_type(self):
        with mock.patch.object(comfyui, "_upload_file", return_value="uploaded.webp") as mock_upload_file:
            uploaded = comfyui._upload_image(b"img_bytes", "input.webp", "image/webp")

        self.assertEqual(uploaded, "uploaded.webp")
        mock_upload_file.assert_called_once_with(b"img_bytes", "input.webp", "image/webp")


if __name__ == "__main__":
    unittest.main()
