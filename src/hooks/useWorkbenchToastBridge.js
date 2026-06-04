import { useEffect } from "react";

export function useWorkbenchToastBridge({
  pasteToastRef,
  onRunToastForAgentRef,
  showRunToast,
  setRunToast,
}) {
  useEffect(() => {
    pasteToastRef.current = (toast) => {
      showRunToast(toast);
    };
    return () => {
      pasteToastRef.current = null;
    };
  }, [pasteToastRef, showRunToast]);

  useEffect(() => {
    onRunToastForAgentRef.current = (toast) => {
      setRunToast(toast);
    };
    return () => {
      onRunToastForAgentRef.current = null;
    };
  }, [onRunToastForAgentRef, setRunToast]);
}
