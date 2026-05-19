import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { createEmptyAssetLibraryStore, saveAssetLibraryDbStore, migrateAssetLibraryLocalStorage } from "../lib/assetLibraryDb";
import { isImageFileLike, readFilesAsDataUrls, EMPTY_LIST } from "../constants/workbench.jsx";
import { isVideoContent } from "../lib/mediaType.js";

const generateId = () => Math.random().toString(36).slice(2, 11);
const ASSET_LIBRARY_STORE_KEY = "bananaflow_asset_library_v1";

export const cloneAssetLibrarySnapshot = (value) => {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return { nodes: [], connections: [], viewport: { x: 0, y: 0, zoom: 1 } };
  }
};

export const getSnapshotMediaItems = (snapshot) => {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const items = [];
  nodes.forEach((node) => {
    const mediaGroups = [
      ...(Array.isArray(node?.data?.images) ? node.data.images : []),
      ...(Array.isArray(node?.data?.uploadedImages) ? node.data.uploadedImages : []),
    ];
    mediaGroups
      .map((url) => String(url || "").trim())
      .filter(Boolean)
      .forEach((url, index) => {
        items.push({
          id: `${node?.id || "node"}_${index}`,
          url,
          kind: isVideoContent(url) ? "video" : "image",
          nodeId: String(node?.id || ""),
          nodeType: String(node?.type || ""),
          nodeTitle: String(node?.data?.title || "").trim(),
        });
      });
  });
  return items;
};

export const getAssetLibraryAssetKey = (url, kind) => `${String(kind || "image").trim()}:${String(url || "").trim()}`;

export const buildSnapshotDigest = (snapshot) => {
  const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const connections = Array.isArray(snapshot?.connections) ? snapshot.connections : [];
  const mediaItems = getSnapshotMediaItems(snapshot);
  const images = mediaItems.filter((item) => item.kind === "image").length;
  const videos = mediaItems.filter((item) => item.kind === "video").length;
  const firstTextNode = nodes.find((node) => node?.type === "text_input" && String(node?.data?.text || "").trim());
  const firstPromptNode = nodes.find((node) => String(node?.data?.prompt || "").trim());
  const titleSource =
    String(firstTextNode?.data?.text || "").trim() ||
    String(firstPromptNode?.data?.prompt || "").trim() ||
    String(nodes[0]?.data?.title || "").trim();
  const title = titleSource ? titleSource.slice(0, 20) : "未命名作品";
  const summaryParts = [
    `${nodes.length} 个节点`,
    `${connections.length} 条连线`,
  ];
  if (images > 0) summaryParts.push(`${images} 张图片`);
  if (videos > 0) summaryParts.push(`${videos} 个视频`);
  return {
    title,
    coverUrl: mediaItems[0]?.url || "",
    mediaItems,
    summary: summaryParts.join(" · "),
    assetCount: mediaItems.length,
    nodeCount: nodes.length,
    connectionCount: connections.length,
  };
};

export const normalizeAssetLibraryItem = (item) => ({
  id: String(item?.id || "").trim(),
  kind: String(item?.kind || "draft").trim() || "draft",
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  summary: String(item?.summary || "").trim(),
  coverUrl: String(item?.coverUrl || item?.cover_url || "").trim(),
  assetCount: Number(item?.assetCount ?? item?.asset_count ?? 0) || 0,
  nodeCount: Number(item?.nodeCount ?? item?.node_count ?? 0) || 0,
  connectionCount: Number(item?.connectionCount ?? item?.connection_count ?? 0) || 0,
  snapshot: item?.snapshot && typeof item.snapshot === "object" ? item.snapshot : { nodes: [], connections: [], viewport: {} },
  createdAt: String(item?.createdAt || item?.created_at || "").trim(),
  updatedAt: String(item?.updatedAt || item?.updated_at || "").trim(),
});

