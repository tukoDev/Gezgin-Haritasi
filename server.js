import express from "express";
import mysql from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import { readFile } from "fs/promises";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// JSON body parser
app.use(express.json());

// public klasörünü sun - cache'i devre dışı bırak
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, path) => {
    if (path.endsWith('.js') || path.endsWith('.html') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Root path için public/index.html'i serve et
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const REAL_DETAILS_PATH = path.join(__dirname, "district_real_details.json");

const asciiFold = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C");

const escapeHtml = (unsafe = "") =>
  unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const renderPlacesHtml = (places = []) => {
  if (!places || places.length === 0) {
    return "";
  }
  const items = places
    .map((place) => {
      const name = escapeHtml(place?.isim || "");
      const description = escapeHtml(place?.aciklama || "");
      const photoUrl = place?.resim ? encodeURI(place.resim) : "";
      const photoAnchor = photoUrl
        ? ` <a href="${photoUrl}" target="_blank" rel="noopener">Fotoğraf</a>`
        : "";
      return `<li><strong>${name}</strong>: ${description}${photoAnchor}</li>`;
    })
    .join("");

  return `<ul>${items}</ul>`;
};

const realDetailsMap = new Map();

const loadRealDetails = async () => {
  try {
    const raw = await readFile(REAL_DETAILS_PATH, "utf-8");
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      for (const item of data) {
        const key = `${asciiFold(item.city || "").toLowerCase()}|${asciiFold(
          item.district || ""
        ).toLowerCase()}`;
        realDetailsMap.set(key, item);
      }
      console.log(
        `✅ district_real_details.json yüklendi. Toplam kayıt: ${realDetailsMap.size}`
      );
    }
  } catch (error) {
    console.warn(
      "⚠️  district_real_details.json yüklenemedi veya parse edilemedi:",
      error.message
    );
  }
};

await loadRealDetails();

const isEmptyContent = (value) => {
  if (value === null || value === undefined) {
    return true;
  }

  const trimmed = String(value).trim();

  if (!trimmed || trimmed === "[]" || trimmed === "{}" || trimmed === "null") {
    return true;
  }

  // Some legacy records might store empty arrays as JSON string with whitespace.
  const normalized = trimmed.replace(/\s+/g, "");
  return normalized === "[]" || normalized === "{}";
};

// MySQL bağlantısı
const db = await mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "gezgin",
  charset: 'utf8mb4'
});

// Türkçe karakterleri normalize eden fonksiyon
function normalizeTurkish(str) {
  if (!str) return '';
  
  // Unicode normalizasyonu yap (NFD -> NFC)
  let normalized = str.normalize('NFD');
  
  // Türkçe karakterleri değiştir (büyük/küçük harf farkı olmadan)
  normalized = normalized
    .replace(/[\u011F\u011E]/g, 'g')  // ğ, Ğ
    .replace(/[\u00FC\u00DC]/g, 'u')  // ü, Ü
    .replace(/[\u015F\u015E]/g, 's')  // ş, Ş
    .replace(/[\u0131\u0130\u0049]/g, 'i')  // ı, İ, I
    .replace(/[\u00F6\u00D6]/g, 'o')  // ö, Ö
    .replace(/[\u00E7\u00C7]/g, 'c')  // ç, Ç
    .replace(/[\u0300-\u036f]/g, '')  // Diacritics'i kaldır
    .toLowerCase()
    .trim();
  
  return normalized;
}

