export const AUTH_COOKIES = Object.freeze({
  ACCESS_TOKEN: "at", // accessToken (수명 = 백엔드 expiresIn)
  REFRESH_TOKEN: "rt", // refreshToken (수명 = 백엔드 refreshExpiresIn)
});

export const LOGIN_PATH = "/login";
export const PUBLIC_PATHS = [LOGIN_PATH];
export const DEFAULT_AFTER_LOGIN_PATH = "/";

export const API_BASE_URL = (
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ""
).replace(/\/$/, "");

export function isPublicPath(pathname) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * 인증 쿠키 공통 옵션.
 * - 수명(maxAge)은 절대 하드코딩하지 않고 호출 측에서 백엔드 응답값(expiresIn 등)을 그대로 넘긴다.
 * - maxAge 를 넘기지 않으면 브라우저 세션 쿠키가 된다. (데모 모드에서만 사용)
 * - 개발 환경(v0 미리보기)은 iframe 안에서 동작하므로 SameSite=None 이 필요하다.
 */
export function authCookieOptions(maxAge) {
  const options = {
    httpOnly: true,
    secure: true,
    sameSite: process.env.NODE_ENV === "production" ? "lax" : "none",
    path: "/",
  };
  if (typeof maxAge === "number" && Number.isFinite(maxAge))
    options.maxAge = maxAge;
  return options;
}

// 로그인 후 돌아갈 경로가 같은 오리진의 상대 경로인지 검증 (open redirect 방지)
export function sanitizeNextPath(next) {
  if (
    typeof next !== "string" ||
    !next.startsWith("/") ||
    next.startsWith("//")
  )
    return DEFAULT_AFTER_LOGIN_PATH;
  return next;
}
