/**
 * SKB GIS System - Leaflet Map Integration & Layer Management
 */

import { state, selectBuilding } from './data.js';
import { formatNumber, getBuildingName } from './utils.js';
import { updateBuildingSelectionInUI } from './ui.js';

let mapInstance = null;
let tileLayer = null;
let myLocationMarker = null;
let myHeadingMarker = null;
let myLocationWatchId = null;
let myOrientationHandler = null;
let isLocationTracking = false;
let myLocationButtonEl = null;
let myLocationIconEl = null;
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

    // 초기 테마는 상태값(state.theme, 기본 'dark')과 일치시킴
    setMapTheme(state.theme);

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
                    <strong>${getBuildingName(bld.bld_nm)}</strong><br/>
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

/**
 * index.html의 기존 버튼(#myLocationBtn)을 내 위치 기능과 연결합니다.
 * (기존엔 별도 Leaflet Control로 떠 있어서 recenterBtn 등과 겹쳐 보이는 문제가 있었음)
 */
export function bindMyLocationButton(buttonEl) {
    if (!buttonEl) return;

    myLocationButtonEl = buttonEl;
    myLocationIconEl = buttonEl.querySelector('i');

    buttonEl.addEventListener('click', () => {
        toggleMyLocationTracking();
    });
}

/**
 * 내 위치 버튼 클릭 시 토글:
 * - 꺼진 상태에서 누르면 실시간 위치추적 + 방향(나침반) 표시 시작
 * - 켜진 상태에서 누르면 추적 중지
 */
export function toggleMyLocationTracking() {
    if (isLocationTracking) {
        stopMyLocationTracking();
    } else {
        startMyLocationTracking();
    }
}

async function startMyLocationTracking() {
    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 기능을 사용할 수 없습니다.');
        return;
    }

    // 위치/방향 센서는 보안 컨텍스트(HTTPS 또는 localhost)에서만 동작함
    if (!window.isSecureContext) {
        alert(
            '위치 기능은 보안 연결(HTTPS)에서만 동작합니다.\n' +
            '현재 페이지가 http:// 로 열려있다면 https:// 주소로 다시 접속해주세요.'
        );
        return;
    }

    // iOS 13+ 는 방향센서(DeviceOrientationEvent) 접근 전에 반드시
    // "사용자 클릭 이벤트 안에서" 명시적으로 권한을 물어봐야 함
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                startOrientationWatch();
            } else {
                console.warn('방향 센서 권한이 거부되었습니다. 위치만 추적합니다.');
            }
        } catch (e) {
            console.warn('방향 센서 권한 요청 실패, 위치만 추적합니다.', e);
        }
    } else {
        // iOS 이외 환경은 별도 권한 요청 절차 없이 바로 사용 가능
        startOrientationWatch();
    }

    isLocationTracking = true;
    setLocationButtonActive(false, true); // "찾는 중" 표시 (아직 위치 확보 전)

    let firstFix = true;

    myLocationWatchId = navigator.geolocation.watchPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const heading = position.coords.heading; // 이동 중일 때만 값이 들어옴 (정지 시 null)

            updateMyLocationMarker(lat, lng, heading);

            // 최초 위치 확보 시에만 지도 중심 이동 + 버튼을 "활성" 상태로 전환
            if (firstFix) {
                mapInstance.setView([lat, lng], 17, { animate: true });
                setLocationButtonActive(true);
                firstFix = false;
            }
        },
        error => {
            let reason = '알 수 없는 오류';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    reason = '위치 권한이 거부되었습니다. 브라우저/폰 설정에서 이 사이트의 위치 접근을 허용해주세요.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    reason = '현재 위치를 확인할 수 없습니다. GPS/위치 서비스가 켜져 있는지 확인해주세요.';
                    break;
                case error.TIMEOUT:
                    reason = '위치를 가져오는 데 시간이 너무 오래 걸립니다. 실내/지하 등 GPS 신호가 약한 곳은 아닌지 확인해주세요.';
                    break;
            }

            console.error('[내 위치] 오류:', error.code, error.message);
            alert(`현재 위치를 가져오지 못했습니다.\n\n${reason}`);
            stopMyLocationTracking();
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

function stopMyLocationTracking() {
    if (myLocationWatchId !== null) {
        navigator.geolocation.clearWatch(myLocationWatchId);
        myLocationWatchId = null;
    }

    stopOrientationWatch();

    isLocationTracking = false;
    setLocationButtonActive(false);
}