// API endpoint
app.get("/api/districts", async (req, res) => {
  const city = req.query.city;
  console.log("API çağrısı - şehir slug:", city);
  
  try {
    if (!city) {
      return res.status(400).json({ error: "Şehir parametresi gerekli" });
    }
    
    // Slug'ı normalize et
    const normalizedSlug = normalizeTurkish(city);
    console.log("Normalize edilmiş slug:", normalizedSlug);
    
    // Önce tüm şehirleri al ve normalize et
    const [allCities] = await db.query("SELECT id, name FROM cities");
    console.log("Toplam şehir sayısı:", allCities.length);
    
    let searchName = null;
    for (const cityRow of allCities) {
      const normalizedCityName = normalizeTurkish(cityRow.name);
      if (normalizedCityName === normalizedSlug) {
        searchName = cityRow.name;
        console.log("Eşleşen şehir bulundu:", cityRow.name, "-> normalize:", normalizedCityName);
        break;
      }
    }
    
    if (!searchName) {
      console.log("Şehir bulunamadı (normalize edildi):", normalizedSlug);
      console.log("İlk 10 şehir örneği:", allCities.slice(0, 10).map(c => `${c.name} -> ${normalizeTurkish(c.name)}`));
      return res.json([]);
    }
    
    console.log("Aranan şehir slug:", city);
    console.log("Bulunan şehir adı:", searchName);
    
    // Şehri bul
    const [cityRows] = await db.query(
      "SELECT id, name FROM cities WHERE name = ?",
      [searchName]
    );
    
    if (cityRows.length === 0) {
      console.log("Şehir bulunamadı:", searchName);
      return res.json([]);
    }
    
    const cityId = cityRows[0].id;
    const cityName = cityRows[0].name;
    console.log("Bulunan şehir ID:", cityId, "Şehir adı:", cityName);
    
    // districts tablosundan city_id ile ilçeleri getir
    const [districts] = await db.query(
      "SELECT id, name, city_id FROM districts WHERE city_id = ? ORDER BY name",
      [cityId]
    );
    
    console.log("Bulunan ilçe sayısı:", districts.length);
    
    // Response'u normalize et (name field'ını kullan)
    const result = districts.map(district => ({
      id: district.id,
      name: district.name,
      district_name: district.name,
      city_id: district.city_id
    }));
    
    res.json(result);
  } catch (err) {
    console.error("Database error:", err);
    console.error("Hata detayı:", err.stack);
    res.status(500).json({ error: "Veritabanı hatası: " + err.message });
  }
});

// İlçe detayları API endpoint
app.get("/api/district/:id", async (req, res) => {
  const districtId = req.params.id;
  console.log("İlçe detayları API çağrısı - ilçe ID:", districtId);
  
  try {
    // İlçe bilgisini getir
    const [districts] = await db.query(
      "SELECT d.id, d.name, d.city_id, c.name as city_name FROM districts d JOIN cities c ON d.city_id = c.id WHERE d.id = ?",
      [districtId]
    );
    
    if (districts.length === 0) {
      return res.status(404).json({ error: "İlçe bulunamadı" });
    }
    
    const district = districts[0];
    
    // İlçe detaylarını getir
    const [details] = await db.query(
      "SELECT * FROM district_details WHERE district_id = ?",
      [districtId]
    );
    
    // Eğer detay yoksa boş bir yapı döndür
    const detail = details.length > 0 ? details[0] : {
      general_info: null,
      nature_places: null,
      historical_places: null,
      food_drink: null
    };
    
    // Önce district_real_details.json'dan veriyi kontrol et
    const realKey = `${asciiFold(district.city_name).toLowerCase()}|${asciiFold(
      district.name
    ).toLowerCase()}`;
    const realDetail = realDetailsMap.get(realKey);

    // district_real_details.json'da veri varsa öncelikli olarak kullan
    let general_info = "";
    let nature_places = "";
    let historical_places = "";
    let food_drink = "";

    if (realDetail) {
      // district_real_details.json'dan veri varsa onu kullan
      general_info = realDetail.genel_bilgi || "";
      nature_places = renderPlacesHtml(
          realDetail?.gezilecek_yerler?.["doğa"] || []
        );
      historical_places = renderPlacesHtml(
          realDetail?.gezilecek_yerler?.tarih || []
        );
      food_drink = renderPlacesHtml(
          realDetail?.yeme_icme || []
        );
    } else {
      // district_real_details.json'da yoksa veritabanından al
      general_info = detail.general_info || "";
      nature_places = detail.nature_places || "";
      historical_places = detail.historical_places || "";
      food_drink = detail.food_drink || "";
    }

    const responsePayload = {
      id: district.id,
      name: district.name,
      city_id: district.city_id,
      city_name: district.city_name,
      general_info: general_info,
      nature_places: nature_places,
      historical_places: historical_places,
      food_drink: food_drink
    };

    res.json(responsePayload);
  } catch (err) {
    console.error("Database error:", err);
    console.error("Hata detayı:", err.stack);
    res.status(500).json({ error: "Veritabanı hatası: " + err.message });
  }
});

