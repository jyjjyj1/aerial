/**
 * SKB GIS System - Data and State Management
 */

// Application State
export const state = {
    areas: [],               // List of maintenance areas (loaded from areas.json)
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
        return state.areas;
    } catch (error) {
        console.error('Error loading areas metadata:', error);
        throw error;
    }
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
        const response = await fetch(areaMeta.file);
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
    state.stats.inside = buildings.filter(b => b.match_type === '구역내').length;
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
