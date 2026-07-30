/**
 * SKB GIS System - UI Elements and Event Handling
 */

import { state, filterBuildings } from './data.js';
import { focusBuildingOnMap, resetMapFocus, bindMyLocationButton } from './map.js';
import { formatNumber, debounce, getBuildingName } from './utils.js';

// DOM Elements Cache
let elements = {};

/**
 * 인터넷/TV가입자수는 세부 기술방식 목록(int_tech/tv_tech)의 합으로 계산한다.
 * (지도 팝업의 상세 목록과 항상 일치시키기 위해 map.js와 동일한 방식으로 통일)
 */
function sumTechCount(techArr) {
    if (!techArr || techArr.length === 0) return 0;
    return techArr.reduce((sum, t) => sum + (Number(t.count) || 0), 0);
}

/**
 * Cache DOM elements for quick access.
 */
export function initDOMElements() {
    elements = {
        yearSelect: document.getElementById('yearSelect'),
        sidoSelect: document.getElementById('sidoSelect'),
        sigunguSelect: document.getElementById('sigunguSelect'),
        areaNumberSelect: document.getElementById('areaNumberSelect'),
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
        myLocationBtn: document.getElementById('myLocationBtn'),
        themeToggleBtn: document.getElementById('themeToggleBtn'),
        loadingOverlay: document.getElementById('loadingOverlay')
    };
}

/**
 * 정비구역 선택 드롭다운(연도 단계)을 초기화.
 * 시도/시군구/번호는 state.areaHierarchy를 바탕으로 단계별로 채워짐 (setupUIEventListeners 참고).
 */
export function updateAreaSelect() {
    if (!elements.yearSelect) return;

    const years = Object.keys(state.areaHierarchy).sort((a, b) => b.localeCompare(a));

    elements.yearSelect.innerHTML = '<option value="">연도 선택</option>';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}년`;
        elements.yearSelect.appendChild(option);
    });

    resetSelect(elements.sidoSelect, '시/도 선택');
    resetSelect(elements.sigunguSelect, '시/군/구 선택');
    resetSelect(elements.areaNumberSelect, '구역 번호 선택');
}

/**
 * 드롭다운을 플레이스홀더 옵션 하나만 남기고 비활성화.
 */
function resetSelect(selectEl, placeholder) {
    if (!selectEl) return;
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    selectEl.disabled = true;
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
                <span class="bld-title">${getBuildingName(bld.bld_nm)}</span>
                <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="bld-address">
                <span>${bld.jibun_addr || '-'}</span>
                <span class="road">${bld.road_addr || '-'}</span>
            </div>
            <div class="bld-info-preview">
                <div class="bld-info-item">인터넷가입자수: <span>${formatNumber(sumTechCount(bld.int_tech))}</span></div>
                <div class="bld-info-item">TV가입자수: <span>${formatNumber(sumTechCount(bld.tv_tech))}</span></div>
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
    // 0. 내 위치 버튼을 map.js의 위치추적 기능과 연결
    //    (기존엔 Leaflet Control로 따로 떠 있어서 recenterBtn 등과 겹쳐 보였던 문제 수정)
    if (elements.myLocationBtn) {
        bindMyLocationButton(elements.myLocationBtn);
    }

    // 1. 연도 선택 → 시/도 목록 채우기
    if (elements.yearSelect) {
        elements.yearSelect.addEventListener('change', (e) => {
            const year = e.target.value;

            resetSelect(elements.sidoSelect, '시/도 선택');
            resetSelect(elements.sigunguSelect, '시/군/구 선택');
            resetSelect(elements.areaNumberSelect, '구역 번호 선택');

            if (!year || !state.areaHierarchy[year]) return;

            const sidoList = Object.keys(state.areaHierarchy[year]).sort((a, b) => a.localeCompare(b, 'ko'));

            elements.sidoSelect.innerHTML = '<option value="">시/도 선택</option>';
            sidoList.forEach(sido => {
                const option = document.createElement('option');
                option.value = sido;
                option.textContent = sido;
                elements.sidoSelect.appendChild(option);
            });
            elements.sidoSelect.disabled = false;
        });
    }

    // 1-1. 시/도 선택 → 시/군/구 목록 채우기
    if (elements.sidoSelect) {
        elements.sidoSelect.addEventListener('change', (e) => {
            const year = elements.yearSelect.value;
            const sido = e.target.value;

            resetSelect(elements.sigunguSelect, '시/군/구 선택');
            resetSelect(elements.areaNumberSelect, '구역 번호 선택');

            const sigunguMap = year && sido ? state.areaHierarchy[year]?.[sido] : null;
            if (!sigunguMap) return;

            const sigunguList = Object.keys(sigunguMap).sort((a, b) => a.localeCompare(b, 'ko'));

            elements.sigunguSelect.innerHTML = '<option value="">시/군/구 선택</option>';
            sigunguList.forEach(sigungu => {
                const option = document.createElement('option');
                option.value = sigungu;
                option.textContent = sigungu;
                elements.sigunguSelect.appendChild(option);
            });
            elements.sigunguSelect.disabled = false;
        });
    }

    // 1-2. 시/군/구 선택 → 해당 시/군/구의 구역 번호 목록 채우기 (핵심 요청사항)
    if (elements.sigunguSelect) {
        elements.sigunguSelect.addEventListener('change', (e) => {
            const year = elements.yearSelect.value;
            const sido = elements.sidoSelect.value;
            const sigungu = e.target.value;

            resetSelect(elements.areaNumberSelect, '구역 번호 선택');

            const list = year && sido && sigungu
                ? state.areaHierarchy[year]?.[sido]?.[sigungu]
                : null;
            if (!list) return;

            elements.areaNumberSelect.innerHTML = '<option value="">구역 번호 선택</option>';
            list.forEach(entry => {
                const option = document.createElement('option');
                option.value = entry.area_id;
                option.textContent = `${entry.suffix}구역 (건물 ${entry.building_count}개)`;
                elements.areaNumberSelect.appendChild(option);
            });
            elements.areaNumberSelect.disabled = false;
        });
    }

    // 1-3. 구역 번호 선택 → 실제 데이터 로드 (기존 areaSelect change 로직과 동일)
    if (elements.areaNumberSelect) {
        elements.areaNumberSelect.addEventListener('change', async (e) => {
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