function setLocationButtonActive(active, isSearching = false) {
    if (!myLocationButtonEl) return;

    if (isSearching) {
        myLocationButtonEl.classList.remove('active');
        myLocationButtonEl.title = '내 위치 찾는 중...';
        if (myLocationIconEl) {
            myLocationIconEl.className = 'fa-solid fa-spinner fa-spin';
        }
        return;
    }

    myLocationButtonEl.classList.toggle('active', active);
    myLocationButtonEl.title = active ? '내 위치 추적 중지' : '내 위치 (방향 포함)';

    if (myLocationIconEl) {
        myLocationIconEl.className = 'fa-solid fa-location-crosshairs';
    }
}

/**
 * 위치 마커 + 방향(부채꼴) 마커를 생성하거나 갱신.
 */
function updateMyLocationMarker(lat, lng, heading) {
    if (!myLocationMarker) {
        myLocationMarker = L.circleMarker([lat, lng], {
            radius: 8,
            fillColor: '#10B981',
            fillOpacity: 0.95,
            color: '#FFFFFF',
            weight: 2
        }).addTo(mapInstance);
        myLocationMarker.bindPopup('현재 위치');
    } else {
        myLocationMarker.setLatLng([lat, lng]);
    }

    const validHeading = typeof heading === 'number' && !Number.isNaN(heading) ? heading : 0;

    if (!myHeadingMarker) {
        myHeadingMarker = L.marker([lat, lng], {
            icon: createHeadingIcon(validHeading),
            interactive: false,
            zIndexOffset: -100 // 방향 부채꼴이 위치 점 뒤(아래)에 깔리도록
        }).addTo(mapInstance);
    } else {
        myHeadingMarker.setLatLng([lat, lng]);
        if (typeof heading === 'number' && !Number.isNaN(heading)) {
            updateMyLocationHeading(heading);
        }
    }
}

/**
 * 나침반(방향) 부채꼴 아이콘. heading=0 이 정북(위쪽)을 가리키도록 그려서,
 * CSS rotate(heading deg) 값과 나침반 각도(0=북, 시계방향 증가) 단위를 일치시킴.
 */
function createHeadingIcon(heading = 0) {
    return L.divIcon({
        className: 'skb-heading-marker',
        html: `
            <div class="skb-heading-cone" style="transform: rotate(${heading}deg);">
                <svg width="52" height="52" viewBox="0 0 52 52" style="overflow:visible;">
                    <path d="M26 4 L40 34 A17 17 0 0 1 12 34 Z" fill="rgba(0,87,255,0.35)"/>
                </svg>
            </div>
        `,
        iconSize: [52, 52],
        iconAnchor: [26, 26]
    });
}

/**
 * 방향센서 값이 바뀔 때마다 아이콘을 새로 만들지 않고, DOM만 직접 회전시켜 갱신 (성능 목적).
 */
function updateMyLocationHeading(heading) {
    if (!myHeadingMarker) return;
    const el = myHeadingMarker.getElement();
    if (!el) return;
    const cone = el.querySelector('.skb-heading-cone');
    if (cone) {
        cone.style.transform = `rotate(${heading}deg)`;
    }
}

function startOrientationWatch() {
    if (myOrientationHandler) return; // 이미 리스너 등록됨

    myOrientationHandler = event => {
        let heading;

        if (typeof event.webkitCompassHeading === 'number') {
            // iOS Safari: 이미 정북 기준 나침반 방위각을 제공
            heading = event.webkitCompassHeading;
        } else if (event.alpha !== null && event.alpha !== undefined) {
            // Android 등: alpha는 반시계 기준 회전각이라 나침반 방위각으로 변환 필요
            heading = 360 - event.alpha;
        } else {
            return;
        }

        updateMyLocationHeading(heading);
    };

    // Android(Chrome)는 deviceorientationabsolute가 더 정확 (절대방위 보장)
    window.addEventListener('deviceorientationabsolute', myOrientationHandler, true);
    window.addEventListener('deviceorientation', myOrientationHandler, true);
}

function stopOrientationWatch() {
    if (!myOrientationHandler) return;

    window.removeEventListener('deviceorientationabsolute', myOrientationHandler, true);
    window.removeEventListener('deviceorientation', myOrientationHandler, true);
    myOrientationHandler = null;
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
                <div class="popup-title">${getBuildingName(bld.bld_nm)}</div>
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
