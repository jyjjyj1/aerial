/**
 * SKB GIS System - UI Elements and Event Handling
 */

import { state, filterBuildings } from './data.js';
import { focusBuildingOnMap, resetMapFocus } from './map.js';
import { formatNumber, debounce } from './utils.js';

// DOM Elements Cache
let elements = {};

/**
 * Cache DOM elements for quick access.
 */
export function initDOMElements() {
    elements = {
        areaSelect: document.getElementById('areaSelect'),
        searchInput: document.getElementById('searchInput'),
        clearSearchBtn: document.getElementById('clearSearchBtn'),
        totalBuildings: document.getElementById('totalBuildings'),
        insideBuildings: document.getElementById('insideBuildings'),
        bufferBuildings: document.getElementById('bufferBuildings'),
        filteredCount: document.getElementById('filteredCount'),
        buildingList: document.getElementById('buildingList'),
        sidebar: document.getElementById('sidebar'),
        sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        recenterBtn: document.getElementById('recenterBtn'),
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        loadingOverlay: document.getElementById('loadingOverlay')
    };
}

/**
 * Populate area dropdown options.
 * @param {Array} areas - List of area metadata
 */
export function updateAreaSelect(areas) {
    if (!elements.areaSelect) return;
    
    // Clear except first disabled option
    elements.areaSelect.innerHTML = '<option value="" disabled selected>정비구역을 선택하세요</option>';
    
    areas.forEach(area => {
        const option = document.createElement('option');
        option.value = area.area_id;
        option.textContent = area.area_name;
        elements.areaSelect.appendChild(option);
    });
}

/**
 * Update stats cards with formatted counts.
 * @param {object} stats - Statistics object { total, inside, buffer }
 */
export function updateStats(stats) {
    if (elements.totalBuildings) elements.totalBuildings.textContent = formatNumber(stats.total);
    if (elements.insideBuildings) elements.insideBuildings.textContent = formatNumber(stats.inside);
    if (elements.bufferBuildings) elements.bufferBuildings.textContent = formatNumber(stats.buffer);
}

/**
 * Show or hide loading spinner overlay.
 * @param {boolean} show - True to display, False to hide
 */
