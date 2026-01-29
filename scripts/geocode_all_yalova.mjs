/**
 * Yalova İli Tüm İlçeleri Geocoding Script
 * Yalova'nın tüm ilçelerindeki yerlerin koordinatlarını alır
 */

import mysql from 'mysql2/promise';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gezgin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Yalova ilçeleri
const yalovaDistricts = [
  'Altınova',
  'Armutlu',
  'Merkez',
  'Termal',
  'Çiftlikköy',
  'Çınarcık'
];

// Geocoding cache
const geocodingCache = new Map();

// Rate limiting için bekleme süresi (ms)
const GEOCODING_DELAY = 1000;

// Common tokens to remove from place names
const COMMON_TOKENS_TO_REMOVE = ['İBB', 'Belediyesi', 'Şehir', 'İlçe', 'Merkez', 'Mahallesi'];

// Category keywords for fallback queries
const CATEGORY_KEYWORDS = {
  nature: ['park', 'doğa', 'tabiat', 'milli park', 'şelale', 'göl', 'gölet', 'orman'],
  history: ['müze', 'tarih', 'kale', 'camii', 'kilise', 'han', 'hamam', 'türbe'],
  food: ['restoran', 'cafe', 'kafe', 'lokanta', 'ocakbaşı', 'pide', 'kebap']
};