// Kullanıcı kaydı endpoint
app.post("/api/register", async (req, res) => {
  const { email, password, age, city_id } = req.body;
  
  try {
    // Validasyon
    if (!email || !password) {
      return res.status(400).json({ error: "Email ve şifre gerekli" });
    }
    
    if (!age || age < 1 || age > 120) {
      return res.status(400).json({ error: "Geçerli bir yaş giriniz (1-120)" });
    }
    
    if (!city_id) {
      return res.status(400).json({ error: "Lütfen yaşadığınız ili seçiniz" });
    }
    
    // Şehir ID'sinin geçerli olup olmadığını kontrol et
    const [cityCheck] = await db.query(
      "SELECT id FROM cities WHERE id = ?",
      [city_id]
    );
    
    if (cityCheck.length === 0) {
      return res.status(400).json({ error: "Geçersiz şehir seçimi" });
    }
    
    // Email format kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Geçerli bir email adresi giriniz" });
    }
    
    // Sadece @gmail.com uzantılı mailleri kabul et
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: "Sadece @gmail.com uzantılı email adresleri kabul edilmektedir" });
    }
    
    // Şifre uzunluk kontrolü
    if (password.length < 6) {
      return res.status(400).json({ error: "Şifre en az 6 karakter olmalıdır" });
    }
    
    // Email zaten kayıtlı mı kontrol et
    const [existingUsers] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ error: "Bu email adresi zaten kayıtlı" });
    }
    
    // Şifreyi hash'le
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Kullanıcıyı veritabanına ekle
    const [result] = await db.query(
      "INSERT INTO users (email, password, age, city_id) VALUES (?, ?, ?, ?)",
      [email, hashedPassword, age, city_id]
    );
    
    res.json({ 
      success: true, 
      message: "Kullanıcı başarıyla kaydedildi",
      userId: result.insertId
    });
  } catch (err) {
    console.error("Kayıt hatası:", err);
    res.status(500).json({ error: "Kayıt sırasında bir hata oluştu: " + err.message });
  }
});

// Şehirler listesi endpoint
app.get("/api/cities", async (req, res) => {
  try {
    const [cities] = await db.query(
      "SELECT id, name FROM cities ORDER BY name ASC"
    );
    res.json(cities);
  } catch (err) {
    console.error("Şehirler yüklenirken hata:", err);
    res.status(500).json({ error: "Şehirler yüklenemedi" });
  }
});

// Kullanıcı girişi endpoint
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  
  try {
    // Validasyon
    if (!email || !password) {
      return res.status(400).json({ error: "Email ve şifre gerekli" });
    }
    
    // Kullanıcıyı bul
    const [users] = await db.query(
      "SELECT id, email, password FROM users WHERE email = ?",
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: "Email veya şifre hatalı" });
    }
    
    const user = users[0];
    
    // Şifreyi kontrol et
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: "Email veya şifre hatalı" });
    }
    
    // JWT token oluştur
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    
    res.json({ 
      success: true, 
      message: "Giriş başarılı",
      token: token,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Giriş hatası:", err);
    res.status(500).json({ error: "Giriş sırasında bir hata oluştu: " + err.message });
  }
});

// Token doğrulama middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: "Token gerekli" });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Geçersiz veya süresi dolmuş token" });
    }
    req.user = user;
    next();
  });
};

// HTML'den yer isimlerini parse et
function parsePlaceNamesFromHtml(html) {
  if (!html) return [];
  
  // HTML'den <li> veya <p> içindeki metinleri regex ile çıkar
  const placeNames = [];
  
  // <li> etiketlerini bul
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi);
  if (liMatches) {
    liMatches.forEach(match => {
      // HTML etiketlerini temizle
      const text = match.replace(/<[^>]+>/g, '').trim();
      if (text && text.length > 0) {
        placeNames.push(text);
      }
    });
  }
  
  // <p> etiketlerini bul (eğer <li> yoksa)
  if (placeNames.length === 0) {
    const pMatches = html.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pMatches) {
      pMatches.forEach(match => {
        const text = match.replace(/<[^>]+>/g, '').trim();
        if (text && text.length > 0 && !text.match(/^<em>/)) { // <em> içerenleri atla
          placeNames.push(text);
        }
      });
    }
  }
  
  return placeNames;
}

