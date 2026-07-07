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
