/**
 * Route Planner Module
 * Handles map display, place markers, and route planning
 */

let routeMap = null;
let placeMarkers = [];
let selectedPlaces = [];
let routePolyline = null;
let currentDistrictId = null;
let routeGeoJsonLayer = null;
let currentMode = 'driving-car';
let lastRouteSummary = null;
let routeSegments = [];
const ORS_API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImMxNDFmNDMyMzFjMzQ1Yjk4MmQwYjBiNDgzYThmOTM5IiwiaCI6Im11cm11cjY0In0='; // Replace with your OpenRouteService API key

// Initialize Route Planner
document.addEventListener('DOMContentLoaded', function () {
  const closeBtn = document.getElementById('close-route-planner');
  const loadPlacesBtn = document.getElementById('load-places-btn');
  const optimizeRouteBtn = document.getElementById('optimize-route-btn');
  const clearRouteBtn = document.getElementById('clear-route-btn');
  const modeSelect = document.getElementById('route-mode');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeRoutePlanner);
  }

  if (loadPlacesBtn) {
    loadPlacesBtn.addEventListener('click', loadPlacesForDistrict);
  }

  if (optimizeRouteBtn) {
    optimizeRouteBtn.addEventListener('click', optimizeRoute);
  }

  if (clearRouteBtn) {
    clearRouteBtn.addEventListener('click', clearRoute);
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      currentMode = modeSelect.value || 'driving-car';
      updateRouteDisplay();
    });
  }
});

// Open Route Planner
function openRoutePlanner(districtId) {
  currentDistrictId = districtId;
  const container = document.getElementById('route-planner-container');
  if (!container) return;

  container.style.display = 'block';

  // Initialize map if not already initialized
  if (!routeMap) {
    initMap();
  }

  // Load places for district
  loadPlacesForDistrict();
}

// Close Route Planner
function closeRoutePlanner() {
  const container = document.getElementById('route-planner-container');
  if (container) {
    container.style.display = 'none';
  }
}

// Initialize Leaflet Map
function initMap() {
  const mapContainer = document.getElementById('route-map');
  if (!mapContainer || routeMap) return;

  // Default center: Turkey center
  routeMap = L.map('route-map').setView([39.0, 35.0], 6);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(routeMap);
}

// Load places for current district
async function loadPlacesForDistrict() {
  if (!currentDistrictId) {
    alert('Lütfen önce bir ilçe seçin');
    return;
  }

  const category = document.getElementById('category-filter')?.value || '';

  try {
    const authToken = localStorage.getItem('authToken');
    if (!authToken) {
      throw new Error('Giriş yapmanız gerekiyor');
    }

    let url = `/api/districts/${currentDistrictId}/places?include_coords=true`;
    if (category) url += `&category=${category}`;

    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      throw new Error('Yerler yüklenemedi');
    }

    const data = await res.json();
    displayPlacesOnMap(data.places || []);

  } catch (error) {
    console.error('Error loading places:', error);
    alert('Yerler yüklenirken bir hata oluştu');
  }
}

// Display places on map as markers
function displayPlacesOnMap(places) {
  // Clear existing markers
  clearMarkers();

  if (!routeMap || !places || places.length === 0) {
    return;
  }

  const bounds = [];

  places.forEach(place => {
    const lat = place.latitude || place.lat;
    const lng = place.longitude || place.lng;

    if (!lat || !lng) return;

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) return;

    // Create marker icon based on category
    const iconColor = getCategoryColor(place.category);
    const icon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${iconColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const marker = L.marker([latNum, lngNum], { icon }).addTo(routeMap);

    // Create popup
    const popupContent = createPlacePopup(place);
    marker.bindPopup(popupContent);

    placeMarkers.push({ marker, place });
    bounds.push([latNum, lngNum]);
  });

  // Fit map to show all markers
  if (bounds.length > 0) {
    routeMap.fitBounds(bounds, { padding: [50, 50] });
  }
}

// Get color for category
function getCategoryColor(category) {
  const colors = {
    nature: '#4CAF50',
    history: '#FF9800',
    food: '#F44336'
  };
  return colors[category] || '#666';
}

// Create popup content for place
function createPlacePopup(place) {
  const categoryNames = {
    nature: 'Doğa',
    history: 'Tarih',
    food: 'Yemek'
  };

  const costNames = {
    free: 'Ücretsiz',
    low: 'Düşük',
    medium: 'Orta',
    high: 'Yüksek'
  };

  const isSelected = selectedPlaces.some(p => p.id === place.id);

  return `
    <div class="place-popup">
      <h4>${place.name}</h4>
      <p><strong>Kategori:</strong> ${categoryNames[place.category] || place.category}</p>
      <p><strong>Fiyat:</strong> ${costNames[place.cost_level] || place.cost_level}</p>
      <p><strong>Süre:</strong> ${place.average_visit_time || 60} dakika</p>
      <button class="add-to-route-btn ${isSelected ? 'added' : ''}" 
              onclick="addPlaceToRoute(${place.id})" 
              ${isSelected ? 'disabled' : ''}>
        ${isSelected ? '✓ Rotaya Eklendi' : 'Rotaya Ekle'}
      </button>
    </div>
  `;
}