export const normalizeAssetLibraryWork = (item) => ({
  ...normalizeAssetLibraryItem(item),
  latestVersionId: String(item?.latestVersionId || item?.latest_version_id || "").trim(),
  versionCount: Number(item?.versionCount ?? item?.version_count ?? 0) || 0,
});

export const normalizeAssetLibraryWorkVersion = (item) => ({
  id: String(item?.id || "").trim(),
  workId: String(item?.workId || item?.work_id || "").trim(),
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  summary: String(item?.summary || "").trim(),
  coverUrl: String(item?.coverUrl || item?.cover_url || "").trim(),
  assetCount: Number(item?.assetCount ?? item?.asset_count ?? 0) || 0,
  nodeCount: Number(item?.nodeCount ?? item?.node_count ?? 0) || 0,
  connectionCount: Number(item?.connectionCount ?? item?.connection_count ?? 0) || 0,
  versionIndex: Number(item?.versionIndex ?? item?.version_index ?? 0) || 0,
  snapshot: item?.snapshot && typeof item.snapshot === "object" ? item.snapshot : { nodes: [], connections: [], viewport: {} },
  createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || 0,
});

export const normalizeAssetLibraryAsset = (item) => ({
  id: String(item?.id || "").trim(),
  url: String(item?.url || "").trim(),
  kind: String(item?.kind || "image").trim() || "image",
  nodeId: String(item?.nodeId || item?.node_id || "").trim(),
  nodeType: String(item?.nodeType || item?.node_type || "").trim(),
  nodeTitle: String(item?.nodeTitle || item?.node_title || "").trim(),
  sourceKind: String(item?.sourceKind || item?.source_kind || "snapshot").trim() || "snapshot",
  workId: String(item?.workId || item?.work_id || "").trim(),
  versionId: String(item?.versionId || item?.version_id || "").trim(),
  canvasId: String(item?.canvasId || item?.canvas_id || "").trim(),
  title: String(item?.title || "").trim(),
  createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || 0,
  updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0) || 0,
  lastUsedAt: Number(item?.lastUsedAt ?? item?.last_used_at ?? 0) || 0,
  usageCount: Number(item?.usageCount ?? item?.usage_count ?? 0) || 0,
});

export const normalizeAssetLibraryPersona = (item) => {
  const now = Date.now();
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.name || item?.title || "").trim(),
    description: String(item?.description || item?.summary || "").trim(),
    referenceImage: String(item?.referenceImage || item?.reference_image || item?.coverUrl || item?.cover_url || "").trim(),
    voiceDescription: String(item?.voiceDescription || item?.voice_description || "").trim(),
    relationshipNetwork: String(item?.relationshipNetwork || item?.relationship_network || "").trim(),
    createdAt: Number(item?.createdAt ?? item?.created_at ?? 0) || now,
    updatedAt: Number(item?.updatedAt ?? item?.updated_at ?? 0) || now,
  };
};

export const buildPersonaInputNodeText = (persona) => {
  const name = String(persona?.name || "").trim();
  const description = String(persona?.description || "").trim();
  const voiceDescription = String(persona?.voiceDescription || "").trim();
  const relationshipNetwork = String(persona?.relationshipNetwork || "").trim();
  const parts = [];
  if (name) parts.push(`人物名称：${name}`);
  if (description) parts.push(`人物设定：${description}`);
  if (voiceDescription) parts.push(`音色描述：${voiceDescription}`);
  if (relationshipNetwork) parts.push(`关系网络：${relationshipNetwork}`);
  return parts.join("\n");
};

export const buildAssetLibraryAssetsFromSnapshot = (snapshot, meta = {}) => {
  const timestamp = Number(meta?.createdAt ?? Date.now()) || Date.now();
  return getSnapshotMediaItems(snapshot).map((item) => ({
    id: `asset_${generateId()}`,
    url: item.url,
    kind: item.kind,
    nodeId: item.nodeId,
    nodeType: item.nodeType,
    nodeTitle: item.nodeTitle,
    sourceKind: String(meta?.sourceKind || "snapshot"),
    workId: String(meta?.workId || ""),
    versionId: String(meta?.versionId || ""),
    canvasId: String(meta?.canvasId || ""),
    title: item.nodeTitle || (item.kind === "video" ? "视频资产" : "图片资产"),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: timestamp,
    usageCount: 1,
  }));
};