// Text normalization: Strip diacritics and clean text
function normalizeText(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove combining marks
    .replace(/&/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Clean place name: Remove common tokens
function cleanPlaceName(name) {
  let cleaned = name;
  for (const token of COMMON_TOKENS_TO_REMOVE) {
    const regex = new RegExp(`\\b${token}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '').trim();
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

// Calculate distance between two coordinates (Haversine formula, returns km)
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

// Generate viewbox for geographic bias (30km radius)
function generateViewbox(lat, lng, radiusKm) {
  const latOffset = radiusKm / 111; // ~111 km per degree latitude
  const lngOffset = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  
  const minLat = lat - latOffset;
  const maxLat = lat + latOffset;
  const minLng = lng - lngOffset;
  const maxLng = lng + lngOffset;
  
  return `${minLng},${minLat},${maxLng},${maxLat}`;
}

// Basit ama çoklu fallback geocoding
async function geocodePlace(placeName, districtName, cityName, districtLat, districtLng) {
  const queries = [
    placeName,
    `${placeName}, Türkiye`,
    `${placeName}, ${districtName}`,
    `${placeName}, ${districtName}, Türkiye`,
    `${placeName}, ${cityName}`,
    `${placeName}, ${cityName}, Türkiye`,
    `${placeName}, ${districtName}, ${cityName}, Türkiye`
  ];

  let bestResult = null;
  let bestDistance = Infinity;
  let lastError = null;

  for (const query of queries) {
    console.log(`    🔍 Arama: "${query}"`);

    const params = new URLSearchParams();
    params.append('q', query);
    params.append('format', 'json');
    params.append('limit', '10');
    params.append('addressdetails', '1');
    params.append('countrycodes', 'tr');

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    try {
      await new Promise(resolve => setTimeout(resolve, GEOCODING_DELAY));

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TurkeyTravelApp/1.0 (contact: info@turkeytravelapp.com)',
          'Accept-Language': 'tr'
        }
      });

      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        console.log(`    ✗ HTTP ${response.status} hatası`);
        continue;
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        lastError = 'Sonuç bulunamadı';
        console.log('    ✗ Sonuç bulunamadı');
        continue;
      }

      for (const result of data) {
        const resultLat = parseFloat(result.lat);
        const resultLon = parseFloat(result.lon);
        if (isNaN(resultLat) || isNaN(resultLon)) continue;

        const distance = calculateDistance(districtLat, districtLng, resultLat, resultLon);
        // 75 km tolerans, Türkiye içi sapmalar için
        if (distance > 75) continue;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestResult = { latitude: resultLat, longitude: resultLon, distance };
        }
      }

      if (bestResult) break;

    } catch (error) {
      lastError = error.message;
      console.log(`    ✗ Hata: ${error.message}`);
      continue;
    }
  }

  if (bestResult) {
    return { success: true, coords: bestResult };
  }

  return { success: false, error: lastError || 'Uygun sonuç bulunamadı' };
}

// ASCII fold fonksiyonu
function asciiFold(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C");
}

// Normalize Turkish function
function normalizeTurkish(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// İlçe için mekanları geocode et
async function geocodeDistrictPlaces(cityName, districtName) {
  console.log(`\n📍 ${cityName} - ${districtName} için geocoding başlatılıyor...`);
  
  // district_real_details.json'dan veriyi al
  const realDetailsPath = path.join(__dirname, '..', 'district_real_details.json');
  const rawData = await readFile(realDetailsPath, 'utf-8');
  const data = JSON.parse(rawData);
  
  // İlçe verisini bul
  let districtData = null;
  if (Array.isArray(data)) {
    districtData = data.find(item => 
      normalizeTurkish(item.city) === normalizeTurkish(cityName) &&
      normalizeTurkish(item.district) === normalizeTurkish(districtName)
    );
  } else {
    const key = `${asciiFold(cityName).toLowerCase()}|${asciiFold(districtName).toLowerCase()}`;
    districtData = data[key];
  }
  
  if (!districtData) {
    console.log(`  ✗ İlçe verisi bulunamadı: ${cityName} - ${districtName}`);
    return { success: 0, fail: 0 };
  }
  
  // İlçe ID'sini ve koordinatlarını bul
  const [districts] = await db.query(
    "SELECT d.id, d.latitude, d.longitude FROM districts d JOIN cities c ON d.city_id = c.id WHERE c.name = ? AND d.name = ?",
    [cityName, districtName]
  );
  
  if (districts.length === 0) {
    console.log(`  ✗ İlçe veritabanında bulunamadı: ${cityName} - ${districtName}`);
    return { success: 0, fail: 0 };
  }
  
  const districtId = districts[0].id;
  const districtLat = districts[0].latitude;
  const districtLng = districts[0].longitude;
  console.log(`  ✓ İlçe ID: ${districtId}`);
  console.log(`  ✓ İlçe koordinatları: ${districtLat}, ${districtLng}`);
  
  // Tüm mekanları topla
  const places = [];
  
  // Doğa yerleri
  if (districtData.gezilecek_yerler?.["doğa"]) {
    districtData.gezilecek_yerler["doğa"].forEach(place => {
      places.push({
        name: place.isim || place,
        category: 'nature',
        description: place.aciklama || null
      });
    });
  }
  
  // Tarih yerleri
  if (districtData.gezilecek_yerler?.tarih) {
    districtData.gezilecek_yerler.tarih.forEach(place => {
      places.push({
        name: place.isim || place,
        category: 'history',
        description: place.aciklama || null
      });
    });
  }
  
  // Yeme-içme yerleri
  if (districtData.yeme_icme) {
    districtData.yeme_icme.forEach(place => {
      places.push({
        name: place.isim || place,
        category: 'food',
        description: place.aciklama || null
      });
    });
  }
  
  console.log(`  ✓ Toplam ${places.length} mekan bulundu`);
  
  let successCount = 0;
  let failCount = 0;
  
  // Her mekan için geocoding yap
  for (const place of places) {
    const placeName = place.name;
    console.log(`\n  🔍 ${placeName} (${place.category})...`);
    
    // Veritabanında mekanı bul
    const [existingPlaces] = await db.query(
      "SELECT id, latitude, longitude FROM places WHERE district_id = ? AND name = ? AND category = ?",
      [districtId, placeName, place.category]
    );
    
    if (existingPlaces.length === 0) {
      console.log(`  ⚠️  Mekan veritabanında bulunamadı, atlanıyor: ${placeName}`);
      failCount++;
      continue;
    }
    
    const placeId = existingPlaces[0].id;
    const existingLat = existingPlaces[0].latitude;
    const existingLng = existingPlaces[0].longitude;
    
    // Eğer koordinatlar ilçe koordinatlarıyla aynıysa, yeniden geocoding yap
    if (existingLat && existingLng && 
        parseFloat(existingLat) === parseFloat(districtLat) && 
        parseFloat(existingLng) === parseFloat(districtLng)) {
      console.log(`  ℹ Mevcut koordinat ilçe koordinatıyla aynı, yeniden geocoding yapılıyor...`);
    } else if (existingLat && existingLng) {
      console.log(`  ✓ Zaten gerçek koordinatı var: ${existingLat}, ${existingLng}`);
      successCount++;
      continue;
    }
    
    // Geocoding yap
    const result = await geocodePlace(placeName, districtName, cityName, districtLat, districtLng);
    
    if (result.success) {
      const coords = result.coords;
      const distance = coords.distance;
      
      // Validation: Handle suspicious results
      if (distance > 50) {
        console.log(`  ✗ Reddedildi: ${distance.toFixed(1)}km uzaklıkta (>50km limit)`);
        failCount++;
        continue;
      }
      
      // Valid result: Update database
      await db.query(
        "UPDATE places SET latitude = ?, longitude = ? WHERE id = ?",
        [coords.latitude, coords.longitude, placeId]
      );
      
      console.log(`  ✓ Koordinat bulundu: ${coords.latitude}, ${coords.longitude} (${distance.toFixed(1)}km uzaklıkta)`);
      console.log(`  ✓ Veritabanına kaydedildi`);
      successCount++;
    } else {
      console.log(`  ✗ Geocoding başarısız: ${result.error || 'Bilinmeyen hata'}`);
      failCount++;
    }
  }
  
  console.log(`\n✅ ${districtName} tamamlandı! Başarılı: ${successCount}, Başarısız: ${failCount}`);
  return { success: successCount, fail: failCount };
}

// Main
async function main() {
  console.log('🚀 Yalova İli Tüm İlçeleri Geocoding Başlatılıyor...\n');
  
  let totalSuccess = 0;
  let totalFail = 0;
  
  for (const districtName of yalovaDistricts) {
    try {
      const result = await geocodeDistrictPlaces('Yalova', districtName);
      totalSuccess += result.success;
      totalFail += result.fail;
    } catch (error) {
      console.error(`❌ ${districtName} için hata:`, error.message);
    }
  }
  
  console.log(`\n🎉 Tüm işlem tamamlandı!`);
  console.log(`📊 Toplam: Başarılı: ${totalSuccess}, Başarısız: ${totalFail}`);
  
  await db.end();
  process.exit(0);
}

main().catch(error => {
  console.error('\n❌ Hata:', error);
  process.exit(1);
});

