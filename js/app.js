/**
 * SKB GIS System - Application Entry Point
 */

import { loadAreas, loadAreaData, filterBuildings, state } from './data.js';
import { initMap, renderAreaOnMap, setMapTheme } from './map.js';
import { 
    initDOMElements, 
    updateAreaSelect, 
    updateStats, 
    renderBuildingList, 
    setupUIEventListeners,
    showLoading
} from './ui.js';

// Application Orchestration
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Cache DOM Elements
    initDOMElements();
    
    // 2. Initialize Leaflet Map
    const map = initMap('map');
    
    // 3. Define Callback Actions for UI Interactions
    const uiCallbacks = {
        // Triggered when user selects a different maintenance area
        onAreaChange: async (areaId) => {
            showLoading(true);
            try {
                // Fetch new area details
                const data = await loadAreaData(areaId);
                
                // Update Sidebar UI elements
                updateStats(state.stats);
                renderBuildingList(state.filteredBuildings);
                
                // Render layers on map (Polygon & Building points), fitting map bounds
                renderAreaOnMap(data, true);
            } catch (error) {
                console.error(error);

                alert(
                    '데이터를 불러오는 중 오류가 발생했습니다.\n\n' +
                    error.message +
                    '\n\n자세한 내용은 F12 Console을 확인하세요.'
                );
            }
            } finally {
                showLoading(false);
            }
        },
        
        // Triggered when user types in the building/address search box
        onSearch: (query) => {
            // Filter buildings in state
            const filtered = filterBuildings(query);
            
            // Re-render building list in sidebar
            renderBuildingList(filtered);
            
            // Re-render markers on the map (keeping current center & zoom, no flickers)
            renderAreaOnMap(state.currentAreaData, false);
        },
        
        // Triggered when user clicks the theme toggle button
        onThemeChange: (newTheme) => {
            setMapTheme(newTheme);
        },
        
        // Triggered when sidebar is collapsed/expanded (desktop)
        onWindowResize: () => {
            if (map) {
                map.invalidateSize();
            }
        }
    };
    
    // 4. Setup Event Listeners in UI
    setupUIEventListeners(uiCallbacks);
    
    // 5. Load Initial Metadata Areas
    showLoading(true);
    try {
        const areas = await loadAreas();
        updateAreaSelect(areas);
    } catch (error) {
        alert('정비구역 목록을 불러오지 못했습니다.');
    } finally {
        showLoading(false);
    }
});