export function showLoading(show) {
    if (elements.loadingOverlay) {
        elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Render buildings into the sidebar list.
 * @param {Array} buildings - Buildings to display
 */
export function renderBuildingList(buildings) {
    if (!elements.buildingList) return;
    
    // Update count in header
    if (elements.filteredCount) {
        elements.filteredCount.textContent = formatNumber(buildings.length);
    }
    
    if (buildings.length === 0) {
        elements.buildingList.innerHTML = `
            <div class="list-placeholder">
                <i class="fa-solid fa-circle-exclamation"></i>
                <p>일치하는 건물이 없습니다.</p>
            </div>
        `;
        return;
    }
    
    elements.buildingList.innerHTML = '';
    
    buildings.forEach(bld => {
        const card = document.createElement('div');
        card.className = 'bld-card';
        card.dataset.pnu = bld.pnu;
        
        // Dynamic badges based on match_type ('inside' | '100m')
        const isInside = bld.match_type === 'inside';
        const badgeClass = isInside ? 'inside' : 'buffer';
        const badgeText = isInside ? '구역내' : '100m 이내';
        
        card.innerHTML = `
            <div class="bld-card-header">
                <span class="bld-title">${bld.bld_nm || '건물명 없음'}</span>
                <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="bld-address">
                <span>${bld.jibun_addr || '-'}</span>
                <span class="road">${bld.road_addr || '-'}</span>
            </div>
            <div class="bld-info-preview">
                <div class="bld-info-item">B가용: <span>${formatNumber(bld.avail_gen_cnt)}</span></div>
                <div class="bld-info-item">SKB: <span>${formatNumber(bld.skb_pop_cnt)}</span></div>
                <div class="bld-info-item">인터넷: <span>${formatNumber(bld.int_scrbr_cnt)}</span></div>
            </div>
        `;
        
        card.addEventListener('click', () => {
            focusBuildingOnMap(bld);
        });
        
        elements.buildingList.appendChild(card);
    });
}

/**
 * Highlight a specific building card in the sidebar.
 * @param {string} pnu - PNU of the selected building
 */
export function updateBuildingSelectionInUI(pnu) {
    // Remove active class from all cards
    const cards = elements.buildingList.querySelectorAll('.bld-card');
    cards.forEach(card => card.classList.remove('active'));
    
    // Find the selected card
    const selectedCard = elements.buildingList.querySelector(`.bld-card[data-pnu="${pnu}"]`);
    if (selectedCard) {
        selectedCard.classList.add('active');
        
        // Scroll card into view smoothly
        selectedCard.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    }
}

/**
 * Set up application UI event listeners.
 * @param {object} callbacks - Object containing callback functions for interactions
 */
export function setupUIEventListeners(callbacks) {
    // 1. Area Dropdown Selection Change
    if (elements.areaSelect) {
        elements.areaSelect.addEventListener('change', async (e) => {
            const areaId = e.target.value;
            if (areaId) {
                // Enable search input
                if (elements.searchInput) {
                    elements.searchInput.disabled = false;
                    elements.searchInput.value = '';
                }
                if (elements.clearSearchBtn) {
                    elements.clearSearchBtn.style.display = 'none';
                }
                
                // Enable recenter button
                if (elements.recenterBtn) {
                    elements.recenterBtn.disabled = false;
                }
                
                // Trigger loading area callback
                if (callbacks.onAreaChange) {
                    await callbacks.onAreaChange(areaId);
                }
                
                // On mobile, close sidebar automatically to show map
                if (window.innerWidth <= 768 && elements.sidebar) {
                    elements.sidebar.classList.remove('active');
                }
            }
        });
    }
    
    // 2. Search Input Input handler (Debounced)
    if (elements.searchInput) {
        const handleSearch = debounce((e) => {
            const query = e.target.value;
            
            // Show/hide clear search button
            if (elements.clearSearchBtn) {
                elements.clearSearchBtn.style.display = query ? 'flex' : 'none';
            }
            
            if (callbacks.onSearch) {
                callbacks.onSearch(query);
            }
        }, 200);
        
        elements.searchInput.addEventListener('input', handleSearch);
    }
    
    // 3. Clear Search Button Click
    if (elements.clearSearchBtn) {
        elements.clearSearchBtn.addEventListener('click', () => {
            if (elements.searchInput) {
                elements.searchInput.value = '';
                elements.searchInput.focus();
            }
            elements.clearSearchBtn.style.display = 'none';
            
            if (callbacks.onSearch) {
                callbacks.onSearch('');
            }
        });
    }
    
    // 4. Recenter Button Click
    if (elements.recenterBtn) {
        elements.recenterBtn.addEventListener('click', () => {
            resetMapFocus();
        });
    }
    
    // 5. Theme Toggle Button Click
    if (elements.themeToggleBtn) {
        elements.themeToggleBtn.addEventListener('click', () => {
            const newTheme = state.theme === 'dark' ? 'light' : 'dark';
            
            // Update icon representation
            elements.themeToggleBtn.innerHTML = newTheme === 'dark' 
                ? '<i class="fa-solid fa-moon"></i>' 
                : '<i class="fa-solid fa-sun"></i>';
                
            if (callbacks.onThemeChange) {
                callbacks.onThemeChange(newTheme);
            }
        });
    }
    
    // 6. Sidebar Collapse Toggle (Desktop)
    if (elements.sidebarToggleBtn) {
        elements.sidebarToggleBtn.addEventListener('click', () => {
            const isCollapsed = elements.sidebar.classList.toggle('collapsed');
            
            // Toggle icon direction
            elements.sidebarToggleBtn.innerHTML = isCollapsed
                ? '<i class="fa-solid fa-chevron-right"></i>'
                : '<i class="fa-solid fa-chevron-left"></i>';
                
            // Force Leaflet map to resize since width changed
            setTimeout(() => {
                if (callbacks.onWindowResize) {
                    callbacks.onWindowResize();
                }
            }, 300);
        });
    }
    
    // 7. Mobile Sidebar Toggle Button
    if (elements.mobileMenuBtn) {
        elements.mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (elements.sidebar) {
                elements.sidebar.classList.toggle('active');
            }
        });
    }
    
    // Close sidebar on mobile when clicking on map area
    const mapArea = document.getElementById('mapArea');
    if (mapArea) {
        mapArea.addEventListener('click', () => {
            if (window.innerWidth <= 768 && elements.sidebar) {
                elements.sidebar.classList.remove('active');
            }
        });
    }
}
