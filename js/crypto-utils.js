/**
 * SKB GIS System - 가입자 데이터 복호화
 *
 * export_tool의 crypto_utils.py와 동일한 키/방식(AES-256-GCM)을 사용해서,
 * JSON에 암호화되어 담긴 인터넷/TV 가입자수·기술방식 데이터를 브라우저에서 복호화한다.
 *
 * ⚠️ 이 키는 이 파일에 그대로 노출되어 있다. 이 방식은 "완벽한 보안"이 아니라
 * JSON을 직접 열어봐도 바로 못 알아보게 하는 억제책이다.
 */

// 반드시 export_tool/crypto_utils.py의 AES_KEY_B64와 동일한 값이어야 함
const AES_KEY_B64 = 'LgDG7scAeSbdb7g7sF+hckjDkcyFUTJPAukJhdDLHwY=';

let cachedKeyPromise = null;

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function importAesKey() {
    if (!cachedKeyPromise) {
        cachedKeyPromise = crypto.subtle.importKey(
            'raw',
            base64ToBytes(AES_KEY_B64),
            'AES-GCM',
            false,
            ['decrypt']
        );
    }
    return cachedKeyPromise;
}

/**
 * exporter.py의 encrypt_subscriber_data()로 암호화된 문자열을 복호화한다.
 * 형식: "base64(nonce):base64(ciphertext+tag)"
 * @param {string} encStr - 암호화된 문자열 (enc_subscriber 필드 값)
 * @returns {Promise<object>} { int_scrbr_cnt, tv_scrbr_cnt, int_tech, tv_tech }
 */
export async function decryptSubscriberData(encStr) {
    const fallback = { int_scrbr_cnt: 0, tv_scrbr_cnt: 0, int_tech: [], tv_tech: [] };

    if (!encStr || typeof encStr !== 'string' || !encStr.includes(':')) {
        return fallback;
    }

    try {
        const [nonceB64, cipherB64] = encStr.split(':');
        const nonce = base64ToBytes(nonceB64);
        const cipherBytes = base64ToBytes(cipherB64);
        const key = await importAesKey();

        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce },
            key,
            cipherBytes
        );

        const plainText = new TextDecoder().decode(plainBuf);
        return JSON.parse(plainText);
    } catch (error) {
        console.error('가입자 데이터 복호화 실패:', error);
        return fallback;
    }
}