// Geocoding cache (aynı yer için tekrar geocoding yapmamak için)
const geocodingCache = new Map();

// Geocoding: Yer ismini koordinatlara çevir (OpenStreetMap Nominatim API)
async function geocodePlace(placeName, districtName, cityName) {
  try {
    // Cache kontrolü
    const cacheKey = `${placeName}|${districtName}|${cityName}`;
    if (geocodingCache.has(cacheKey)) {
      console.log(`Geocoding cache hit: ${placeName}`);
      return geocodingCache.get(cacheKey);
    }
    
    // Arama sorgusu: "Yer İsmi, İlçe, Şehir, Türkiye"
    const query = `${placeName}, ${districtName}, ${cityName}, Türkiye`;
    const encodedQuery = encodeURIComponent(query);
    
    // OpenStreetMap Nominatim API
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1`;
    
    console.log(`Geocoding başlatıldı: ${query}`);
    
    // Rate limiting için kısa bir bekleme (500ms'ye düşürdüm)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TurkeyTravelApp/1.0' // Nominatim için User-Agent gerekli
      }
    });
    
    if (!response.ok) {
      console.log(`Geocoding failed for ${query}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const coords = {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon)
      };
      
      // Cache'e ekle
      geocodingCache.set(cacheKey, coords);
      console.log(`Geocoding başarılı: ${placeName} -> ${coords.latitude}, ${coords.longitude}`);
      
      return coords;
    }
    
    console.log(`Geocoding sonuç bulunamadı: ${query}`);
    return null;
  } catch (error) {
    console.error(`Geocoding error for ${placeName}:`, error.message);
    return null;
  }
}

