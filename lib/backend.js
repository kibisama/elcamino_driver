// 서버 측에서 최종 백엔드를 호출하는 저수준 클라이언트.
// proxy.js / Route Handler / Server Component 모두 이 모듈을 통해서만 백엔드에 접근한다.
// (브라우저는 절대로 백엔드를 직접 호출하지 않는다 → BFF 패턴)
import { AppError, ERROR_CODES, parseResponse, readJsonSafe } from "@/lib/errors";
import { BACKEND_AUTH_ENDPOINTS, getBackendBaseUrl, isBackendConfigured } from "./config";
import { clearAuthCookies, readAuthCookies, setAuthCookies } from "./cookies";

/**
 * 백엔드로 요청을 보내는 기본 헬퍼.
 * - accessToken 이 있으면 Authorization: Bearer 헤더로 실어 보낸다. (백엔드는 쿠키를 다루지 않음)
 * - json 옵션을 주면 JSON 바디로 직렬화한다.
 * - 네트워크 오류는 AppError(502, BACKEND_UNREACHABLE) 로 변환한다.
 * - Response 객체를 그대로 반환하므로, 응답 처리는 호출 측(parseResponse 등)에서 결정한다.
 */
export async function backendFetch(path, { accessToken, json, headers, ...init } = {}) {
    if (!isBackendConfigured()) {
        throw new AppError(503, "Backend is not configured", { code: ERROR_CODES.NO_BACKEND });
    }
    const finalHeaders = new Headers(headers);
    if (!finalHeaders.has("Accept"))
        finalHeaders.set("Accept", "application/json");
    if (json !== undefined)
        finalHeaders.set("Content-Type", "application/json");
    if (accessToken)
        finalHeaders.set("Authorization", `Bearer ${accessToken}`);
    try {
        return await fetch(`${getBackendBaseUrl()}${path}`, {
            ...init,
            headers: finalHeaders,
            body: json !== undefined ? JSON.stringify(json) : init.body,
            cache: "no-store",
        });
    }
    catch (err) {
        throw new AppError(502, "Unable to reach the backend", {
            code: ERROR_CODES.BACKEND_UNREACHABLE,
            details: err instanceof Error ? err.message : undefined,
        });
    }
}

// 백엔드 응답이 "accessToken 자연 만료" 인지 판별한다. (원본 Response 바디는 소비하지 않음)
export async function isAccessTokenExpired(res) {
    if (res.status !== 401)
        return false;
    const body = await readJsonSafe(res.clone());
    return body?.code === ERROR_CODES.ACCESS_TOKEN_EXPIRED;
}

/**
 * 백엔드 토큰 응답 정규화.
 * JWT 는 절대 디코딩하지 않으며, 수명은 오직 expiresIn / refreshExpiresIn 값만 신뢰한다.
 * refresh 중복 요청(grace period) 응답에는 refreshToken / refreshExpiresIn 이 없을 수 있다.
 */
function normalizeTokens(data) {
    if (!data?.accessToken || typeof data.expiresIn !== "number") {
        throw new AppError(502, "Invalid token response from backend", { code: ERROR_CODES.INTERNAL });
    }
    return {
        accessToken: data.accessToken,
        expiresIn: data.expiresIn,
        refreshToken: data.refreshToken ?? null,
        refreshExpiresIn: typeof data.refreshExpiresIn === "number" ? data.refreshExpiresIn : null,
    };
}

// POST /api/auth/login
export async function requestLogin(email, password) {
    const res = await backendFetch(BACKEND_AUTH_ENDPOINTS.LOGIN, { method: "POST", json: { email, password } });
    return normalizeTokens(await parseResponse(res));
}

// 같은 서버 인스턴스 안에서 동일 refreshToken 으로 동시에 refresh 하는 것을 하나로 합친다.
// (인스턴스 간 중복은 백엔드의 grace period 가 처리)
const inflightRefreshes = new Map();

