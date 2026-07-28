/**
 * SKB GIS System - Data and State Management
 */

// Application State
export const state = {
    areas: [],               // List of maintenance areas (loaded from areas.json)
    areaHierarchy: {},       // { 연도: { 시도: { 시군구: [ {area_id, suffix, ...} ] } } }
    currentAreaId: null,     // Currently active area ID
    currentAreaData: null,   // Current area polygon & building data
    searchQuery: '',         // Active search query
    filteredBuildings: [],   // Filtered list of buildings
    selectedBuilding: null,  // Currently active/clicked building object
    theme: 'dark',           // Map theme: 'dark' | 'light'
    stats: {
        total: 0,
        inside: 0,
        buffer: 0
    }
};

/**
 * Fetch list of all maintenance areas from data/areas.json.
 */
export async function loadAreas() {
    try {
        const response = await fetch('data/areas.json');
        if (!response.ok) {
            throw new Error(`Failed to load areas list: ${response.status}`);
        }
        state.areas = await response.json();
        state.areaHierarchy = buildAreaHierarchy(state.areas);
        return state.areas;
    } catch (error) {
        console.error('Error loading areas metadata:', error);
        throw error;
    }
}

/**
 * area_name("연도-시도-시군구-번호" 형식, 예: "2026-서울특별시-강남구-강남-1")을
 * 연도 > 시도 > 시군구 > [구역목록] 계층 구조로 재구성.
 * 정비구역 드롭다운을 연도/시도/시군구/번호 단계별로 좁혀 나갈 수 있게 하기 위함.
 * @param {Array} areas - areas.json의 원본 배열
 */
function buildAreaHierarchy(areas) {
    const hierarchy = {};

    areas.forEach(area => {
        const parts = String(area.area_name || '').split('-');
        if (parts.length < 3) return;

        const year = parts[0];
        const sido = parts[1];
        const sigungu = parts[2];
        const suffix = parts.slice(3).join('-') || '1';

        if (!hierarchy[year]) hierarchy[year] = {};
        if (!hierarchy[year][sido]) hierarchy[year][sido] = {};
        if (!hierarchy[year][sido][sigungu]) hierarchy[year][sido][sigungu] = [];

        hierarchy[year][sido][sigungu].push({
            area_id: area.area_id,
            suffix,
            building_count: area.building_count,
            inside_count: area.inside_count,
            near_count: area.near_count
        });
    });

    // 구역 번호 순서대로 정렬 (자연 정렬: "2"가 "10"보다 앞에 오도록)
    Object.values(hierarchy).forEach(sidoMap => {
        Object.values(sidoMap).forEach(sigunguMap => {
            Object.values(sigunguMap).forEach(list => {
                list.sort((a, b) => a.suffix.localeCompare(b.suffix, 'ko', { numeric: true }));
            });
        });
    });

    return hierarchy;
}

/**
 * Fetch detailed data for a specific maintenance area.
 * @param {string} areaId - ID of the area to load
 */
export async function loadAreaData(areaId) {
    const areaMeta = state.areas.find(a => a.area_id === areaId);
    if (!areaMeta) {
        throw new Error(`Area metadata not found for ID: ${areaId}`);
    }

    try {
        const response = await fetch(`data/areas/${areaMeta.file}`);
        if (!response.ok) {
            throw new Error(`Failed to load area data from ${areaMeta.file}: ${response.status}`);
        }

        const data = await response.json();
        
        // Update state
        state.currentAreaId = areaId;
        state.currentAreaData = data;
        state.searchQuery = '';
        state.selectedBuilding = null;
        
        // Calculate statistics
        calculateStats(data.buildings);
        
        // Initial list is unfiltered
        state.filteredBuildings = [...data.buildings];
        
        return data;
    } catch (error) {
        console.error(`Error loading area detailed data for ${areaId}:`, error);
        throw error;
    }
}

/**
 * Compute statistics for the loaded buildings.
 * @param {Array} buildings - List of building objects
 */
function calculateStats(buildings) {
    state.stats.total = buildings.length;
    state.stats.inside = buildings.filter(b => b.match_type === 'inside').length;
    state.stats.buffer = buildings.filter(b => b.match_type === '100m').length;
}

/**
 * Filter buildings by name or address.
 * @param {string} query - Search text
 */
export function filterBuildings(query) {
    state.searchQuery = query.trim().toLowerCase();
    
    if (!state.currentAreaData) {
        state.filteredBuildings = [];
        return [];
    }
    
    if (!state.searchQuery) {
        state.filteredBuildings = [...state.currentAreaData.buildings];
    } else {
        state.filteredBuildings = state.currentAreaData.buildings.filter(b => {
            const nameMatch = b.bld_nm && b.bld_nm.toLowerCase().includes(state.searchQuery);
            const roadMatch = b.road_addr && b.road_addr.toLowerCase().includes(state.searchQuery);
            const jibunMatch = b.jibun_addr && b.jibun_addr.toLowerCase().includes(state.searchQuery);
            return nameMatch || roadMatch || jibunMatch;
        });
    }
    
    return state.filteredBuildings;
}

/**
 * Set the selected building.
 * @param {object} building - Building object to select
 */
export function selectBuilding(building) {
    state.selectedBuilding = building;
}
