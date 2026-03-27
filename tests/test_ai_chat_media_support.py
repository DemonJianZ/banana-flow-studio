import base64
import os
import shutil
import sys
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)

from bananaflow.utils.images import parse_data_url  # noqa: E402

try:
    from bananaflow.api import routes  # noqa: E402
except ModuleNotFoundError:
    routes = None


class AIChatMediaSupportTests(unittest.TestCase):
    def test_parse_data_url_preserves_video_mime(self):
        raw_bytes = b"fake-mp4"
        payload = f"data:video/mp4;base64,{base64.b64encode(raw_bytes).decode('ascii')}"

        mime_type, decoded = parse_data_url(payload)

        self.assertEqual(mime_type, "video/mp4")
        self.assertEqual(decoded, raw_bytes)

    @unittest.skipIf(routes is None, "bananaflow.api.routes dependencies are not installed")
    def test_materialize_video_data_url_keeps_video_suffix(self):
        task_id = "test_media_support_video"
        raw_bytes = b"fake-mp4"
        payload = f"data:video/mp4;base64,{base64.b64encode(raw_bytes).decode('ascii')}"

        stored = routes._materialize_image_to_task_file(payload, task_id=task_id, index=0)

        self.assertEqual(stored["content_type"], "video/mp4")
        self.assertTrue(str(stored["path"]).endswith(".mp4"))
        self.assertTrue(os.path.exists(stored["path"]))

        routes._cleanup_ai_chat_task_dir(task_id)

    @unittest.skipIf(routes is None, "bananaflow.api.routes dependencies are not installed")
    def test_parse_sse_output_extracts_video_url(self):
        raw_text = (
            'event: message\n'
            'data: {"content":[{"video_url":"https://example.com/output.mp4"}]}\n'
            'event: done\n'
            'data: {"errMsg":"ignore me"}\n'
        )

        parsed = routes._parse_sse_output(raw_text)

        self.assertEqual(parsed["video_url"], "https://example.com/output.mp4")
        self.assertEqual(parsed["done_error"], "")

    @unittest.skipIf(routes is None, "bananaflow.api.routes dependencies are not installed")
    def test_extract_fast_result_from_stream_line_supports_video(self):
        line = 'data: {"content":[{"video_url":"https://example.com/output.mp4"}]}'

        media_url, done_error = routes._extract_fast_result_from_stream_line(line)

        self.assertEqual(media_url, "https://example.com/output.mp4")
        self.assertEqual(done_error, "")

    def tearDown(self):
        if routes is None:
            return
        task_dir = os.path.join(routes.AI_CHAT_TASK_FILES_DIR, "test_media_support_video")
        if os.path.isdir(task_dir):
            shutil.rmtree(task_dir, ignore_errors=True)
