const DEFAULT_PHOTOGRAPHER_DASHBOARD_URL = "http://test.dayukeji-inc.cn/aigc_test/#/dashboard?app=photographer";

const getHashQueryParams = (hash) => {
  const safeHash = String(hash || "");
  const queryIndex = safeHash.indexOf("?");
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(safeHash.slice(queryIndex + 1));
};

export const getPhotographerToolFromLocation = (location = window.location) => {
  const searchParams = new URLSearchParams(String(location?.search || ""));
  const searchTool = searchParams.get("tool");
  if (searchTool) return searchTool;
  return getHashQueryParams(location?.hash).get("tool") || "";
};

export const buildPhotographerDashboardUrl = ({ tool = "" } = {}) => {
  try {
    const currentUrl = new URL(window.location.href);
    const currentHash = String(currentUrl.hash || "");
    if (currentHash.startsWith("#/dashboard")) {
      const queryIndex = currentHash.indexOf("?");
      const hashPath = queryIndex === -1 ? currentHash.slice(1) : currentHash.slice(1, queryIndex);
      const hashParams = getHashQueryParams(currentHash);
      hashParams.set("app", "photographer");
      if (tool) {
        hashParams.set("tool", tool);
      } else {
        hashParams.delete("tool");
      }
      const nextQuery = hashParams.toString();
      return `${currentUrl.origin}${currentUrl.pathname}#${hashPath}${nextQuery ? `?${nextQuery}` : ""}`;
    }
  } catch {}

  return `${DEFAULT_PHOTOGRAPHER_DASHBOARD_URL}${tool ? `&tool=${encodeURIComponent(tool)}` : ""}`;
};
