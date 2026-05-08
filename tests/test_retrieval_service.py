import json
import os
import sys
import tempfile
import unittest


ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)
BANANAFLOW_DIR = os.path.join(ROOT_DIR, "bananaflow")
if BANANAFLOW_DIR not in sys.path:
    sys.path.insert(0, BANANAFLOW_DIR)


from bananaflow.agent.tools import AgentToolContext, build_builtin_executor, build_builtin_registry  # noqa: E402
from bananaflow.retrieval import (  # noqa: E402
    InMemoryVectorStore,
    QdrantVectorStore,
    RetrievalDocument,
    RetrievalIndexer,
    RetrievalService,
)
from bananaflow.storage.migrations import ensure_asset_db  # noqa: E402
from bananaflow.storage.sqlite import execute  # noqa: E402


class RetrievalServiceTests(unittest.TestCase):
    def test_qdrant_store_should_lazy_import_client(self):
        sys.modules.pop("qdrant_client", None)

        store = QdrantVectorStore(url="http://localhost:6333")

        self.assertNotIn("qdrant_client", sys.modules)
        self.assertEqual(store.collection_prefix, "bananaflow")

    def test_search_knowledge_should_use_inmemory_vector_store(self):
        store = InMemoryVectorStore()
        indexer = RetrievalIndexer(store)
        indexer.index_documents(
            "knowledge",
            [
                RetrievalDocument(doc_id="k1", text="Bananaflow 支持提示词润色和画布规划", metadata={"topic": "agent"}),
                RetrievalDocument(doc_id="k2", text="Qdrant 可以做向量检索", metadata={"topic": "infra"}),
            ],
        )
        service = RetrievalService(vector_store=store)

        result = service.search_knowledge("提示词润色", top_k=2)

        self.assertEqual(result["collection"], "knowledge")
        self.assertGreaterEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["doc_id"], "k1")

    def test_search_eval_cases_should_support_jsonl_without_vector_store(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "harvested.jsonl")
            rows = [
                {
                    "case_id": "c1",
                    "session_id": "s1",
                    "reason": "护肤品脚本失败案例",
                    "quality_metrics": {"product": "护肤品", "persona": "敏感肌"},
                    "provenance": {"source": "api"},
                },
                {
                    "case_id": "c2",
                    "session_id": "s2",
                    "reason": "短剧结构案例",
                    "quality_metrics": {"product": "剧情号", "persona": "泛娱乐"},
                    "provenance": {"source": "manual"},
                },
            ]
            with open(path, "w", encoding="utf-8") as handle:
                for row in rows:
                    handle.write(json.dumps(row, ensure_ascii=False) + "\n")

            service = RetrievalService(vector_store=InMemoryVectorStore(), eval_cases_path=path)
            result = service.search_eval_cases("护肤品", top_k=3, filters={"source": "api"})

        self.assertEqual(result["collection"], "eval_cases")
        self.assertEqual([item["doc_id"] for item in result["items"]], ["c1"])

    def test_search_assets_should_use_existing_asset_index(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "assets.db")
            ensure_asset_db(db_path)
            execute(
                db_path,
                """
                INSERT INTO assets (
                    asset_id, uri, asset_type, tags, scene, objects, style, aspect, duration_sec
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "a1",
                    "/assets/a1.mp4",
                    "scene",
                    json.dumps(["地铁", "通勤", "耳机"], ensure_ascii=False),
                    "地铁站台",
                    "[]",
                    "真实实拍",
                    "9:16",
                    8.0,
                ),
            )
            service = RetrievalService(vector_store=InMemoryVectorStore(), asset_db_path=db_path)

            result = service.search_assets("地铁 通勤", top_k=3, db_path=db_path)

        self.assertEqual(result["collection"], "assets")
        self.assertGreaterEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["metadata"]["asset_id"], "a1")
        self.assertEqual(result["items"][0]["metadata"]["uri"], "/assets/a1.mp4")

    def test_builtin_registry_should_expose_retrieval_aliases(self):
        registry = build_builtin_registry()

        names = registry.list_tool_names()

        self.assertIn("retrieval.search_assets", names)
        self.assertIn("retrieval.search_knowledge", names)
        self.assertIn("retrieval.search_eval_cases", names)

    def test_builtin_executor_should_execute_retrieval_alias_with_injected_service(self):
        store = InMemoryVectorStore()
        indexer = RetrievalIndexer(store)
        indexer.index_documents(
            "knowledge",
            [
                RetrievalDocument(doc_id="doc-1", text="Bananaflow 的知识库支持检索", metadata={"kind": "doc"}),
            ],
        )
        service = RetrievalService(vector_store=store)
        executor = build_builtin_executor()

        result = executor.execute(
            "retrieval.search_knowledge",
            {"query": "知识库检索", "top_k": 3},
            context=AgentToolContext(extra={"retrieval_service": service}),
        )

        self.assertEqual(result["collection"], "knowledge")
        self.assertEqual(result["items"][0]["doc_id"], "doc-1")


if __name__ == "__main__":
    unittest.main()
