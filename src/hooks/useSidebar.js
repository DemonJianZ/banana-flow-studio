import { useState, useRef } from "react";

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
  };
}