// İlçe yerlerini getir (rota planlayıcı için)
app.get("/api/districts/:districtId/places", authenticateToken, async (req, res) => {
  const districtId = req.params.districtId;
  const { category, cost_level, include_coords } = req.query;
  
  try {
    // İlçe bilgisini getir
    const [districts] = await db.query(
      "SELECT d.id, d.name, d.city_id, c.name as city_name FROM districts d JOIN cities c ON d.city_id = c.id WHERE d.id = ?",
      [districtId]
    );
    
    if (districts.length === 0) {
      return res.status(404).json({ error: "İlçe bulunamadı" });
    }
    
    const district = districts[0];
    
    // İlçe detaylarını getir (HTML formatında)
    const [details] = await db.query(
      "SELECT * FROM district_details WHERE district_id = ?",
      [districtId]
    );
    
    // district_real_details.json'dan veriyi kontrol et
    const realKey = `${asciiFold(district.city_name).toLowerCase()}|${asciiFold(
      district.name
    ).toLowerCase()}`;
    const realDetail = realDetailsMap.get(realKey);
    
    // Yer isimlerini topla
    let placeNames = [];
    
    if (realDetail) {
      // Doğa yerleri
      if (realDetail.gezilecek_yerler?.["doğa"]) {
        placeNames.push(...realDetail.gezilecek_yerler["doğa"].map(p => ({ name: p.isim || p, category: 'nature' })));
      }
      // Tarih yerleri
      if (realDetail.gezilecek_yerler?.tarih) {
        placeNames.push(...realDetail.gezilecek_yerler.tarih.map(p => ({ name: p.isim || p, category: 'history' })));
      }
      // Yeme-içme
      if (realDetail.yeme_icme) {
        placeNames.push(...realDetail.yeme_icme.map(p => ({ name: p.isim || p, category: 'food' })));
      }
    } else if (details.length > 0) {
      // HTML'den yer isimlerini parse et
      const detail = details[0];
      if (detail.nature_places) {
        const natureNames = parsePlaceNamesFromHtml(detail.nature_places);
        placeNames.push(...natureNames.map(n => ({ name: n, category: 'nature' })));
      }
      if (detail.historical_places) {
        const historyNames = parsePlaceNamesFromHtml(detail.historical_places);
        placeNames.push(...historyNames.map(n => ({ name: n, category: 'history' })));
      }
      if (detail.food_drink) {
        const foodNames = parsePlaceNamesFromHtml(detail.food_drink);
        placeNames.push(...foodNames.map(n => ({ name: n, category: 'food' })));
      }
    }
    
    // Places tablosunda bu isimlere göre arama yap
    let places = [];
    
    console.log(`Toplam ${placeNames.length} yer ismi bulundu`);
    
    if (placeNames.length > 0) {
      // Önce tüm places'leri al (district_id'ye göre)
      const [allPlaces] = await db.query(
        `SELECT p.*, 
          COALESCE(p.latitude, d.latitude) as latitude,
          COALESCE(p.longitude, d.longitude) as longitude
         FROM places p
         JOIN districts d ON p.district_id = d.id
         WHERE p.district_id = ?`,
        [districtId]
      );
      
      console.log(`Places tablosunda ${allPlaces.length} yer bulundu`);
      
      // İlçe koordinatlarını al (fallback için)
      const [districtCoords] = await db.query(
        "SELECT latitude, longitude FROM districts WHERE id = ?",
        [districtId]
      );
      const districtLat = districtCoords.length > 0 ? districtCoords[0].latitude : null;
      const districtLng = districtCoords.length > 0 ? districtCoords[0].longitude : null;
      
      console.log(`İlçe koordinatları: ${districtLat}, ${districtLng}`);
      
      // Her yer ismi için places tablosunda arama yap
      for (const placeInfo of placeNames) {
        console.log(`İşleniyor: ${placeInfo.name} (${placeInfo.category})`);
        // Kategori filtresi
        if (category && placeInfo.category !== category) continue;
        
        // Normalize edilmiş isim ile eşleştir
        const normalizedSearchName = normalizeTurkish(placeInfo.name);
        let foundPlace = null;
        
        // Places tablosunda normalize edilmiş isim ile eşleştir
        for (const place of allPlaces) {
          if (place.category !== placeInfo.category) continue;
          
          const normalizedPlaceName = normalizeTurkish(place.name);
          
          // Tam eşleşme veya kısmi eşleşme
          if (normalizedPlaceName === normalizedSearchName || 
              normalizedPlaceName.includes(normalizedSearchName) ||
              normalizedSearchName.includes(normalizedPlaceName)) {
            foundPlace = place;
            break;
          }
        }
        
        if (foundPlace) {
          // Cost level filtresi
          if (cost_level && foundPlace.cost_level !== cost_level) continue;
          
          // Eğer koordinat yoksa geocoding yap
          let lat = foundPlace.latitude;
          let lng = foundPlace.longitude;
          
          if (!lat || !lng) {
            console.log(`Koordinat bulunamadı, geocoding yapılıyor: ${foundPlace.name}`);
            const coords = await geocodePlace(foundPlace.name, district.name, district.city_name);
            if (coords) {
              lat = coords.latitude;
              lng = coords.longitude;
              // Veritabanını güncelle (async, hata olursa devam et)
              db.query(
                "UPDATE places SET latitude = ?, longitude = ? WHERE id = ?",
                [lat, lng, foundPlace.id]
              ).catch(err => console.error("Koordinat güncelleme hatası:", err));
            } else {
              // Geocoding başarısız, ilçe koordinatlarını kullan
              lat = districtLat;
              lng = districtLng;
            }
          }
          
          places.push({
            id: foundPlace.id,
            name: foundPlace.name,
            category: foundPlace.category,
            description: foundPlace.description,
            latitude: lat,
            longitude: lng,
            average_visit_time: foundPlace.average_visit_time || 60,
            cost_level: foundPlace.cost_level || 'free'
          });
        } else {
          // Places tablosunda bulunamadı, geocoding yap
          console.log(`Yer bulunamadı, geocoding yapılıyor: ${placeInfo.name}`);
          const coords = await geocodePlace(placeInfo.name, district.name, district.city_name);
          
          if (coords) {
            places.push({
              id: null, // Geçici yer
              name: placeInfo.name,
              category: placeInfo.category,
              description: null,
              latitude: coords.latitude,
              longitude: coords.longitude,
              average_visit_time: 60,
              cost_level: 'free'
            });
          } else if (districtLat && districtLng) {
            // Geocoding başarısız, ilçe koordinatlarını kullan (fallback)
            places.push({
              id: null, // Geçici yer
              name: placeInfo.name,
              category: placeInfo.category,
              description: null,
              latitude: districtLat,
              longitude: districtLng,
              average_visit_time: 60,
              cost_level: 'free'
            });
          }
        }
      }
    }
    
    res.json({
      district_id: parseInt(districtId),
      district_name: district.name,
      places: places
    });
  } catch (err) {
    console.error("Database error:", err);
    console.error("Hata detayı:", err.stack);
    res.status(500).json({ error: "Veritabanı hatası: " + err.message });
  }
});

