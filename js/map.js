/**
 * SKB GIS System - Leaflet Map Integration & Layer Management
 */

import { state, selectBuilding } from './data.js';
import { formatNumber } from './utils.js';
import { updateBuildingSelectionInUI } from './ui.js';

// Local Map References
let mapInstance = null;
let tileLayer = null;

// Layer Groups for future extensibility (Layer-based GIS structure)
export const layerGroups = {
    polygon: L.featureGroup(),      // Maintenance area boundaries
    buildings: L.featureGroup(),    // Building point markers
    poles: L.featureGroup(),        // Extensibility slot: Utility poles
    cables: L.featureGroup(),       // Extensibility slot: Overhead cables
    construction: L.featureGroup()  // Extensibility slot: Construction markers
};

// References to marker instances by their PNU/ID
const buildingMarkers = new Map();

/**
 * Initialize the Leaflet Map instance.
 * @param {string} domId - The ID of the container element
 */
export function initMap(domId) {
    if (mapInstance) return mapInstance;
    
    // Create Leaflet map instance
    mapInstance = L.map(domId, {
        zoomControl: false,
        attributionControl: true
    }).setView([37.4979, 127.0276], 15); // Initial fallback center (Seoul Gangnam)
    
    // Add custom zoom control to the bottom right (desktop and mobile friendly)
    L.control.zoom({
        position: 'bottomright'
    }).addTo(mapInstance);
    
    // Initialize Layer Groups and add them to the map
    Object.values(layerGroups).forEach(group => {
        group.addTo(mapInstance);
    });
    
    // Load default theme (Dark theme is premium default)
    setMapTheme(state.theme);
    
    return mapInstance;
}

/**
 * Update the map's tile layer base on theme.
 * @param {string} theme - 'dark' | 'light'
 */
export function setMapTheme(theme) {
    state.theme = theme;
    
    if (tileLayer) {
        mapInstance.removeLayer(tileLayer);
    }
    
    let tileUrl, attribution;
    if (theme === 'dark') {
        // Premium CartoDB Dark Matter
        tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        // Premium CartoDB Voyager (Light & Detailed)
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
    
    tileLayer = L.tileLayer(tileUrl, {
        attribution: attribution,
        maxZoom: 20
    }).addTo(mapInstance);
}

/**
 * Clear existing dynamic layers on the map.
 */
export function clearMapLayers() {
    layerGroups.polygon.clearLayers();
    layerGroups.buildings.clearLayers();
    buildingMarkers.clear();
}

/**
 * Render the selected area boundary and its buildings on the map.
 * This updates layers dynamically without redrawing the entire map, maintaining zoom/center if desired.
 * @param {object} areaData - Detailed area JSON data
 * @param {boolean} fitBounds - Whether to adjust map view to fit the new data bounds
 */
export function renderAreaOnMap(areaData, fitBounds = true) {
    // 1. Clear existing layers
    clearMapLayers();
    
    if (!areaData) return;
    
    // 2. Draw Polygon
    if (areaData.area) {
        // GeoJSON coordinate order is [lng, lat], Leaflet wants [lat, lng]
        // Standard L.geoJSON handles coordinates automatically
        const polygonLayer = L.geoJSON(areaData.area.geojson, {
            style: {
                color: '#0057FF',       // 진한 파랑 외곽선
                weight: 3,              // 두께 3
                fillColor: '#00CFE8',   // 연한 청록 채우기 색상
                fillOpacity: 0.25       // 투명도 0.25
            }
        });
        
        layerGroups.polygon.addLayer(polygonLayer);
    }
    
    // 3. Draw Buildings
    if (state.filteredBuildings && state.filteredBuildings.length > 0) {
        state.filteredBuildings.forEach(bld => {
            const markerColor = bld.match_type === 'inside' ? '#0057FF' : '#F59E0B';
            
            // Create circle marker
            const marker = L.circleMarker([bld.lat, bld.lng], {
                radius: 8,
                fillColor: markerColor,
                fillOpacity: 0.85,
                color: '#FFFFFF',
                weight: 1.5,
                className: 'building-marker'
            });
            
            // Attach building properties directly to the marker for callbacks
            marker.buildingData = bld;
            
            // Leaflet Tooltip for Hover state
            const tooltipContent = `
                <div class="map-tooltip">
                    <strong>${bld.bld_nm}</strong><br/>
                    <span style="font-size: 10px; color: var(--text-secondary);">${bld.road_addr || bld.jibun_addr}</span>
                </div>
            `;
            
            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                offset: [0, -5],
                opacity: 0.95
            });
            
            // Custom Leaflet Popup for Click state
            // Offset popup to the right of the circle marker [15, 0]
            const popupContent = createBuildingPopupContent(bld);
            marker.bindPopup(popupContent, {
                maxWidth: 300,
                minWidth: 260,
                offset: [15, 0],
                className: 'custom-leaflet-popup'
            });
            
            // Interaction Event Listeners
            marker.on('mouseover', function(e) {
                // Change point color to dark gray (#374151) on hover
                this.setStyle({
                    fillColor: '#374151',
                    weight: 2
                });
            });
            
            marker.on('mouseout', function(e) {
                // Restore original color ONLY if this is not the currently selected/clicked point
                if (state.selectedBuilding !== this.buildingData) {
                    const originalColor = this.buildingData.match_type === 'inside' ? '#0057FF' : '#F59E0B';
                    this.setStyle({
                        fillColor: originalColor,
                        weight: 1.5
                    });
                }
            });
            
            marker.on('click', function(e) {
                // Keep point color dark gray (#374151) when selected
                handleMarkerSelection(this);
            });
            
            // Add marker to layer group and store in cache Map
            layerGroups.buildings.addLayer(marker);
            buildingMarkers.set(bld.pnu, marker);
        });
    }
    
    // 4. Adjust Map bounds to show the polygon/markers if requested
    if (fitBounds) {
        let bounds = null;
        if (layerGroups.polygon.getLayers().length > 0) {
            bounds = layerGroups.polygon.getBounds();
        } else if (layerGroups.buildings.getLayers().length > 0) {
            bounds = layerGroups.buildings.getBounds();
        }
        
        if (bounds && bounds.isValid()) {
            mapInstance.fitBounds(bounds, {
                padding: [40, 40],
                maxZoom: 17,
                animate: true
            });
        }
    }
}