// POST /api/auth/refresh (동시 요청 dedupe 포함)
export function requestRefresh(refreshToken) {
    const pending = inflightRefreshes.get(refreshToken);
    if (pending)
        return pending;
    const promise = (async () => {
        const res = await backendFetch(BACKEND_AUTH_ENDPOINTS.REFRESH, { method: "POST", json: { refreshToken } });
        return normalizeTokens(await parseResponse(res));
    })().finally(() => inflightRefreshes.delete(refreshToken));
    inflightRefreshes.set(refreshToken, promise);
    return promise;
}

// POST /api/auth/logout (실패해도 로그아웃 흐름은 계속 진행되어야 하므로 에러를 삼킨다)
export async function requestLogout(refreshToken) {
    if (!refreshToken || !isBackendConfigured())
        return;
    try {
        await backendFetch(BACKEND_AUTH_ENDPOINTS.LOGOUT, { method: "POST", json: { refreshToken } });
    }
    catch {
        /* 백엔드 로그아웃 실패는 무시 (쿠키는 어차피 삭제됨) */
    }
}

// refresh 실패가 "세션 종료"를 의미하는지 판별 (백엔드 장애와 구분)
export function isSessionInvalidError(err) {
    return err instanceof AppError && (err.status === 401 || err.status === 403);
}

/**
 * 쿠키 store 를 기준으로 토큰을 rotation 하고 결과를 store 에 저장한다.
 * - 성공: 새 accessToken 반환
 * - refreshToken 이 무효: 쿠키 삭제 후 AppError(401, SESSION_EXPIRED) throw
 * - 그 외(백엔드 장애 등): 원래 에러를 그대로 throw (세션은 유지)
 */
export async function rotateTokens(store) {
    const { refreshToken, email } = readAuthCookies(store);
    if (!refreshToken) {
        throw new AppError(401, "Session expired", { code: ERROR_CODES.SESSION_EXPIRED });
    }
    try {
        const tokens = await requestRefresh(refreshToken);
        setAuthCookies(store, tokens, { email });
        return tokens.accessToken;
    }
    catch (err) {
        if (isSessionInvalidError(err)) {
            clearAuthCookies(store);
            throw new AppError(401, "Session expired", { code: ERROR_CODES.SESSION_EXPIRED });
        }
        throw err;
    }
}

/**
 * 인증이 필요한 백엔드 호출의 핵심 헬퍼.
 * 1) 쿠키의 accessToken 을 Bearer 헤더로 실어 호출
 * 2) accessToken 이 없거나(쿠키 자연 만료) 백엔드가 ACCESS_TOKEN_EXPIRED 를 응답하면
 *    allowRefresh 가 true 일 때만 refresh → 한 번 재시도
 *
 * allowRefresh 는 쿠키를 "쓸 수 있는" 컨텍스트(Route Handler, Server Action)에서만 true 로 한다.
 * Server Component 에서는 쿠키를 쓸 수 없어 rotation 된 refreshToken 을 잃어버리므로 false 여야 한다.
 */
export async function fetchWithAuth(path, init = {}, { store, allowRefresh = false }) {
    let { accessToken, refreshToken } = readAuthCookies(store);
    if (!accessToken && !refreshToken) {
        throw new AppError(401, "Session expired", { code: ERROR_CODES.SESSION_EXPIRED });
    }
    if (!accessToken) {
        if (!allowRefresh)
            throw new AppError(401, "Access token expired", { code: ERROR_CODES.ACCESS_TOKEN_EXPIRED });
        accessToken = await rotateTokens(store);
    }
    const res = await backendFetch(path, { ...init, accessToken });
    if (!allowRefresh || !(await isAccessTokenExpired(res)))
        return res;
    const renewedAccessToken = await rotateTokens(store);
    return backendFetch(path, { ...init, accessToken: renewedAccessToken });
}