// Add place to route
function addPlaceToRoute(placeId) {
  const markerData = placeMarkers.find(m => m.place.id === placeId);
  if (!markerData) return;

  const place = markerData.place;

  // Check if already added
  if (selectedPlaces.some(p => p.id === place.id)) {
    return;
  }

  selectedPlaces.push(place);
  updateSelectedPlacesList();
  updateRouteButtons();
  updateRouteDisplay();

  // Update popup
  markerData.marker.setPopupContent(createPlacePopup(place));
}

// Remove place from route
function removePlaceFromRoute(placeId) {
  selectedPlaces = selectedPlaces.filter(p => p.id !== placeId);
  updateSelectedPlacesList();
  updateRouteButtons();
  updateRouteDisplay();

  // Update marker popup
  const markerData = placeMarkers.find(m => m.place.id === placeId);
  if (markerData) {
    markerData.marker.setPopupContent(createPlacePopup(markerData.place));
  }
}

// Update selected places list
function updateSelectedPlacesList() {
  const listContainer = document.getElementById('selected-places-list');
  if (!listContainer) return;

  if (selectedPlaces.length === 0) {
    listContainer.innerHTML = '<p class="empty-message">Henüz yer seçilmedi</p>';
    return;
  }

  const categoryNames = {
    nature: 'Doğa',
    history: 'Tarih',
    food: 'Yemek'
  };

  listContainer.innerHTML = selectedPlaces.map((place, index) => {
    const seg = index === 0 ? null : routeSegments[index - 1];
    // Check both direct properties and nested summary for segment data
    const segDistanceVal = seg?.distance || seg?.summary?.distance || 0;
    const segDurationVal = seg?.duration || seg?.summary?.duration || 0;
    const segDistance = segDistanceVal ? `${(segDistanceVal / 1000).toFixed(1)} km` : '';
    const segDuration = segDurationVal ? `${Math.max(1, Math.round(segDurationVal / 60))} dk` : '';
    const travelInfo = index === 0
      ? 'Başlangıç'
      : `${segDistance || '—'} ${segDistance && segDuration ? '•' : ''} ${segDuration || ''}`.trim();

    return `
    <div class="place-item" data-place-id="${place.id}">
      <div class="place-item-header">
        <div>
          <div class="place-item-name">${index + 1}. ${place.name}</div>
          <div class="place-item-category">${categoryNames[place.category] || place.category}</div>
        </div>
        <button class="remove-place-btn" onclick="removePlaceFromRoute(${place.id})">×</button>
      </div>
      <div class="place-item-info">
        ${travelInfo || 'Süre hesaplanıyor...'}
      </div>
    </div>
  `;
  }).join('');
}

// Update route buttons state
function updateRouteButtons() {
  const optimizeBtn = document.getElementById('optimize-route-btn');
  const clearBtn = document.getElementById('clear-route-btn');

  const hasPlaces = selectedPlaces.length > 0;

  if (optimizeBtn) optimizeBtn.disabled = !hasPlaces || selectedPlaces.length < 2;
  if (clearBtn) clearBtn.disabled = !hasPlaces;
}

