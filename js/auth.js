/**
 * SKB GIS System - 접속 인증 (경량 접근 제어)
 *
 * data/auth.json에 저장된 SHA-256 해시와 비교해서 인증번호를 확인한다.
 * 인증 성공 시 세션(sessionStorage)에 기록해서, 같은 브라우저 탭을 쓰는 동안엔
 * 다시 묻지 않는다 (탭/브라우저를 완전히 닫으면 초기화됨).
 */

const AUTH_SESSION_KEY = 'skb_gis_authed';

async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digestBuf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digestBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
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

    // auth.json을 다 불러오기 전까지는 버튼을 비활성화 + 안내 문구 표시.
    // (이게 없으면, 로딩 중에 사용자가 확인/엔터를 눌러도 authConfig가 없어서
    //  아무 반응 없이 조용히 무시되는 문제가 있었음 - "버튼이 먹통"으로 보이던 원인)
    submitBtn.disabled = true;
    submitBtn.textContent = '불러오는 중...';

    return new Promise((resolve) => {
        let authConfig = null;
        let loadFailed = false;

        // 캐시를 무시하고 항상 최신 auth.json을 받아온다.
        // (GitHub Pages/브라우저가 예전 버전을 계속 캐싱해서 인증번호 변경이
        //  바로 반영 안 되는 문제를 방지)
        const cacheBuster = `?t=${Date.now()}`;

        fetch(`data/auth.json${cacheBuster}`, { cache: 'no-store' })
            .then(res => {
                if (!res.ok) throw new Error(`auth.json 로드 실패: ${res.status}`);
                return res.json();
            })
            .then(cfg => {
                authConfig = cfg;
                submitBtn.disabled = false;
                submitBtn.textContent = '확인';
            })
            .catch(error => {
                console.error('인증 설정을 불러오지 못했습니다:', error);
                loadFailed = true;
                errorEl.textContent = '인증 설정을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.';
                errorEl.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = '다시 시도';
            });

        const attemptAuth = async () => {
            if (loadFailed) {
                // 로드 자체가 실패했으면 재시도 유도 (새로고침)
                errorEl.textContent = '인증 설정을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.';
                errorEl.style.display = 'block';
                return;
            }

            if (!authConfig) {
                // 아직 auth.json 로딩 중 - 버튼이 비활성화 상태라 보통 여기 안 오지만,
                // 혹시 모를 경우를 대비해 명확한 안내를 띄운다.
                errorEl.textContent = '아직 불러오는 중입니다. 잠시만 기다려주세요.';
                errorEl.style.display = 'block';
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
    });
}
