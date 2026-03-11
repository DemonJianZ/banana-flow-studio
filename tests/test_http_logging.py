import asyncio
import json
import os
import sys
import unittest
from unittest import mock


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.core import http_logging  # noqa: E402


class _CaptureLogger:
    def __init__(self):
        self.infos = []
        self.errors = []

    def info(self, message):
        self.infos.append(str(message))

    def error(self, message):
        self.errors.append(str(message))


class HttpLoggingTests(unittest.TestCase):
    @staticmethod
    def _log_payload(message: str) -> dict:
        json_part = message[message.index("{") :]
        return json.loads(json_part)

    def _run_app(self, app, *, method="GET", path="/", query_string="", headers=None, body=b""):
        sent_messages = []
        request_messages = [{"type": "http.request", "body": body, "more_body": False}]

        async def receive():
            if request_messages:
                return request_messages.pop(0)
            return {"type": "http.disconnect"}

        async def send(message):
            sent_messages.append(message)

        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("utf-8"),
            "query_string": query_string.encode("utf-8"),
            "headers": [(str(k).lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in (headers or {}).items()],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "state": {},
        }
        asyncio.run(app(scope, receive, send))
        return sent_messages

    @staticmethod
    def _response_body(messages):
        return b"".join(msg.get("body", b"") for msg in messages if msg["type"] == "http.response.body")

    async def _echo_app(self, scope, receive, send):
        body = b""
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                break
            body += message.get("body", b"")
            if not message.get("more_body", False):
                break
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": body, "more_body": False})

    async def _streaming_app(self, scope, receive, send):
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                break
            if not message.get("more_body", False):
                break
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"chunk":"a"}', "more_body": True})
        await send({"type": "http.response.body", "body": b'{"chunk":"b"}', "more_body": False})

    async def _ok_app(self, scope, receive, send):
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                break
            if not message.get("more_body", False):
                break
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"ok":true}', "more_body": False})

    def test_should_log_json_request_and_response_with_redacted_authorization(self):
        logger = _CaptureLogger()
        payload = {"hello": "world"}
        app = http_logging.HttpTrafficLogMiddleware(self._echo_app, max_body_chars=256, max_capture_bytes=4096)
        with mock.patch.object(http_logging, "sys_logger", logger):
            messages = self._run_app(
                app,
                method="POST",
                path="/echo",
                query_string="source=unit",
                headers={
                    "content-type": "application/json",
                    "authorization": "Bearer secret-token",
                },
                body=json.dumps(payload).encode("utf-8"),
            )

        self.assertEqual(self._response_body(messages), b'{"hello": "world"}')
        request_logs = [item for item in logger.infos if "http.request" in item]
        response_logs = [item for item in logger.infos if "http.response" in item]
        self.assertTrue(request_logs)
        self.assertTrue(response_logs)
        request_payload = self._log_payload(request_logs[0])
        response_payload = self._log_payload(response_logs[-1])
        self.assertEqual(request_payload["path"], "/echo")
        self.assertEqual(request_payload["query"], "source=unit")
        self.assertEqual(request_payload["headers"]["authorization"], "<redacted>")
        self.assertEqual(request_payload["body"], '{"hello":"world"}')
        self.assertEqual(response_payload["body"], '{"hello":"world"}')

    def test_should_log_multipart_request_as_omitted_preview(self):
        logger = _CaptureLogger()
        boundary = "----CodexBoundary"
        multipart_body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="file"; filename="demo.txt"\r\n'
            "Content-Type: text/plain\r\n\r\n"
            "hello upload\r\n"
            f"--{boundary}--\r\n"
        ).encode("utf-8")
        app = http_logging.HttpTrafficLogMiddleware(self._ok_app, max_body_chars=256, max_capture_bytes=64)
        with mock.patch.object(http_logging, "sys_logger", logger):
            messages = self._run_app(
                app,
                method="POST",
                path="/upload",
                headers={
                    "content-type": f"multipart/form-data; boundary={boundary}",
                    "content-length": str(len(multipart_body)),
                },
                body=multipart_body,
            )

        self.assertEqual(self._response_body(messages), b'{"ok":true}')
        request_logs = [item for item in logger.infos if "http.request" in item and '"/upload"' in item]
        self.assertTrue(request_logs)
        self.assertIn("<body omitted", request_logs[0])
        self.assertNotIn("hello upload", request_logs[0])

    def test_should_log_streaming_response_without_breaking_body(self):
        logger = _CaptureLogger()
        app = http_logging.HttpTrafficLogMiddleware(self._streaming_app, max_body_chars=256, max_capture_bytes=4096)
        with mock.patch.object(http_logging, "sys_logger", logger):
            messages = self._run_app(app, method="GET", path="/stream")

        self.assertEqual(self._response_body(messages), b'{"chunk":"a"}{"chunk":"b"}')
        response_logs = [item for item in logger.infos if "http.response" in item and '"/stream"' in item]
        self.assertTrue(response_logs)
        response_payload = self._log_payload(response_logs[-1])
        self.assertEqual(response_payload["body"], '{"chunk":"a"}{"chunk":"b"}')


if __name__ == "__main__":
    unittest.main()