export const mergeAssetLibraryAssets = (existingAssets, incomingAssets) => {
  const nextMap = new Map();
  (Array.isArray(existingAssets) ? existingAssets : []).forEach((item) => {
    const normalized = normalizeAssetLibraryAsset(item);
    if (!normalized.url) return;
    nextMap.set(getAssetLibraryAssetKey(normalized.url, normalized.kind), normalized);
  });
  (Array.isArray(incomingAssets) ? incomingAssets : []).forEach((item) => {
    const normalized = normalizeAssetLibraryAsset(item);
    if (!normalized.url) return;
    const key = getAssetLibraryAssetKey(normalized.url, normalized.kind);
    const existing = nextMap.get(key);
    nextMap.set(key, existing
      ? {
          ...existing,
          nodeId: normalized.nodeId || existing.nodeId,
          nodeType: normalized.nodeType || existing.nodeType,
          nodeTitle: normalized.nodeTitle || existing.nodeTitle,
          sourceKind: normalized.sourceKind || existing.sourceKind,
          workId: normalized.workId || existing.workId,
          versionId: normalized.versionId || existing.versionId,
          canvasId: normalized.canvasId || existing.canvasId,
          title: normalized.title || existing.title,
          updatedAt: Math.max(existing.updatedAt || 0, normalized.updatedAt || 0),
          lastUsedAt: Math.max(existing.lastUsedAt || 0, normalized.lastUsedAt || 0),
          usageCount: (Number(existing.usageCount || 0) || 0) + (Number(normalized.usageCount || 0) || 1),
        }
      : normalized);
  });
  return Array.from(nextMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 300);
};

export const normalizeAssetLibraryStore = (store) => {
  const drafts = Array.isArray(store?.drafts) ? store.drafts.map(normalizeAssetLibraryItem) : [];
  const rawWorks = Array.isArray(store?.works) ? store.works : [];
  let works = rawWorks.map(normalizeAssetLibraryWork);
  let workVersions = Array.isArray(store?.workVersions) ? store.workVersions.map(normalizeAssetLibraryWorkVersion) : [];
  let assets = Array.isArray(store?.assets) ? store.assets.map(normalizeAssetLibraryAsset) : [];
  let personas = Array.isArray(store?.personas) ? store.personas.map(normalizeAssetLibraryPersona) : [];

  if (workVersions.length === 0) {
    const generatedVersions = [];
    works = works.map((work) => {
      const hasSnapshot = work?.snapshot && typeof work.snapshot === "object";
      if (!hasSnapshot) return work;
      const versionId = `legacy_version_${work.id || generateId()}`;
      const createdAt = Number(work.createdAt || work.updatedAt || Date.now()) || Date.now();
      generatedVersions.push({
        id: versionId,
        workId: work.id,
        canvasId: work.canvasId,
        title: work.title,
        summary: work.summary,
        coverUrl: work.coverUrl,
        assetCount: work.assetCount,
        nodeCount: work.nodeCount,
        connectionCount: work.connectionCount,
        versionIndex: 1,
        snapshot: cloneAssetLibrarySnapshot(work.snapshot),
        createdAt,
      });
      return {
        ...work,
        latestVersionId: versionId,
        versionCount: 1,
      };
    });
    workVersions = generatedVersions;
  }

  if (assets.length === 0) {
    const generatedAssets = [];
    workVersions.forEach((version) => {
      generatedAssets.push(
        ...buildAssetLibraryAssetsFromSnapshot(version.snapshot, {
          sourceKind: "work_version",
          workId: version.workId,
          versionId: version.id,
          canvasId: version.canvasId,
          createdAt: version.createdAt,
        }),
      );
    });
    drafts.forEach((draft) => {
      generatedAssets.push(
        ...buildAssetLibraryAssetsFromSnapshot(draft.snapshot, {
          sourceKind: "draft",
          canvasId: draft.canvasId,
          createdAt: Number(draft.updatedAt || draft.createdAt || Date.now()) || Date.now(),
        }),
      );
    });
    assets = mergeAssetLibraryAssets([], generatedAssets);
  } else {
    assets = mergeAssetLibraryAssets([], assets);
  }

  const versionCountByWorkId = new Map();
  workVersions.forEach((version) => {
    if (!version.workId) return;
    versionCountByWorkId.set(version.workId, (versionCountByWorkId.get(version.workId) || 0) + 1);
  });
  works = works.map((work) => ({
    ...work,
    versionCount: work.versionCount || versionCountByWorkId.get(work.id) || 0,
  }));
  personas = personas
    .filter((item) => item.id)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  return {
    drafts,
    works,
    workVersions: workVersions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    assets,
    personas,
  };
};