// Token doğrulama endpoint (opsiyonel - frontend'den token kontrolü için)
app.get("/api/verify", authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    user: req.user 
  });
});

// İlçe detaylarını güncelle API endpoint (admin için)
app.post("/api/district/:id/details", authenticateToken, async (req, res) => {
  const districtId = req.params.id;
  const { general_info, nature_places, historical_places, food_drink } = req.body;
  
  try {
    // İlçe var mı kontrol et
    const [districts] = await db.query("SELECT id FROM districts WHERE id = ?", [districtId]);
    if (districts.length === 0) {
      return res.status(404).json({ error: "İlçe bulunamadı" });
    }
    
    // Detay var mı kontrol et, yoksa oluştur, varsa güncelle
    const [existing] = await db.query(
      "SELECT id FROM district_details WHERE district_id = ?",
      [districtId]
    );
    
    if (existing.length > 0) {
      // Güncelle
      await db.query(
        "UPDATE district_details SET general_info = ?, nature_places = ?, historical_places = ?, food_drink = ? WHERE district_id = ?",
        [general_info || null, nature_places || null, historical_places || null, food_drink || null, districtId]
      );
    } else {
      // Oluştur
      await db.query(
        "INSERT INTO district_details (district_id, general_info, nature_places, historical_places, food_drink) VALUES (?, ?, ?, ?, ?)",
        [districtId, general_info || null, nature_places || null, historical_places || null, food_drink || null]
      );
    }
    
    res.json({ success: true, message: "İlçe detayları kaydedildi" });
  } catch (err) {
    console.error("Database error:", err);
    res.status(500).json({ error: "Veritabanı hatası: " + err.message });
  }
});

// ==================== ROTA KATILIM API'leri ====================

