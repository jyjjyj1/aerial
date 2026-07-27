/**
 * SKB GIS System - Utilities and Helper Functions
 */

/**
 * Format a number with thousands separators (comma).
 * @param {number|string} val - The number to format
 * @returns {string} Formatted number or '0'
 */
export function formatNumber(val) {
    if (val === undefined || val === null || isNaN(Number(val))) {
        return '0';
    }
    return Number(val).toLocaleString('ko-KR');
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
    if (!str) return '';
    return str
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * 건물명이 없거나 'N/A' 문자열인 경우 한글 안내 텍스트로 대체.
 * @param {string} name - 원본 bld_nm 값
 * @returns {string} 표시용 건물명
 */
export function getBuildingName(name) {
    if (!name || name.trim() === '' || name.trim().toUpperCase() === 'N/A') {
        return '건물명 없음';
    }
    return name;
}

/**
 * Debounce function calls to optimize performance.
 * @param {Function} func - The function to execute
 * @param {number} wait - Timeout in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}