// Optimize route (simple nearest neighbor)
function optimizeRoute() {
  if (selectedPlaces.length < 2) return;

  // Simple nearest neighbor algorithm
  const optimized = [selectedPlaces[0]];
  const remaining = [...selectedPlaces.slice(1)];

  let current = selectedPlaces[0];

  while (remaining.length > 0) {
    let nearest = null;
    let nearestDistance = Infinity;
    let nearestIndex = -1;

    remaining.forEach((place, index) => {
      const distance = calculateDistance(
        parseFloat(current.latitude || current.lat),
        parseFloat(current.longitude || current.lng),
        parseFloat(place.latitude || place.lat),
        parseFloat(place.longitude || place.lng)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = place;
        nearestIndex = index;
      }
    });

    if (nearest) {
      optimized.push(nearest);
      remaining.splice(nearestIndex, 1);
      current = nearest;
    }
  }

  selectedPlaces = optimized;
  updateSelectedPlacesList();
  updateRouteDisplay();
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Update route display on map
function updateRouteDisplay() {
  if (!routeMap) return;

  if (selectedPlaces.length < 2) {
    clearRouteLayer();
    updateRouteInfo();
    return;
  }

  requestRouteFromORS();
}

function clearRouteLayer() {
  if (routePolyline) {
    routeMap.removeLayer(routePolyline);
    routePolyline = null;
  }
  if (routeGeoJsonLayer) {
    routeMap.removeLayer(routeGeoJsonLayer);
    routeGeoJsonLayer = null;
  }
  lastRouteSummary = null;
  routeSegments = [];
}

async function requestRouteFromORS() {
  const coords = selectedPlaces
    .map(p => {
      const lat = parseFloat(p.latitude || p.lat);
      const lng = parseFloat(p.longitude || p.lng);
      if (isNaN(lat) || isNaN(lng)) return null;
      return [lng, lat]; // lng-lat order for ORS
    })
    .filter(Boolean);

  if (coords.length < 2) {
    clearRouteLayer();
    updateRouteInfo();
    return;
  }

  try {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${currentMode}/geojson`, {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        coordinates: coords
      })
    });

    if (!res.ok) {
      throw new Error(`ORS error ${res.status}`);
    }

    const data = await res.json();
    const feature = data.features?.[0];
    const properties = feature?.properties;
    const segment = properties?.segments?.[0];
    const summary = properties?.summary || segment?.summary || segment;
    const aggregated = aggregateSummaryFromSegments(properties?.segments);
    const effectiveSummary = aggregated || summary || { distance: 0, duration: 0 };
    console.debug('ORS summary', { summary, aggregated, effectiveSummary, segments: properties?.segments });

    if (!feature) {
      throw new Error('Rota bilgisi alınamadı');
    }

    // Render GeoJSON - önce temizle, sonra değerleri ata
    clearRouteLayer();

    lastRouteSummary = effectiveSummary;
    routeSegments = properties?.segments || [];
    routeGeoJsonLayer = L.geoJSON(feature, {
      style: {
        color: '#1d4ed8',
        weight: 4,
        opacity: 0.85
      }
    }).addTo(routeMap);

    if (routeGeoJsonLayer) {
      const bounds = routeGeoJsonLayer.getBounds();
      if (bounds.isValid()) {
        routeMap.fitBounds(bounds, { padding: [50, 50] });
      }
    }

    updateRouteInfo(lastRouteSummary);
    updateSelectedPlacesList();
  } catch (error) {
    console.error('ORS route error:', error);
    alert('Rota hesaplanamadı. Lütfen tekrar deneyin veya farklı mod seçin.');
    clearRouteLayer();
    updateRouteInfo();
  }
}

// Update route info (distance and time)
function updateRouteInfo(summary) {
  const distanceEl = document.getElementById('total-distance');
  const timeEl = document.getElementById('total-time');
  const routeInfo = document.getElementById('route-info');
  const routeSummaryEl = document.getElementById('route-summary');

  if (!distanceEl || !timeEl || !routeInfo || !routeSummaryEl) return;

  const distanceMeters = parseFloat(summary?.distance) || 0;
  const durationSeconds = parseFloat(summary?.duration) || 0;
  const distanceKm = (distanceMeters / 1000).toFixed(1);
  const durationMin = Math.max(1, Math.round(durationSeconds / 60));

  distanceEl.textContent = distanceKm;
  timeEl.textContent = durationMin;
  routeInfo.style.display = 'block';
  routeSummaryEl.style.display = 'block';
  routeSummaryEl.textContent = `Toplam: ${distanceKm} km • ${durationMin} dk (${modeLabel(currentMode)})`;
}

// Clear route
function clearRoute() {
  selectedPlaces = [];
  updateSelectedPlacesList();
  updateRouteButtons();
  clearRouteLayer();
  updateRouteInfo();
  updateRouteButtons();

  // Update all popups
  placeMarkers.forEach(m => {
    m.marker.setPopupContent(createPlacePopup(m.place));
  });
}

// Clear markers
function clearMarkers() {
  placeMarkers.forEach(({ marker }) => {
    routeMap.removeLayer(marker);
  });
  placeMarkers = [];
}

// Make functions globally available
window.addPlaceToRoute = addPlaceToRoute;
window.removePlaceFromRoute = removePlaceFromRoute;

function modeLabel(mode) {
  if (mode === 'foot-walking') return 'Yürüyüş';
  if (mode === 'cycling-regular') return 'Bisiklet';
  return 'Araba';
}

function aggregateSummaryFromSegments(segments) {
  if (!segments || !segments.length) return null;

  const distance = segments.reduce((sum, s) => {
    // Check both direct properties and nested summary
    const segDistance = Number(s.distance) || Number(s.summary?.distance) || 0;
    return sum + segDistance;
  }, 0);

  const duration = segments.reduce((sum, s) => {
    // Check both direct properties and nested summary
    const segDuration = Number(s.duration) || Number(s.summary?.duration) || 0;
    return sum + segDuration;
  }, 0);

  return { distance, duration };
}

function hasDistanceDuration(obj) {
  if (!obj) return false;
  const d = Number(obj.distance);
  const t = Number(obj.duration);
  return !isNaN(d) && !isNaN(t) && d > 0 && t > 0;
}

