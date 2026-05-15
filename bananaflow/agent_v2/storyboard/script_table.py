from __future__ import annotations

import csv
import io
import re
from typing import Any, Dict, List, Tuple


_HEADER_ALIASES = {
    "shot_no": {"镜号", "镜头", "镜头号", "shot", "shot_no", "shot number", "编号"},
    "camera_motion": {"固定/运动", "机位运动", "运动", "运镜", "camera_motion", "motion"},
    "shot_size": {"景别", "shot_size", "size"},
    "visual_content": {"画面内容", "画面", "内容", "visual_content", "visual"},
    "dialogue": {"台词", "对白", "dialogue", "dialog"},
    "sound": {"音效/bgm", "音效", "bgm", "音乐", "sound", "sound_description"},
    "duration": {"时长", "时长(s)", "duration", "duration_sec"},
    "reference": {"参考", "参考图", "reference"},
}

_REQUIRED_MARKERS = ("镜号", "画面内容")


def normalize_script_table_text(text: str) -> str:
    raw = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    return "\n".join(line.rstrip() for line in raw.split("\n")).strip()


def looks_like_storyboard_script_table(text: str, filename: str = "") -> bool:
    normalized = normalize_script_table_text(text)
    if not normalized:
        return False
    lower_name = str(filename or "").strip().lower()
    if lower_name.endswith((".csv", ".tsv", ".md", ".markdown", ".txt")):
        if any(marker in normalized for marker in _REQUIRED_MARKERS):
            return True
    return all(marker in normalized for marker in _REQUIRED_MARKERS)


def parse_storyboard_script_table(text: str) -> List[Dict[str, str]]:
    normalized = normalize_script_table_text(text)
    if not normalized:
        return []
    for parser in (_parse_markdown_pipe_table, _parse_delimited_table):
        rows = parser(normalized)
        if rows:
            return rows
    return []


def format_script_rows_for_prompt(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for index, row in enumerate(rows, start=1):
        out.append(
            {
                "shot_no": str(row.get("shot_no") or index).strip(),
                "camera_motion": str(row.get("camera_motion") or "").strip(),
                "shot_size": str(row.get("shot_size") or "").strip(),
                "visual_content": str(row.get("visual_content") or "").strip(),
                "dialogue": str(row.get("dialogue") or "").strip(),
                "sound": str(row.get("sound") or "").strip(),
                "duration": str(row.get("duration") or "").strip(),
                "reference": str(row.get("reference") or "").strip(),
            }
        )
    return out


def _parse_markdown_pipe_table(text: str) -> List[Dict[str, str]]:
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    pipe_lines = [line for line in lines if "|" in line]
    if len(pipe_lines) < 2:
        return []
    headers = _split_pipe_row(pipe_lines[0])
    if not headers:
        return []
    header_map = _map_headers(headers)
    if "shot_no" not in header_map or "visual_content" not in header_map:
        return []
    data_lines = pipe_lines[1:]
    if data_lines and _is_markdown_separator_row(_split_pipe_row(data_lines[0])):
        data_lines = data_lines[1:]
    return _rows_from_cells(headers, data_lines, splitter=_split_pipe_row)


def _parse_delimited_table(text: str) -> List[Dict[str, str]]:
    sample = "\n".join(line for line in text.split("\n") if line.strip())[:4000]
    delimiter = _detect_delimiter(sample)
    if not delimiter:
        return []
    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    rows = [[str(cell or "").strip() for cell in row] for row in reader]
    rows = [row for row in rows if any(cell for cell in row)]
    if len(rows) < 2:
        return []
    headers = rows[0]
    header_map = _map_headers(headers)
    if "shot_no" not in header_map or "visual_content" not in header_map:
        return []
    data_rows = rows[1:]
    return _rows_from_row_values(headers, data_rows)


def _rows_from_cells(headers: List[str], lines: List[str], *, splitter) -> List[Dict[str, str]]:
    data_rows = [splitter(line) for line in lines]
    return _rows_from_row_values(headers, data_rows)


def _rows_from_row_values(headers: List[str], data_rows: List[List[str]]) -> List[Dict[str, str]]:
    header_map = _map_headers(headers)
    if "shot_no" not in header_map or "visual_content" not in header_map:
        return []
    out: List[Dict[str, str]] = []
    current: Dict[str, str] | None = None
    for cells in data_rows:
        row = _cells_to_row(cells, header_map)
        shot_no = str(row.get("shot_no") or "").strip()
        has_primary_content = bool(shot_no or str(row.get("visual_content") or "").strip())
        if shot_no:
            if current:
                out.append(current)
            current = row
            continue
        if has_primary_content and current is None:
            current = row
            continue
        if current is None:
            continue
        current = _merge_row_fragment(current, row)
    if current:
        out.append(current)
    return [row for row in out if str(row.get("visual_content") or "").strip() or str(row.get("dialogue") or "").strip()]


def _merge_row_fragment(base: Dict[str, str], fragment: Dict[str, str]) -> Dict[str, str]:
    merged = dict(base)
    for key, value in fragment.items():
        text = str(value or "").strip()
        if not text:
            continue
        if not str(merged.get(key) or "").strip():
            merged[key] = text
            continue
        if text == str(merged.get(key) or "").strip():
            continue
        merged[key] = f"{merged[key]}\n{text}".strip()
    return merged


def _cells_to_row(cells: List[str], header_map: Dict[str, int]) -> Dict[str, str]:
    row: Dict[str, str] = {}
    for key, index in header_map.items():
        if index < len(cells):
            row[key] = str(cells[index] or "").strip()
    return row


def _split_pipe_row(line: str) -> List[str]:
    stripped = str(line or "").strip().strip("|")
    return [part.strip() for part in stripped.split("|")]


def _is_markdown_separator_row(cells: List[str]) -> bool:
    if not cells:
        return False
    return all(re.fullmatch(r":?-{2,}:?", str(cell or "").strip()) for cell in cells)


def _detect_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters="\t,;|")
        return str(dialect.delimiter or "")
    except Exception:
        pass
    if "\t" in sample:
        return "\t"
    if "," in sample:
        return ","
    if "|" in sample:
        return "|"
    return ""


def _map_headers(headers: List[str]) -> Dict[str, int]:
    mapped: Dict[str, int] = {}
    for index, raw_header in enumerate(headers):
        normalized = _normalize_header(raw_header)
        for canonical, aliases in _HEADER_ALIASES.items():
            if normalized in {_normalize_header(alias) for alias in aliases}:
                mapped[canonical] = index
                break
    return mapped


def _normalize_header(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"\s+", "", text)
    return text
