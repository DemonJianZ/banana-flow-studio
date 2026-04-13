const triggerDownload = (href, filename) => {
  const link = document.createElement("a");
  link.href = href;
  if (filename) link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadMedia = async (url, filename = "") => {
  const text = String(url || "").trim();
  if (!text) return;

  if (text.startsWith("data:") || text.startsWith("blob:")) {
    triggerDownload(text, filename);
    return;
  }

  let objectUrl = "";
  try {
    const resp = await fetch(text);
    if (!resp.ok) throw new Error(`download failed: HTTP ${resp.status}`);
    const blob = await resp.blob();
    objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename);
  } catch {
    triggerDownload(text, filename);
  } finally {
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }
};