/**
 * Handle visual selection of a building marker.
 * @param {L.CircleMarker} marker - Selected Leaflet marker
 */
function handleMarkerSelection(marker) {
    // 1. Reset styling of the previously selected marker (if any)
    if (state.selectedBuilding) {
        const prevMarker = buildingMarkers.get(state.selectedBuilding.pnu);
        if (prevMarker && prevMarker !== marker) {
            const originalColor = prevMarker.buildingData.match_type === 'inside' ? '#0057FF' : '#F59E0B';
            prevMarker.setStyle({
                fillColor: originalColor,
                weight: 1.5
            });
        }
    }
    
    // 2. Update state and keep current marker gray (#374151)
    selectBuilding(marker.buildingData);
    marker.setStyle({
        fillColor: '#374151',
        weight: 2
    });
    
    // 3. Highlight selected element in the sidebar UI
    updateBuildingSelectionInUI(marker.buildingData.pnu);
}

/**
 * Focus and highlight a building on the map programmatically (e.g. from sidebar click).
 * @param {object} bld - Building object
 */
export function focusBuildingOnMap(bld) {
    const marker = buildingMarkers.get(bld.pnu);
    if (marker) {
        // Pan to coordinate
        mapInstance.setView([bld.lat, bld.lng], Math.max(mapInstance.getZoom(), 17), {
            animate: true
        });
        
        // Select marker and open popup
        handleMarkerSelection(marker);
        marker.openPopup();
    }
}

/**
 * Reset map focus to fit the active maintenance area.
 */
export function resetMapFocus() {
    if (layerGroups.polygon.getLayers().length > 0) {
        mapInstance.fitBounds(layerGroups.polygon.getBounds(), {
            padding: [40, 40],
            animate: true
        });
    }
}

/**
 * Create HTML structure for the custom building details popup.
 * Hides PNU, match_type, distance, etc. strictly as required.
 * @param {object} bld - Building details object
 * @returns {string} HTML string
 */
function createBuildingPopupContent(bld) {
    return `
        <div class="popup-container">
            <div class="popup-header">
                <div class="popup-title">${bld.bld_nm || '건물명 없음'}</div>
            </div>
            <div class="popup-body">
                <table class="popup-table">
                    <tbody>
                        <tr>
                            <th>번지주소</th>
                            <td class="text-left">${bld.jibun_addr || '-'}</td>
                        </tr>
                        <tr>
                            <th>도로명주소</th>
                            <td class="text-left">${bld.road_addr || '-'}</td>
                        </tr>
                        <tr>
                            <th>B가용세대수</th>
                            <td>${formatNumber(bld.avail_gen_cnt)}</td>
                        </tr>
                        <tr>
                            <th>인터넷가입자수</th>
                            <td>${formatNumber(bld.int_scrbr_cnt)}</td>
                        </tr>
                        <tr>
                            <th>TV가입자수</th>
                            <td>${formatNumber(bld.tv_scrbr_cnt)}</td>
                        </tr>
                        <tr>
                            <th>SKB POP 가입자수</th>
                            <td>${formatNumber(bld.skb_pop_cnt)}</td>
                        </tr>
                        <tr>
                            <th>CATV 디지털수</th>
                            <td>${formatNumber(bld.catv_digital_cnt)}</td>
                        </tr>
                        <tr>
                            <th>CATV 인터넷수</th>
                            <td>${formatNumber(bld.catv_internet_cnt)}</td>
                        </tr>
                        <tr>
                            <th>CATV 8VSB수</th>
                            <td>${formatNumber(bld.catv_8vsb_cnt)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}
