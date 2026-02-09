import os, json, re, collections
from datetime import datetime
from typing import Dict, Optional
from core.config import LOG_DIR
from core.logging import sys_logger

class PromptLogger:
    def __init__(self, filename="prompts.jsonl"):
        self.filepath = os.path.join(LOG_DIR, filename)
        if not os.path.exists(self.filepath):
            with open(self.filepath, "w", encoding="utf-8") as f:
                pass

    def log(
        self,
        req_id: str,
        mode: str,
        inputs: Dict,
        final_prompt: str,
        config: Dict,
        output_meta: Dict,
        latency: float,
        error: str = None,
        user_id: Optional[int] = None,
        inputs_full: Optional[Dict] = None,
        output_full: Optional[Dict] = None,
    ):
        entry = {
            "timestamp": datetime.now().isoformat(),
            "request_id": req_id,
            "mode": mode,
            "user_id": user_id,
            "inputs": self._sanitize(inputs),
            "final_prompt": final_prompt,
            "config": config,
            "output": output_meta,
            "latency_sec": round(latency, 3),
            "error": error,
        }
        if inputs_full is not None:
            entry["inputs_full"] = inputs_full
        if output_full is not None:
            entry["output_full"] = output_full
        try:
            with open(self.filepath, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            sys_logger.error(f"Failed to log: {e}")

    def _sanitize(self, data: Dict) -> Dict:
        if not isinstance(data, dict):
            return {"_": str(data)}
        clean = {}
        for k, v in data.items():
            if isinstance(v, str) and len(v) > 500:
                clean[k] = "<LONG_TEXT_OR_BASE64>"
            elif isinstance(v, list) and v and isinstance(v[0], str) and len(v[0]) > 500:
                clean[k] = ["<LONG_TEXT_OR_BASE64>" for _ in v]
            else:
                clean[k] = v
        return clean

class LogAnalyzer:
    def __init__(self, log_path):
        self.log_path = log_path

    def _read_logs(self, limit=1000):
        if not os.path.exists(self.log_path):
            return []
        lines = []
        try:
            with open(self.log_path, "r", encoding="utf-8") as f:
                for line in f:
                    try:
                        lines.append(json.loads(line))
                    except:
                        pass
        except Exception:
            return []
        return lines[-limit:]

    def get_history(self, limit=20, user_id: Optional[int] = None):
        logs = self._read_logs(1000)
        history = []
        for entry in reversed(logs):
            if entry.get("error"):
                continue
            if entry.get("mode") == "agent_plan":
                continue
            if user_id is not None and entry.get("user_id") != user_id:
                continue
            inputs = entry.get("inputs_full") or entry.get("inputs") or {}
            outputs = entry.get("output_full") or entry.get("output") or {}
            templates = {}
            model = None
            if isinstance(inputs, dict):
                mode = entry.get("mode")
                if mode in ["text2img", "multi_image_generate"]:
                    if inputs.get("size"):
                        templates["size"] = inputs.get("size")
                    if inputs.get("aspect_ratio"):
                        templates["aspect_ratio"] = inputs.get("aspect_ratio")
                    model = inputs.get("model")
                elif mode == "img2video":
                    if inputs.get("duration") is not None:
                        templates["duration"] = inputs.get("duration")
                    if inputs.get("resolution"):
                        templates["resolution"] = inputs.get("resolution")
                    if inputs.get("ratio"):
                        templates["ratio"] = inputs.get("ratio")
                    model = inputs.get("model")
            prompt_value = ""
            if isinstance(inputs, dict):
                prompt_value = inputs.get("prompt") or inputs.get("text") or ""
            history.append({
                "id": entry.get("request_id"),
                "time": entry.get("timestamp"),
                "mode": entry.get("mode"),
                "prompt": prompt_value or "",
                "note": "",
                "templates": templates,
                "model": model,
                "final_prompt": entry.get("final_prompt") or "",
                "inputs": inputs if isinstance(inputs, dict) else {},
                "outputs": outputs if isinstance(outputs, dict) else {},
            })
            if len(history) >= limit:
                break
        return history

    def get_stats(self):
        logs = self._read_logs(1000)
        if not logs:
            return {"modes": {}, "keywords": []}

        mode_counter = collections.Counter()
        text_corpus = []
        for entry in logs:
            mode_counter[entry.get("mode", "unknown")] += 1
            inputs = entry.get("inputs") or {}
            if isinstance(inputs, dict):
                p = inputs.get("prompt") or ""
                if p:
                    text_corpus.append(p)

        stop_words = set(["a", "an", "the", "in", "on", "of", "with", "and", "to", "is", "for"])
        words = []
        for text in text_corpus:
            tokens = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
            for t in tokens:
                if t not in stop_words:
                    words.append(t)
        top = collections.Counter(words).most_common(10)
        return {"modes": dict(mode_counter), "keywords": [k for k, _ in top]}
