import { useEffect, useRef, useState } from "react";

export function useSidebar() {
  const [hoveredSidebarItemKey, setHoveredSidebarItemKey] = useState("");
  const [hoveredSidebarPreview, setHoveredSidebarPreview] = useState(null);
  const [sidebarNodeInputMenu, setSidebarNodeInputMenu] = useState(null);
  const [sidebarWorkflowMenu, setSidebarWorkflowMenu] = useState(null);
  const [sidebarImageCreateMenu, setSidebarImageCreateMenu] = useState(null);
  const [activeSidebarItemKey, setActiveSidebarItemKey] = useState("");
  const [showSidebarUploadMenu, setShowSidebarUploadMenu] = useState(false);
  const [sidebarVideoCreateMenu, setSidebarVideoCreateMenu] = useState(null);

  const sidebarUploadMenuRef = useRef(null);
  const sidebarImageUploadInputRef = useRef(null);
  const sidebarVideoUploadInputRef = useRef(null);
  const sidebarUploadMenuCloseTimerRef = useRef(null);
  const sidebarNodeInputMenuCloseTimerRef = useRef(null);
  const sidebarImageCreateMenuCloseTimerRef = useRef(null);
  const sidebarVideoCreateMenuCloseTimerRef = useRef(null);
  const sidebarWorkflowMenuCloseTimerRef = useRef(null);
  const workspaceShellRef = useRef(null);
  const isLeftSidebarCollapsed = true;
  const leftSidebarWidth = isLeftSidebarCollapsed ? 62 : 140;

  useEffect(() => {
    if (!showSidebarUploadMenu) return undefined;
    const handlePointerDown = (event) => {
      if (sidebarUploadMenuRef.current?.contains(event.target)) return;
      setShowSidebarUploadMenu(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showSidebarUploadMenu]);

  useEffect(() => () => {
    if (sidebarUploadMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarUploadMenuCloseTimerRef.current);
    }
    if (sidebarNodeInputMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarNodeInputMenuCloseTimerRef.current);
    }
    if (sidebarImageCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarImageCreateMenuCloseTimerRef.current);
    }
    if (sidebarVideoCreateMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarVideoCreateMenuCloseTimerRef.current);
    }
    if (sidebarWorkflowMenuCloseTimerRef.current) {
      window.clearTimeout(sidebarWorkflowMenuCloseTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!sidebarNodeInputMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-node-input-menu='true']")) return;
      setSidebarNodeInputMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarNodeInputMenu]);

  useEffect(() => {
    if (!sidebarImageCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-image-create-menu='true']")) return;
      setSidebarImageCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarImageCreateMenu]);

  useEffect(() => {
    if (!sidebarVideoCreateMenu) return undefined;
    const handlePointerDown = (event) => {
      if (event.target.closest("[data-sidebar-video-create-menu='true']")) return;
      setSidebarVideoCreateMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [sidebarVideoCreateMenu]);

  useEffect(() => {
    if (!sidebarWorkflowMenu) return undefined;
    const handlePointerDown = (event) => {
      if (workspaceShellRef.current?.contains(event.target)) {
        const target = event.target;
        if (target?.closest?.("[data-sidebar-workflow-menu='true']") || target?.closest?.("[data-sidebar-workflow-trigger='true']")) {
          return;
        }
      }
      setSidebarWorkflowMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [sidebarWorkflowMenu]);

  return {
    hoveredSidebarItemKey,
    setHoveredSidebarItemKey,
    hoveredSidebarPreview,
    setHoveredSidebarPreview,
    sidebarNodeInputMenu,
    setSidebarNodeInputMenu,
    sidebarWorkflowMenu,
    setSidebarWorkflowMenu,
    sidebarImageCreateMenu,
    setSidebarImageCreateMenu,
    activeSidebarItemKey,
    setActiveSidebarItemKey,
    showSidebarUploadMenu,
    setShowSidebarUploadMenu,
    sidebarVideoCreateMenu,
    setSidebarVideoCreateMenu,
    sidebarUploadMenuRef,
    sidebarImageUploadInputRef,
    sidebarVideoUploadInputRef,
    sidebarUploadMenuCloseTimerRef,
    sidebarNodeInputMenuCloseTimerRef,
    sidebarImageCreateMenuCloseTimerRef,
    sidebarVideoCreateMenuCloseTimerRef,
    sidebarWorkflowMenuCloseTimerRef,
    workspaceShellRef,
    isLeftSidebarCollapsed,
    leftSidebarWidth,
  };
}
