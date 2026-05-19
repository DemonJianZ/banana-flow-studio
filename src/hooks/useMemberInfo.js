import { useState, useCallback, useEffect, useMemo } from "react";
import { isLoginRequiredError } from "../api/aiChat";
import { viewMemberInfo } from "../api/memberInfo";
import { viewUserAuths } from "../api/userAuths";

// --------------- pure utilities ---------------

const resolveMemberRecord = (response) => {
  const visited = new Set();
  const queue = [response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current) || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const hasMemberFields =
      current.name ||
      current.nickname ||
      current.nick_name ||
      current.real_name ||
      current.user_name ||
      current.username ||
      current.member_name ||
      current.avatar ||
      current.avatar_url ||
      current.head_img ||
      current.headimgurl ||
      current.photo ||
      current.point !== undefined ||
      current.total_point !== undefined ||
      current.totalPoint !== undefined;

    if (hasMemberFields) return current;

    if (current.data && typeof current.data === "object") queue.push(current.data);
    if (current.user && typeof current.user === "object") queue.push(current.user);
    if (current.member && typeof current.member === "object") queue.push(current.member);
    if (current.info && typeof current.info === "object") queue.push(current.info);
  }

  return null;
};

const resolveMemberDisplayName = (response) => {
  const pickValue = (record) => {
    if (typeof record === "string") return record.trim();
    if (!record || typeof record !== "object") return "";
    const value =
      record.name ||
      record.nickname ||
      record.nick_name ||
      record.real_name ||
      record.user_name ||
      record.username ||
      record.member_name ||
      record.email ||
      record.mobile ||
      record.phone;
    return String(value || "").trim();
  };

  const directValue = pickValue(resolveMemberRecord(response));
  if (directValue) return directValue;

  const visited = new Set();
  const queue = [response];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || Array.isArray(current) || visited.has(current)) {
      continue;
    }
    visited.add(current);

    const value = pickValue(current);
    if (value) return value;

    if (current.data && typeof current.data === "object") queue.push(current.data);
    if (current.user && typeof current.user === "object") queue.push(current.user);
    if (current.member && typeof current.member === "object") queue.push(current.member);
    if (current.info && typeof current.info === "object") queue.push(current.info);
  }

  return "";
};

const resolveMemberAvatar = (response) => {
  const record = resolveMemberRecord(response);
  const value = record?.avatar || record?.avatar_url || record?.head_img || record?.headimgurl || record?.photo;
  return typeof value === "string" ? value.trim() : "";
};

