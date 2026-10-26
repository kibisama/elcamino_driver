// 인증 쿠키 읽기/쓰기 헬퍼.
// "store" 는 다음 중 무엇이든 될 수 있다 (모두 get / set 인터페이스가 동일):
//   - next/headers 의 cookies() (Route Handler, Server Action)
//   - NextResponse.cookies (proxy.js)
//   - NextRequest.cookies (읽기 전용 용도)
import { AUTH_COOKIES, authCookieOptions } from "./config";

// 쿠키 store 에서 인증 관련 값을 한 번에 읽는다.
export function readAuthCookies(store) {
    return {
        accessToken: store.get(AUTH_COOKIES.ACCESS)?.value ?? null,
        refreshToken: store.get(AUTH_COOKIES.REFRESH)?.value ?? null,
        email: store.get(AUTH_COOKIES.PROFILE)?.value ?? null,
    };
}

/**
 * 백엔드 토큰 응답을 쿠키에 저장한다.
 * - accessToken 쿠키 수명 = tokens.expiresIn (초)
 * - refreshToken 쿠키 수명 = tokens.refreshExpiresIn (초)
 * - refresh 중복 요청(grace period)일 때 백엔드는 refreshToken / refreshExpiresIn 을 생략하므로
 *   그 경우에는 기존 refreshToken 쿠키를 건드리지 않는다.
 * - email(프로필) 쿠키는 refreshToken 과 수명을 맞춰 함께 갱신한다.
 */
export function setAuthCookies(store, tokens, { email } = {}) {
    store.set(AUTH_COOKIES.ACCESS, tokens.accessToken, authCookieOptions(tokens.expiresIn));
    if (tokens.refreshToken) {
        store.set(AUTH_COOKIES.REFRESH, tokens.refreshToken, authCookieOptions(tokens.refreshExpiresIn));
        if (email)
            store.set(AUTH_COOKIES.PROFILE, email, authCookieOptions(tokens.refreshExpiresIn));
    }
}

/**
 * 인증 쿠키를 모두 삭제한다.
 * SameSite=None 쿠키는 삭제 시에도 동일한 속성(Secure 등)이 필요하므로
 * delete() 대신 같은 옵션 + maxAge 0 으로 덮어쓴다.
 */
export function clearAuthCookies(store) {
    for (const name of Object.values(AUTH_COOKIES)) {
        store.set(name, "", authCookieOptions(0));
    }
}
