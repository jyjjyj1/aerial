/**
 * SKB GIS System - Leaflet Map Integration & Layer Management
 */

import { state, selectBuilding } from './data.js';
import { formatNumber } from './utils.js';
import { updateBuildingSelectionInUI } from './ui.js';

let mapInstance = null;
let tileLayer = null;
let myLocationMarker = null;
let searchResultMarker = null;

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
    }).setView([37.5665, 126.9780], 12);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(mapInstance);

    Object.values(layerGroups).forEach(group => {
        group.addTo(mapInstance);
    });

    // 기본 배경은 낮 배경
    setMapTheme(state.theme);

    addMyLocationControl();
    addAddressSearchControl();

    setTimeout(() => {
        mapInstance.invalidateSize();
    }, 300);

    window.addEventListener('resize', () => {
        if (mapInstance) {
            setTimeout(() => mapInstance.invalidateSize(), 200);
        }
    });

    return mapInstance;
}

export function setMapTheme(theme) {
    state.theme = theme || 'light';

    if (!mapInstance) return;

    if (tileLayer) {
        mapInstance.removeLayer(tileLayer);
    }

    let tileUrl;
    let attribution;

    if (state.theme === 'dark') {
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
        attribution: attribution,
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

    if (!areaData || !areaData.area) return;

    // 정비구역 Polygon
    if (areaData.area.geojson) {
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

    // 건물 마커
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
                    <span style="font-size:10px;">${bld.road_addr || bld.jibun_addr || '-'}</span>
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
        fitCurrentBounds();
    }
}

function fitCurrentBounds() {
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
        mapInstance.setView(
            [Number(bld.lat), Number(bld.lng)],
            Math.max(mapInstance.getZoom(), 17),
            { animate: true }
        );

        handleMarkerSelection(marker);
        marker.openPopup();
    }
}

export function resetMapFocus() {
    fitCurrentBounds();
}

function addMyLocationControl() {
    const LocationControl = L.Control.extend({
        options: {
            position: 'topright'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-bar skb-location-control');
            const button = L.DomUtil.create('button', '', container);

            button.type = 'button';
            button.title = '내 위치';
            button.innerHTML = '📍';
            button.style.width = '36px';
            button.style.height = '36px';
            button.style.border = 'none';
            button.style.background = '#ffffff';
            button.style.cursor = 'pointer';
            button.style.fontSize = '18px';

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(button, 'click', function () {
                moveToMyLocation();
            });

            return container;
        }
    });

    mapInstance.addControl(new LocationControl());
}

function moveToMyLocation() {
    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 기능을 사용할 수 없습니다.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            if (myLocationMarker) {
                mapInstance.removeLayer(myLocationMarker);
            }

            myLocationMarker = L.circleMarker([lat, lng], {
                radius: 9,
                fillColor: '#10B981',
                fillOpacity: 0.9,
                color: '#FFFFFF',
                weight: 2
            }).addTo(mapInstance);

            myLocationMarker.bindPopup('현재 위치').openPopup();

            mapInstance.setView([lat, lng], 17, {
                animate: true
            });
        },
        error => {
            alert('현재 위치를 가져오지 못했습니다. 브라우저 위치 권한을 확인하세요.');
            console.error(error);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );
}

function addAddressSearchControl() {
    const SearchControl = L.Control.extend({
        options: {
            position: 'topleft'
        },

        onAdd: function () {
            const container = L.DomUtil.create('div', 'skb-address-search');

            container.innerHTML = `
                <div style="
                    background:#ffffff;
                    padding:8px;
                    border-radius:8px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.25);
                    display:flex;
                    gap:6px;
                    align-items:center;
                    max-width:320px;
                ">
                    <input 
                        id="skbAddressInput"
                        type="text"
                        placeholder="주소 검색"
                        style="
                            width:220px;
                            height:32px;
                            border:1px solid #d1d5db;
                            border-radius:6px;
                            padding:0 8px;
                            font-size:13px;
                        "
                    />
                    <button 
                        id="skbAddressSearchBtn"
                        type="button"
                        style="
                            height:32px;
                            padding:0 10px;
                            border:none;
                            border-radius:6px;
                            background:#0057FF;
                            color:#ffffff;
                            font-size:13px;
                            cursor:pointer;
                        "
                    >검색</button>
                </div>
            `;

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.disableScrollPropagation(container);

            setTimeout(() => {
                const input = container.querySelector('#skbAddressInput');
                const button = container.querySelector('#skbAddressSearchBtn');

                button.addEventListener('click', () => {
                    searchAddress(input.value);
                });

                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') {
                        searchAddress(input.value);
                    }
                });
            }, 0);

            return container;
        }
    });

    mapInstance.addControl(new SearchControl());
}

async function searchAddress(query) {
    const keyword = String(query || '').trim();

    if (!keyword) {
        alert('검색할 주소를 입력하세요.');
        return;
    }

    try {
        const url =
            'https://nominatim.openstreetmap.org/search?' +
            new URLSearchParams({
                q: keyword,
                format: 'json',
                limit: '1',
                countrycodes: 'kr'
            }).toString();

        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`주소 검색 실패: ${response.status}`);
        }

        const results = await response.json();

        if (!results || results.length === 0) {
            alert('검색 결과가 없습니다.');
            return;
        }

        const lat = Number(results[0].lat);
        const lng = Number(results[0].lon);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            alert('검색 결과 좌표가 올바르지 않습니다.');
            return;
        }

        if (searchResultMarker) {
            mapInstance.removeLayer(searchResultMarker);
        }

        searchResultMarker = L.marker([lat, lng]).addTo(mapInstance);
        searchResultMarker.bindPopup(results[0].display_name || keyword).openPopup();

        mapInstance.setView([lat, lng], 17, {
            animate: true
        });
    } catch (error) {
        console.error(error);
        alert('주소 검색 중 오류가 발생했습니다.');
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
