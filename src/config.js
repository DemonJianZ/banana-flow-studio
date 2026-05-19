const envText = (value) => String(value ?? "").trim();

export const API_BASE =
  envText(import.meta.env.VITE_API_BASE) || "http://localhost:8082";

export const MEMBER_API_BASE =
  envText(import.meta.env.VITE_MEMBER_API_BASE);

export const MEMBER_AUTHORIZATION =
  envText(import.meta.env.VITE_MEMBER_AUTHORIZATION);

export const AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2 =
  envText(import.meta.env.VITE_AI_CHAT_IMAGE_MODEL_ID_NANO_BANANA2);

export const TOKEN_KEY = "access_token";