// Tüm rotaları listele (herkes görebilir)
app.get("/api/routes", async (req, res) => {
  try {
    // Authorization header varsa kullanıcı ID'sini al (opsiyonel)
    let currentUserId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.userId;
      } catch (e) {
        // Token geçersiz, devam et
      }
    }

    // Rotaları ve katılımcı sayısını getir
    const [routes] = await db.query(`
      SELECT 
        r.id,
        r.name,
        r.description,
        r.owner_id,
        u.email as owner_email,
        r.created_at,
        COUNT(rp.id) as participant_count
      FROM routes r
      JOIN users u ON r.owner_id = u.id
      LEFT JOIN route_participants rp ON r.id = rp.route_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);

    // Her rota için kullanıcının katılım durumunu kontrol et
    const routesWithStatus = await Promise.all(routes.map(async (route) => {
      let isParticipant = false;
      let isOwner = false;
      
      if (currentUserId) {
        isOwner = route.owner_id === currentUserId;
        
        const [participation] = await db.query(
          "SELECT id FROM route_participants WHERE route_id = ? AND user_id = ?",
          [route.id, currentUserId]
        );
        isParticipant = participation.length > 0;
      }
      
      return {
        ...route,
        is_owner: isOwner,
        is_participant: isParticipant
      };
    }));

    res.json(routesWithStatus);
  } catch (err) {
    console.error("Rota listesi hatası:", err);
    res.status(500).json({ error: "Veritabanı hatası: " + err.message });
  }
});

// Yeni rota oluştur (giriş yapmış kullanıcı)
app.post("/api/routes", authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user.userId;

  try {
    // Validasyon
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Rota adı gerekli" });
    }

    if (name.length > 255) {
      return res.status(400).json({ error: "Rota adı en fazla 255 karakter olabilir" });
    }

    // Rota oluştur
    const [result] = await db.query(
      "INSERT INTO routes (name, description, owner_id) VALUES (?, ?, ?)",
      [name.trim(), description?.trim() || null, userId]
    );

    res.json({
      success: true,
      message: "Rota başarıyla oluşturuldu",
      route: {
        id: result.insertId,
        name: name.trim(),
        description: description?.trim() || null,
        owner_id: userId
      }
    });
  } catch (err) {
    console.error("Rota oluşturma hatası:", err);
    res.status(500).json({ error: "Rota oluşturulamadı: " + err.message });
  }
});

// Rota sil (sadece sahibi silebilir)
app.delete("/api/routes/:id", authenticateToken, async (req, res) => {
  const routeId = req.params.id;
  const userId = req.user.userId;

  try {
    // Rota var mı ve sahibi bu kullanıcı mı kontrol et
    const [routes] = await db.query(
      "SELECT id, owner_id FROM routes WHERE id = ?",
      [routeId]
    );

    if (routes.length === 0) {
      return res.status(404).json({ error: "Rota bulunamadı" });
    }

    if (routes[0].owner_id !== userId) {
      return res.status(403).json({ error: "Bu rotayı silme yetkiniz yok" });
    }

    // Rotayı sil (CASCADE ile katılımcılar da silinir)
    await db.query("DELETE FROM routes WHERE id = ?", [routeId]);

    res.json({ success: true, message: "Rota başarıyla silindi" });
  } catch (err) {
    console.error("Rota silme hatası:", err);
    res.status(500).json({ error: "Rota silinemedi: " + err.message });
  }
});

// Rotaya katıl
app.post("/api/routes/:id/join", authenticateToken, async (req, res) => {
  const routeId = req.params.id;
  const userId = req.user.userId;

  try {
    // Rota var mı kontrol et
    const [routes] = await db.query("SELECT id FROM routes WHERE id = ?", [routeId]);

    if (routes.length === 0) {
      return res.status(404).json({ error: "Rota bulunamadı" });
    }

    // Kullanıcı zaten katılmış mı kontrol et
    const [existing] = await db.query(
      "SELECT id FROM route_participants WHERE route_id = ? AND user_id = ?",
      [routeId, userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "Bu rotaya zaten katılmışsınız" });
    }

    // Katılımı ekle
    await db.query(
      "INSERT INTO route_participants (route_id, user_id) VALUES (?, ?)",
      [routeId, userId]
    );

    res.json({ success: true, message: "Rotaya başarıyla katıldınız" });
  } catch (err) {
    console.error("Rotaya katılma hatası:", err);
    res.status(500).json({ error: "Rotaya katılınamadı: " + err.message });
  }
});

// Rotadan ayrıl
app.delete("/api/routes/:id/leave", authenticateToken, async (req, res) => {
  const routeId = req.params.id;
  const userId = req.user.userId;

  try {
    // Rota var mı kontrol et
    const [routes] = await db.query("SELECT id FROM routes WHERE id = ?", [routeId]);

    if (routes.length === 0) {
      return res.status(404).json({ error: "Rota bulunamadı" });
    }

    // Kullanıcı katılmış mı kontrol et
    const [existing] = await db.query(
      "SELECT id FROM route_participants WHERE route_id = ? AND user_id = ?",
      [routeId, userId]
    );

    if (existing.length === 0) {
      return res.status(400).json({ error: "Bu rotaya katılmamışsınız" });
    }

    // Katılımı sil
    await db.query(
      "DELETE FROM route_participants WHERE route_id = ? AND user_id = ?",
      [routeId, userId]
    );

    res.json({ success: true, message: "Rotadan başarıyla ayrıldınız" });
  } catch (err) {
    console.error("Rotadan ayrılma hatası:", err);
    res.status(500).json({ error: "Rotadan ayrılınamadı: " + err.message });
  }
});

// Diğer tüm yollar index.html'e yönlensin (önce root'taki, sonra public'teki)
// Express 5'te wildcard için use() kullanıyoruz
app.use((req, res, next) => {
  // API route'ları için devam et (static dosyalar zaten static middleware tarafından handle ediliyor)
  if (req.path.startsWith('/api')) {
    return next();
  }
  
  // Eğer dosya uzantısı varsa (static dosya), Express'in static middleware'ine bırak
  if (req.path.includes('.')) {
    return next();
  }
  
  // public/index.html'i serve et
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(3000,"0.0.0.0", () =>
  console.log("Sunucu http://localhost:3000 adresinde çalışıyor 🚀")
);
