/**
 * SKB GIS System - 접속 인증 (경량 접근 제어)
 *
 * data/auth.json에 저장된 SHA-256 해시와 비교해서 인증번호를 확인한다.
 * 인증 성공 시 세션(sessionStorage)에 기록해서, 같은 브라우저 탭을 쓰는 동안엔
 * 다시 묻지 않는다 (탭/브라우저를 완전히 닫으면 초기화됨).
 */

const AUTH_SESSION_KEY = 'skb_gis_authed';
const FETCH_TIMEOUT_MS = 2000;

async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digestBuf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digestBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * data/auth.json을 가져온다. 일정 시간 안에 응답이 없으면 자동으로 포기하고
 * 에러를 던진다 (무한정 "불러오는 중..." 상태로 멈춰있는 문제 방지).
 */
async function fetchAuthConfig() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const res = await fetch('data/auth.json', {
            cache: 'no-store',
            signal: controller.signal
        });

        if (!res.ok) {
            throw new Error(`auth.json 로드 실패: ${res.status}`);
        }

        return await res.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * 인증이 끝날 때까지 기다리는 Promise를 반환한다.
 * 이미 이번 세션에 인증됐으면 즉시 통과, 아니면 인증번호 입력창을 띄우고 기다린다.
 */
export function requireAuth() {
    if (sessionStorage.getItem(AUTH_SESSION_KEY) === '1') {
        return Promise.resolve();
    }

    const overlay = document.getElementById('authOverlay');
    const input = document.getElementById('authInput');
    const errorEl = document.getElementById('authError');
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!overlay || !input || !submitBtn || !errorEl) {
        // 인증 UI 자체가 없으면(마크업 누락 등) 그냥 통과시킴
        return Promise.resolve();
    }

    overlay.style.display = 'flex';
    input.focus();

    return new Promise((resolve) => {
        let authConfig = null;

        const setLoadingState = () => {
            submitBtn.disabled = true;
            submitBtn.textContent = '불러오는 중...';
            errorEl.style.display = 'none';
        };

        const setReadyState = () => {
            submitBtn.disabled = false;
            submitBtn.textContent = '확인';
        };

        const setRetryState = (message) => {
            submitBtn.disabled = false;
            submitBtn.textContent = '다시 시도';
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        };

        const loadAuthConfig = async () => {
            setLoadingState();
            try {
                authConfig = await fetchAuthConfig();
                setReadyState();
            } catch (error) {
                console.error('인증 설정을 불러오지 못했습니다:', error);
                authConfig = null;
                setRetryState('연결이 원활하지 않습니다. 버튼을 눌러 다시 시도해주세요.');
            }
        };

        const attemptAuth = async () => {
            // authConfig가 없으면(아직 로딩 전, 로딩 실패, 타임아웃 등) 재시도부터
            if (!authConfig) {
                loadAuthConfig();
                return;
            }

            const value = input.value.trim();

            if (value.length < 6 || value.length > 10) {
                errorEl.textContent = '인증번호는 6~10자리로 입력해주세요.';
                errorEl.style.display = 'block';
                return;
            }

            const hash = await sha256Hex(authConfig.salt + value);

            if (hash === authConfig.hash) {
                sessionStorage.setItem(AUTH_SESSION_KEY, '1');
                overlay.style.display = 'none';
                resolve();
            } else {
                errorEl.textContent = '인증번호가 일치하지 않습니다.';
                errorEl.style.display = 'block';
                input.value = '';
                input.focus();
            }
        };

        submitBtn.addEventListener('click', attemptAuth);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptAuth();
        });

        loadAuthConfig();
    });
}
