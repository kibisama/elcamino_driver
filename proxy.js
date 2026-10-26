// Next.js 16 proxy (구 middleware).
// 원칙: 페이지 요청에 대해 "refreshToken 쿠키 존재 여부"로만 리다이렉트한다.
// 예외: accessToken 쿠키가 자연 만료(=쿠키 maxAge 가 expiresIn 으로 설정되어 사라짐)된 경우에만
//       여기서 refresh 를 수행한다. Server Component 는 쿠키를 쓸 수 없기 때문에,
//       렌더링 전에 미리 rotation 해 두어야 화면 깜빡임/로그인 리다이렉트 없이 이어서 렌더링할 수 있다.
// /api/* (BFF) 요청은 matcher 에서 제외 → BFF 가 자체적으로 401 → refresh → 재시도 처리.
import { NextResponse } from "next/server";
import { AUTH_COOKIES, DEFAULT_AFTER_LOGIN_PATH, LOGIN_PATH, isBackendConfigured, isPublicPath } from "@/lib/auth/config";
import { clearAuthCookies, readAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { isSessionInvalidError, requestRefresh } from "@/lib/auth/backend";

function redirectToLogin(request, { clearCookies = false } = {}) {
    const url = new URL(LOGIN_PATH, request.url);
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    if (next !== "/")
        url.searchParams.set("next", next);
    const response = NextResponse.redirect(url);
    if (clearCookies)
        clearAuthCookies(response.cookies);
    return response;
}

export async function proxy(request) {
    const { pathname } = request.nextUrl;
    const { accessToken, refreshToken, email } = readAuthCookies(request.cookies);

    // 1) 세션 없음: 보호 페이지는 로그인으로, 공개 페이지는 통과
    if (!refreshToken) {
        return isPublicPath(pathname) ? NextResponse.next() : redirectToLogin(request);
    }

    // 2) 세션 있음 + 로그인 페이지 접근 → 대시보드로
    if (isPublicPath(pathname)) {
        return NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN_PATH, request.url));
    }

    // 3) accessToken 쿠키가 살아 있으면 아무것도 하지 않는다
    if (accessToken || !isBackendConfigured()) {
        return NextResponse.next();
    }

    // 4) 예외 처리: accessToken 자연 만료 → 렌더링 전에 rotation
    try {
        const tokens = await requestRefresh(refreshToken);

        // 이번 요청의 Server Component 가 새 accessToken 을 읽을 수 있도록 요청 쿠키를 갱신
        request.cookies.set(AUTH_COOKIES.ACCESS, tokens.accessToken);
        if (tokens.refreshToken)
            request.cookies.set(AUTH_COOKIES.REFRESH, tokens.refreshToken);

        const response = NextResponse.next({ request: { headers: request.headers } });
        // 브라우저에 저장될 쿠키 갱신 (수명은 백엔드 응답값 그대로)
        setAuthCookies(response.cookies, tokens, { email });
        return response;
    }
    catch (err) {
        // refreshToken 자체가 무효 → 세션 종료
        if (isSessionInvalidError(err))
            return redirectToLogin(request, { clearCookies: true });
        // 백엔드 일시 장애 등 → 세션은 유지하고 페이지 측 에러 처리에 맡긴다
        return NextResponse.next();
    }
}

export const config = {
    // API(BFF), Next 내부 리소스, 정적 파일은 제외
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|txt|xml)$).*)"],
};
