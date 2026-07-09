/**
 * SKB GIS System - Leaflet Map Integration & Layer Management
 */

import { state, selectBuilding } from './data.js';
import { formatNumber } from './utils.js';
import { updateBuildingSelectionInUI } from './ui.js';

let mapInstance = null;
let tileLayer = null;

export const layerGroups = {
    polygon: L.featureGroup(),
    buildings: L.featureGroup(),
    poles: L.featureGroup(),
    cables: L.featureGroup(),
    construction: L.featureGroup()
};

const buildingMarkers = new Map();

export function initMap(domId) {
    if (mapInstance) return mapInstance;

    mapInstance = L.map(domId, {
        zoomControl: false,
        attributionControl: true
    }).setView([37.4979, 127.0276], 15);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(mapInstance);

    Object.values(layerGroups).forEach(group => {
        group.addTo(mapInstance);
    });

    setMapTheme(state.theme);

    return mapInstance;
}

export function setMapTheme(theme) {
    state.theme = theme;

    if (!mapInstance) return;

    if (tileLayer) {
        mapInstance.removeLayer(tileLayer);
    }

    let tileUrl, attribution;

    if (theme === 'dark') {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        tileUrl = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
        attribution = '&copy; OpenStreetMap contributors &copy; CARTO';
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }

    tileLayer = L.tileLayer(tileUrl, {
        attribution,
        maxZoom: 20
    }).addTo(mapInstance);
}

export function clearMapLayers() {
    layerGroups.polygon.clearLayers();
    layerGroups.buildings.clearLayers();
    buildingMarkers.clear();
}

export function renderAreaOnMap(areaData, fitBounds = true) {
    clearMapLayers();

    if (!areaData || !mapInstance) return;

    if (areaData.area && areaData.area.geojson) {
        const polygonLayer = L.geoJSON(areaData.area.geojson, {
            style: {
                color: '#0057FF',
                weight: 3,
                fillColor: '#00CFE8',
                fillOpacity: 0.25
            }
        });

        layerGroups.polygon.addLayer(polygonLayer);
    }

    if (state.filteredBuildings && state.filteredBuildings.length > 0) {
        state.filteredBuildings.forEach(bld => {
            const lat = Number(bld.lat);
            const lng = Number(bld.lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                return;
            }

            const markerColor = bld.match_type === 'inside' ? '#0057FF' : '#F59E0B';

            const marker = L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: markerColor,
                fillOpacity: 0.85,
                color: '#FFFFFF',
                weight: 1.5,
                className: 'building-marker'
            });

            marker.buildingData = bld;

            const tooltipContent = `
                <div class="map-tooltip">
                    <strong>${bld.bld_nm || 'N/A'}</strong><br/>
                    <span style="font-size: 10px;">${bld.road_addr || bld.jibun_addr || '-'}</span>
                </div>
            `;

            marker.bindTooltip(tooltipContent, {
                direction: 'top',
                offset: [0, -5],
                opacity: 0.95
            });

            marker.bindPopup(createBuildingPopupContent(bld), {
                maxWidth: 300,
                minWidth: 260,
                offset: [15, 0],
                className: 'custom-leaflet-popup'
            });

            marker.on('mouseover', function () {
                this.setStyle({
                    fillColor: '#374151',
                    weight: 2
                });
            });

            marker.on('mouseout', function () {
                if (state.selectedBuilding !== this.buildingData) {
                    const originalColor = this.buildingData.match_type === 'inside' ? '#0057FF' : '#F59E0B';
                    this.setStyle({
                        fillColor: originalColor,
                        weight: 1.5
                    });
                }
            });

            marker.on('click', function () {
                handleMarkerSelection(this);
            });

            layerGroups.buildings.addLayer(marker);
            buildingMarkers.set(bld.pnu, marker);
        });
    }

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

function handleMarkerSelection(marker) {
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

    selectBuilding(marker.buildingData);

    marker.setStyle({
        fillColor: '#374151',
        weight: 2
    });

    updateBuildingSelectionInUI(marker.buildingData.pnu);
}

export function focusBuildingOnMap(bld) {
    const marker = buildingMarkers.get(bld.pnu);

    if (marker) {
        mapInstance.setView([Number(bld.lat), Number(bld.lng)], Math.max(mapInstance.getZoom(), 17), {
            animate: true
        });

        handleMarkerSelection(marker);
        marker.openPopup();
    }
}

export function resetMapFocus() {
    if (layerGroups.polygon.getLayers().length > 0) {
        mapInstance.fitBounds(layerGroups.polygon.getBounds(), {
            padding: [40, 40],
            animate: true
        });
    }
}

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