const resolveMemberPoints = (response, fieldNames) => {
  const record = resolveMemberRecord(response);
  if (!record) return null;

  for (const fieldName of fieldNames) {
    const value = record[fieldName];
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
};

const resolveAdminFlagFromUserAuths = (payload) => {
  if (!payload || typeof payload !== "object") return false;
  const queue = [payload];
  const visited = new Set();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (typeof current.is_ok === "boolean") return current.is_ok;
    if (typeof current.isOk === "boolean") return current.isOk;
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  return false;
};

export const formatMemberPoints = (value) => {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN").format(value);
};

// --------------- hook ---------------

export function useMemberInfo(
  apiFetch,
  userEmail = "",
  { updateApiDebugStatus, pushApiDebugDetail, setRunToast } = {},
) {
  const [memberInfo, setMemberInfo] = useState(null);
  const [memberInfoLoading, setMemberInfoLoading] = useState(true);
  const [memberInfoLoginUrl, setMemberInfoLoginUrl] = useState("");
  const [userAuths, setUserAuths] = useState(null);
  const [userAuthsLoading, setUserAuthsLoading] = useState(true);

  const navigateToMemberLogin = useCallback((loginUrl = "") => {
    try {
      const microLogout = window.microApp?.getData?.()?.logout;
      if (typeof microLogout === "function") {
        microLogout();
        return;
      }
    } catch (error) {
      console.warn("[memberInfo] microApp logout failed", error);
    }
    const targetUrl = String(loginUrl || "").trim();
    if (targetUrl) window.open(targetUrl, "_blank", "noopener,noreferrer");
  }, []);

  const memberLabel = useMemo(() => {
    if (memberInfoLoading) return "加载中";
    return resolveMemberDisplayName(memberInfo) || userEmail || "Guest";
  }, [memberInfo, memberInfoLoading, userEmail]);

  const memberAvatar = useMemo(() => resolveMemberAvatar(memberInfo), [memberInfo]);
  const memberPoint = useMemo(() => resolveMemberPoints(memberInfo, ["point"]), [memberInfo]);
  const memberTotalPoint = useMemo(
    () => resolveMemberPoints(memberInfo, ["total_point", "totalPoint"]),
    [memberInfo],
  );
  const isAdminUser = useMemo(() => resolveAdminFlagFromUserAuths(userAuths), [userAuths]);

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    let timeoutId = 0;
    let activeController = null;

    const loadMemberInfo = async (attempt = 0) => {
      const requestController = new AbortController();
      activeController = requestController;
      let didTimeout = false;

      if (attempt === 0) setMemberInfoLoading(true);
      if (attempt === 0) updateApiDebugStatus?.("memberInfo", { status: "loading", message: "POST /ai/viewMemberInfo" });
      console.info("[memberInfo] load:attempt", { attempt });
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        didTimeout = true;
        updateApiDebugStatus?.("memberInfo", { status: "timeout", message: "请求超时(10s)" });
        console.warn("[memberInfo] load:timeout", { attempt });
        requestController.abort(new DOMException("viewMemberInfo timeout", "AbortError"));
      }, 10000);

      try {
        const data = await viewMemberInfo(apiFetch, {}, {
          signal: requestController.signal,
          onDebug: (event) => pushApiDebugDetail?.("memberInfo", event),
        });
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        console.info("[memberInfo] load:done", { attempt, data });
        setMemberInfoLoginUrl("");
        setMemberInfo(data);
        setMemberInfoLoading(false);
        updateApiDebugStatus?.("memberInfo", { status: "success", message: "获取成功" });
      } catch (error) {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (cancelled) return;
        if (requestController.signal.aborted && !didTimeout) return;
        console.error("[memberInfo] load:failed", {
          attempt,
          didTimeout,
          message: error instanceof Error ? error.message : String(error),
        });
        const ssoUrl = 'http://test.dayukeji-inc.cn/aigc_test/#/dashboard';
        const isLoginRequired = isLoginRequiredError(error);
        if (ssoUrl) {
          setMemberInfoLoginUrl(ssoUrl);
        }
        if (didTimeout || isLoginRequired) {
          if (isLoginRequired) {
            updateApiDebugStatus?.("memberInfo", { status: "login_required", message: error?.message || "请登录后再操作" });
          }
          setMemberInfo(null);
          setMemberInfoLoading(false);
          if (isLoginRequired && ssoUrl) {
            navigateToMemberLogin(ssoUrl);
            setRunToast?.({
              type: "error",
              message: "会员服务未登录，请先完成 SSO 登录。",
              actionLabel: "前往登录",
              onAction: () => navigateToMemberLogin(ssoUrl),
            });
          }
          return;
        }
        updateApiDebugStatus?.("memberInfo", { status: "error", message: error instanceof Error ? error.message : String(error) });
        if (attempt < 2) {
          timerId = window.setTimeout(() => { loadMemberInfo(attempt + 1); }, 400 * (attempt + 1));
          return;
        }
        setMemberInfo(null);
        setMemberInfoLoading(false);
      }
    };

    loadMemberInfo();
    return () => {
      cancelled = true;
      activeController?.abort();
      if (timerId) window.clearTimeout(timerId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [apiFetch, navigateToMemberLogin, pushApiDebugDetail, updateApiDebugStatus, setRunToast]);

  useEffect(() => {
    let cancelled = false;
    let timerId = 0;
    let timeoutId = 0;
    let activeController = null;

    const loadUserAuths = async (attempt = 0) => {
      const requestController = new AbortController();
      activeController = requestController;
      let didTimeout = false;

      if (attempt === 0) setUserAuthsLoading(true);
      if (attempt === 0) updateApiDebugStatus?.("userAuths", { status: "loading", message: "POST /user/auths" });
      console.info("[userAuths] load:attempt", { attempt });
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        didTimeout = true;
        updateApiDebugStatus?.("userAuths", { status: "timeout", message: "请求超时(10s)" });
        console.warn("[userAuths] load:timeout", { attempt });
        requestController.abort(new DOMException("viewUserAuths timeout", "AbortError"));
      }, 10000);

      try {
        const data = await viewUserAuths(apiFetch, {}, {
          signal: requestController.signal,
          onDebug: (event) => pushApiDebugDetail?.("userAuths", event),
        });
        if (cancelled) return;
        if (timeoutId) window.clearTimeout(timeoutId);
        console.info("[userAuths] load:done", { attempt, data, isAdmin: resolveAdminFlagFromUserAuths(data) });
        setUserAuths(data);
        setUserAuthsLoading(false);
        updateApiDebugStatus?.("userAuths", {
          status: "success",
          message: resolveAdminFlagFromUserAuths(data) ? "admin" : "loaded",
        });
      } catch (error) {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (cancelled) return;
        if (requestController.signal.aborted && !didTimeout) return;
        console.error("[userAuths] load:failed", {
          attempt,
          didTimeout,
          message: error instanceof Error ? error.message : String(error),
        });
        const isLoginRequired = isLoginRequiredError(error);
        if (didTimeout || isLoginRequired) {
          if (isLoginRequired) {
            updateApiDebugStatus?.("userAuths", { status: "login_required", message: error?.message || "请登录后再操作" });
          }
          setUserAuths(null);
          setUserAuthsLoading(false);
          return;
        }
        updateApiDebugStatus?.("userAuths", { status: "error", message: error instanceof Error ? error.message : String(error) });
        if (attempt < 2) {
          timerId = window.setTimeout(() => { loadUserAuths(attempt + 1); }, 400 * (attempt + 1));
          return;
        }
        setUserAuths(null);
        setUserAuthsLoading(false);
      }
    };

    loadUserAuths();
    return () => {
      cancelled = true;
      activeController?.abort();
      if (timerId) window.clearTimeout(timerId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [apiFetch, pushApiDebugDetail, updateApiDebugStatus]);

  return {
    memberInfo,
    setMemberInfo,
    memberInfoLoading,
    memberInfoLoginUrl,
    userAuths,
    userAuthsLoading,
    navigateToMemberLogin,
    memberLabel,
    memberAvatar,
    memberPoint,
    memberTotalPoint,
    isAdminUser,
  };
}