export const loadAssetLibraryStore = () => {
  try {
    const text = localStorage.getItem(ASSET_LIBRARY_STORE_KEY);
    if (!text) return createEmptyAssetLibraryStore();
    return normalizeAssetLibraryStore(JSON.parse(text));
  } catch {
    return createEmptyAssetLibraryStore();
  }
};

export const saveAssetLibraryStore = (store, preferredCanvasId = "") => {
  try {
    const normalized = normalizeAssetLibraryStore(store);
    const drafts = Array.isArray(normalized?.drafts) ? normalized.drafts : [];
    const preferredDraft = preferredCanvasId
      ? drafts.find((item) => item?.canvasId === preferredCanvasId) || null
      : null;
    const fallbackDraft = preferredDraft || drafts[0] || null;
    const compactStore = {
      drafts: fallbackDraft ? [fallbackDraft] : [],
      works: [],
      workVersions: [],
      assets: [],
      personas: [],
    };
    localStorage.setItem(ASSET_LIBRARY_STORE_KEY, JSON.stringify(compactStore));
  } catch (error) {
    console.warn("[Workbench] asset_library_localstorage_save_skipped", error);
  }
};

export function useAssetLibrary(canvasId) {
  const [assetLibraryStore, setAssetLibraryStore] = useState(() => loadAssetLibraryStore());
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [assetLibraryTab, setAssetLibraryTab] = useState("works");
  const [assetLibraryLoaded, setAssetLibraryLoaded] = useState(false);
  const [expandedAssetWorkIds, setExpandedAssetWorkIds] = useState(new Set());
  const [assetLibraryDetailWorkId, setAssetLibraryDetailWorkId] = useState("");
  const [assetLibraryDetailPersonaId, setAssetLibraryDetailPersonaId] = useState("");
  const [editingAssetWorkTitleId, setEditingAssetWorkTitleId] = useState("");
  const [editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft] = useState("");
  const [pendingUploadNodeId, setPendingUploadNodeId] = useState("");
  const [assetLibraryPickerMode, setAssetLibraryPickerMode] = useState(false);

  const assetLibraryPersonaImageInputRef = useRef(null);
  const assetLibraryRestoredRef = useRef(false);

  const assetLibraryDrafts = useMemo(() => assetLibraryStore?.drafts || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryWorks = useMemo(() => assetLibraryStore?.works || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryWorkVersions = useMemo(() => assetLibraryStore?.workVersions || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryAssets = useMemo(() => assetLibraryStore?.assets || EMPTY_LIST, [assetLibraryStore]);
  const assetLibraryPersonas = useMemo(() => assetLibraryStore?.personas || EMPTY_LIST, [assetLibraryStore]);
  const personaMentionOptions = useMemo(
    () => (assetLibraryPersonas || []).filter((item) => String(item?.name || "").trim()),
    [assetLibraryPersonas],
  );
  const assetLibraryVersionsByWorkId = useMemo(() => {
    const next = new Map();
    assetLibraryWorkVersions.forEach((item) => {
      if (!item?.workId) return;
      if (!next.has(item.workId)) next.set(item.workId, []);
      next.get(item.workId).push(item);
    });
    next.forEach((list) => list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    return next;
  }, [assetLibraryWorkVersions]);
  const assetLibraryAssetsByWorkId = useMemo(() => {
    const next = new Map();
    assetLibraryAssets.forEach((item) => {
      if (!item?.workId) return;
      if (!next.has(item.workId)) next.set(item.workId, []);
      next.get(item.workId).push(item);
    });
    next.forEach((list) => list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
    return next;
  }, [assetLibraryAssets]);
  const activeCanvasDraft = useMemo(
    () => assetLibraryDrafts.find((item) => item.canvasId === canvasId) || null,
    [assetLibraryDrafts, canvasId],
  );
  const upsertCanvasDraftSnapshot = useCallback((snapshotInput) => {
    const snapshot = cloneAssetLibrarySnapshot(snapshotInput);
    const digest = buildSnapshotDigest(snapshot);
    const now = Date.now();
    const draftRecord = {
      id: `draft_${canvasId}`,
      canvasId,
      title: digest.title,
      summary: digest.summary,
      coverUrl: digest.coverUrl,
      assetCount: digest.assetCount,
      nodeCount: digest.nodeCount,
      connectionCount: digest.connectionCount,
      updatedAt: now,
      snapshot,
    };
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      const draftsNext = [draftRecord, ...((current.drafts || []).filter((item) => item.canvasId !== canvasId))].slice(0, 12);
      const nonDraftAssets = (current.assets || []).filter(
        (item) => !(item.sourceKind === "draft" && item.canvasId === canvasId),
      );
      const draftAssets = buildAssetLibraryAssetsFromSnapshot(snapshot, {
        sourceKind: "draft",
        canvasId,
        createdAt: now,
      });
      const nextStore = {
        ...current,
        drafts: draftsNext,
        assets: mergeAssetLibraryAssets(nonDraftAssets, draftAssets),
      };
      saveAssetLibraryStore(nextStore, canvasId);
      void saveAssetLibraryDbStore(nextStore).catch((error) => {
        console.error("[Workbench] asset_library_indexeddb_save:error", error);
      });
      return nextStore;
    });
  }, [canvasId]);
  const assetLibraryDetailWork = useMemo(
    () => assetLibraryWorks.find((item) => item.id === assetLibraryDetailWorkId) || null,
    [assetLibraryWorks, assetLibraryDetailWorkId],
  );
  const assetLibraryDetailPersona = useMemo(
    () => assetLibraryPersonas.find((item) => item.id === assetLibraryDetailPersonaId) || null,
    [assetLibraryPersonas, assetLibraryDetailPersonaId],
  );
  const assetLibraryDetailVersions = useMemo(
    () => (assetLibraryDetailWork ? assetLibraryVersionsByWorkId.get(assetLibraryDetailWork.id) || EMPTY_LIST : EMPTY_LIST),
    [assetLibraryDetailWork, assetLibraryVersionsByWorkId],
  );
  const assetLibraryDetailLatestVersion = assetLibraryDetailVersions[0] || null;
  const assetLibraryDetailSnapshot = assetLibraryDetailLatestVersion?.snapshot || assetLibraryDetailWork?.snapshot || null;
  const assetLibraryDetailDigest = useMemo(
    () => (assetLibraryDetailSnapshot ? buildSnapshotDigest(assetLibraryDetailSnapshot) : null),
    [assetLibraryDetailSnapshot],
  );
  const assetLibraryDetailAssets = useMemo(() => {
    if (!assetLibraryDetailWork) return EMPTY_LIST;
    const linkedAssets = assetLibraryAssetsByWorkId.get(assetLibraryDetailWork.id) || EMPTY_LIST;
    if (linkedAssets.length > 0) return linkedAssets;
    return Array.isArray(assetLibraryDetailDigest?.mediaItems)
      ? assetLibraryDetailDigest.mediaItems.map((item, index) => ({
          id: `detail_fallback_${assetLibraryDetailWork.id}_${index}`,
          url: item.url,
          kind: item.kind,
          title: item.nodeTitle || (item.kind === "video" ? "视频素材" : "图片素材"),
          nodeTitle: item.nodeTitle,
          updatedAt: assetLibraryDetailWork.updatedAt || assetLibraryDetailWork.createdAt || Date.now(),
          createdAt: assetLibraryDetailWork.createdAt || assetLibraryDetailWork.updatedAt || Date.now(),
          usageCount: 1,
        }))
      : EMPTY_LIST;
  }, [assetLibraryAssetsByWorkId, assetLibraryDetailDigest, assetLibraryDetailWork]);

  useEffect(() => {
    if (assetLibraryDetailWorkId && !assetLibraryDetailWork) {
      setAssetLibraryDetailWorkId("");
    }
  }, [assetLibraryDetailWork, assetLibraryDetailWorkId]);

  useEffect(() => {
    if (assetLibraryDetailPersonaId && !assetLibraryDetailPersona) {
      setAssetLibraryDetailPersonaId("");
    }
  }, [assetLibraryDetailPersona, assetLibraryDetailPersonaId]);

  useEffect(() => {
    let cancelled = false;
    setAssetLibraryLoaded(false);
    migrateAssetLibraryLocalStorage(loadAssetLibraryStore)
      .then((store) => {
        if (cancelled) return;
        setAssetLibraryStore(normalizeAssetLibraryStore(store));
        setAssetLibraryLoaded(true);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[Workbench] asset_library_indexeddb_load:error", error);
        setAssetLibraryStore(normalizeAssetLibraryStore(loadAssetLibraryStore()));
        setAssetLibraryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assetLibraryLoaded) return;
    saveAssetLibraryStore(assetLibraryStore, canvasId);
    void saveAssetLibraryDbStore(assetLibraryStore).catch((error) => {
      console.error("[Workbench] asset_library_indexeddb_save:error", error);
    });
  }, [assetLibraryLoaded, assetLibraryStore, canvasId]);

  const beginEditAssetWorkTitle = useCallback((work) => {
    const workId = String(work?.id || "").trim();
    if (!workId) return;
    setEditingAssetWorkTitleId(workId);
    setEditingAssetWorkTitleDraft(String(work?.title || "").trim() || "未命名作品");
  }, []);

  const cancelEditAssetWorkTitle = useCallback(() => {
    setEditingAssetWorkTitleId("");
    setEditingAssetWorkTitleDraft("");
  }, []);

  const commitEditAssetWorkTitle = useCallback((workId) => {
    const normalizedWorkId = String(workId || editingAssetWorkTitleId || "").trim();
    if (!normalizedWorkId) return;
    const nextTitle = String(editingAssetWorkTitleDraft || "").trim() || "未命名作品";
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        works: (current.works || []).map((item) =>
          item.id === normalizedWorkId
            ? {
                ...item,
                title: nextTitle,
                updatedAt: Date.now(),
              }
            : item,
        ),
      };
    });
    setEditingAssetWorkTitleId("");
    setEditingAssetWorkTitleDraft("");
  }, [editingAssetWorkTitleDraft, editingAssetWorkTitleId]);

  const createAssetLibraryPersona = useCallback(() => {
    const now = Date.now();
    const persona = {
      id: `persona_${generateId()}`,
      name: "未命名人物",
      description: "点击进入详情编辑人物介绍",
      referenceImage: "",
      voiceDescription: "",
      relationshipNetwork: "",
      createdAt: now,
      updatedAt: now,
    };
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: [persona, ...(current.personas || [])].slice(0, 100),
      };
    });
    setAssetLibraryTab("personas");
    setAssetLibraryDetailWorkId("");
    setAssetLibraryDetailPersonaId(persona.id);
  }, []);

  const updateAssetLibraryPersona = useCallback((personaId, patch) => {
    const normalizedPersonaId = String(personaId || "").trim();
    if (!normalizedPersonaId || !patch || typeof patch !== "object") return;
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: (current.personas || []).map((item) =>
          item.id === normalizedPersonaId
            ? normalizeAssetLibraryPersona({
                ...item,
                ...patch,
                updatedAt: Date.now(),
              })
            : item,
        ),
      };
    });
  }, []);

  const removeAssetLibraryPersona = useCallback((personaId) => {
    const normalizedPersonaId = String(personaId || "").trim();
    if (!normalizedPersonaId) return;
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      return {
        ...current,
        personas: (current.personas || []).filter((item) => item.id !== normalizedPersonaId),
      };
    });
    setAssetLibraryDetailPersonaId("");
  }, []);

  const handleAssetLibraryPersonaReferenceUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []).filter((file) => isImageFileLike(file));
      if (!files.length) {
        event.target.value = "";
        return;
      }
      try {
        const [referenceImage] = await readFilesAsDataUrls(files.slice(0, 1));
        if (referenceImage && assetLibraryDetailPersonaId) {
          updateAssetLibraryPersona(assetLibraryDetailPersonaId, { referenceImage });
        }
      } finally {
        event.target.value = "";
      }
    },
    [assetLibraryDetailPersonaId, updateAssetLibraryPersona],
  );

  const removeAssetLibraryItem = useCallback((kind, id) => {
    setAssetLibraryStore((prev) => {
      const current = normalizeAssetLibraryStore(prev);
      if (kind === "works") {
        return {
          ...current,
          works: (current.works || []).filter((item) => item.id !== id),
          workVersions: (current.workVersions || []).filter((item) => item.workId !== id),
        };
      }
      return {
        ...current,
        [kind]: (current?.[kind] || []).filter((item) => item.id !== id),
      };
    });
  }, []);

  return {
    assetLibraryStore, setAssetLibraryStore,
    showAssetLibrary, setShowAssetLibrary,
    assetLibraryTab, setAssetLibraryTab,
    assetLibraryLoaded, setAssetLibraryLoaded,
    expandedAssetWorkIds, setExpandedAssetWorkIds,
    assetLibraryDetailWorkId, setAssetLibraryDetailWorkId,
    assetLibraryDetailPersonaId, setAssetLibraryDetailPersonaId,
    editingAssetWorkTitleId, setEditingAssetWorkTitleId,
    editingAssetWorkTitleDraft, setEditingAssetWorkTitleDraft,
    pendingUploadNodeId, setPendingUploadNodeId,
    assetLibraryPickerMode, setAssetLibraryPickerMode,
    assetLibraryPersonaImageInputRef,
    assetLibraryRestoredRef,
    assetLibraryDrafts, assetLibraryWorks, assetLibraryWorkVersions,
    assetLibraryAssets, assetLibraryPersonas, personaMentionOptions,
    assetLibraryVersionsByWorkId, assetLibraryAssetsByWorkId,
    activeCanvasDraft, upsertCanvasDraftSnapshot,
    assetLibraryDetailWork, assetLibraryDetailPersona,
    assetLibraryDetailVersions, assetLibraryDetailLatestVersion,
    assetLibraryDetailSnapshot, assetLibraryDetailDigest, assetLibraryDetailAssets,
    beginEditAssetWorkTitle, cancelEditAssetWorkTitle, commitEditAssetWorkTitle,
    createAssetLibraryPersona, updateAssetLibraryPersona, removeAssetLibraryPersona,
    handleAssetLibraryPersonaReferenceUpload, removeAssetLibraryItem,
  };
}
