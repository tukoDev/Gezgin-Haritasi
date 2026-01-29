#!/usr/bin/env node

/**
 * Basitleştirilmiş ilçe verisi üretici
 *
 * - Google Places API ile her ilçe için 3 doğa, 3 tarih ve 3 yeme-içme mekanı adı toplar.
 * - Gemini API ile her mekan için kısa Türkçe açıklamalar ve ilçe genel bilgisi üretir.
 * - Sonuçları `district_real_details.json` dosyasında birleştirir.
 *
 * Kullanım:
 *   node generateRealDistrictDetails.mjs --stage=places        # sadece yer isimlerini topla
 *   node generateRealDistrictDetails.mjs --stage=descriptions  # açıklamaları üret
 *   node generateRealDistrictDetails.mjs --stage=all           # ikisini ardışık yap (varsayılan)
 *
 * Opsiyonel parametreler:
 *   --city=İlAdi           Sadece belirtilen il
 *   --district=İlçeAdi     Sadece belirtilen ilçe
 *   --start=100 --end=150  Belirli aralıktaki ilçeler
 *   --refresh=places       Yer isimlerini yeniden çek
 *   --refresh=descriptions Açıklamaları yeniden yaz
 *   --refresh=all          Her şeyi sıfırla
 */

import { config as loadEnv } from "dotenv";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISTRICTS_FILE = path.join(__dirname, "districts.json");
const OUTPUT_FILE = path.join(__dirname, "district_real_details.json");
const CACHE_DIR = path.join(__dirname, "cache");
const PLACES_CACHE_FILE = path.join(CACHE_DIR, "places.json");
const DESCRIPTIONS_CACHE_FILE = path.join(CACHE_DIR, "descriptions.json");
const GENERAL_INFO_CACHE_FILE = path.join(CACHE_DIR, "general-info.json");

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CATEGORY_CONFIG = {
  nature: {
    querySuffix: "doğal alan",
    outputKey: "doğa",
    imageTag: "nature",
  },
  history: {
    querySuffix: "tarihi mekan",
    outputKey: "tarih",
    imageTag: "history",
  },
  food: {
    querySuffix: "restoran",
    outputKey: "yeme_icme",
    imageTag: "restaurant",
  },
};

const MAX_RESULTS_PER_CATEGORY = 3;
const GOOGLE_DELAY_MS = 2000;
const GEMINI_DELAY_MS = 1500;
const GEMINI_MAX_RETRY = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const slugify = (value) =>
  asciiFold(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const normalizeKey = (value) => asciiFold(value || "").toLowerCase();

const uniqueAndLimit = (names = []) => {
  const seen = new Set();
  const result = [];
  for (const raw of names) {
    const name = (raw || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= MAX_RESULTS_PER_CATEGORY) break;
  }
  return result;
};

const buildImageUrl = (name, city, category) => {
  const encoded = encodeURIComponent(
    `${asciiFold(name)} ${asciiFold(city)} ${CATEGORY_CONFIG[category].imageTag}`
  );
  return `https://source.unsplash.com/featured/?${encoded}`;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options = {};
  for (const arg of args) {
    const cleaned = arg.replace(/^--/, "");
    const [key, ...rest] = cleaned.split("=");
    options[key] = rest.length ? rest.join("=") : true;
  }
  return options;
};

const ensureCacheFiles = async () => {
  await mkdir(CACHE_DIR, { recursive: true });
  const targets = [
    PLACES_CACHE_FILE,
    DESCRIPTIONS_CACHE_FILE,
    GENERAL_INFO_CACHE_FILE,
  ];

  for (const file of targets) {
    try {
      await readFile(file, "utf-8");
    } catch {
      await writeFile(file, JSON.stringify({}, null, 2), "utf-8");
    }
  }
};

const loadJson = async (file, fallback = {}) => {
  try {
    const raw = await readFile(file, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const saveJson = async (file, data) => {
  await writeFile(file, JSON.stringify(data, null, 2), "utf-8");
};

const fetchPlacesFromGoogle = async (city, district, category) => {
  const config = CATEGORY_CONFIG[category];
  const query = `${district} ${city} ${config.querySuffix}`;
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
    query
  )}&language=tr&key=${GOOGLE_PLACES_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== "OK") {
    console.warn(
      `  ⚠️  Google Places hatası (${city}/${district}/${category}): ${data.status} ${
        data.error_message || ""
      }`
    );
    return [];
  }

  const names = data.results?.map((item) => item?.name) || [];
  return uniqueAndLimit(names);
};

const generateGeminiText = async (prompt, maxTokens = 256, temperature = 0.6) => {
  let lastError = null;

  for (let attempt = 1; attempt <= GEMINI_MAX_RETRY; attempt++) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        }
      );

      if (response.status === 429) {
        console.warn(`  ⚠️  Gemini rate limit (attempt ${attempt}). Bekleniyor...`);
        await sleep(GEMINI_DELAY_MS * 10);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Gemini error ${response.status}: ${body}`);
      }

      const json = await response.json();
      const text =
        json?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("\n")
          .trim() || "";

      await sleep(GEMINI_DELAY_MS);
      return text;
    } catch (error) {
      lastError = error;
      console.error(`  ⚠️  Gemini isteği başarısız attempt ${attempt}: ${error.message}`);
      await sleep(GEMINI_DELAY_MS * 5);
    }
  }

  throw lastError || new Error("Gemini cevabı alınamadı.");
};

const generatePlaceDescription = async (
  city,
  district,
  name,
  category,
  descriptionsCache,
  refresh = false
) => {
  const cacheKey = `${slugify(city)}|${slugify(district)}|${category}|${slugify(name)}`;
  if (!refresh && descriptionsCache[cacheKey]) {
    return descriptionsCache[cacheKey];
  }

  const prompt = `
${city} ilinin ${district} ilçesindeki "${name}" adlı ${
    category === "food"
      ? "yeme-içme noktası"
      : category === "history"
        ? "tarihi veya kültürel yer"
        : "doğal alan"
  } hakkında 2-3 cümlelik kısa bir açıklama yaz.
Sadece doğrulanabilir, genel bilgiler ver; uydurma ayrıntılar ekleme.
Cümleleri akıcı ve doğal bir TÜRKÇE ile yaz.`.trim();

  const text = await generateGeminiText(prompt, 256, 0.6);
  descriptionsCache[cacheKey] = text;
  return text;
};

const generateGeneralInfo = async (
  city,
  district,
  generalInfoCache,
  refresh = false
) => {
  const cacheKey = `${slugify(city)}|${slugify(district)}`;
  if (!refresh && generalInfoCache[cacheKey]) {
    return generalInfoCache[cacheKey];
  }

  const prompt = `${city} ilinin ${district} ilçesi hakkında doğrulanabilir gerçeklere dayanan, 1-2 cümlelik kısa bir genel bilgi yaz. İlçenin coğrafi konumu, öne çıkan özellikleri veya ekonomik/kültürel karakteri gibi bilinen unsurlara odaklan. Uydurma bilgi verme ve cevabı tamamen TÜRKÇE yaz.`;
  const text = await generateGeminiText(prompt, 128, 0.4);
  generalInfoCache[cacheKey] = text;
  return text;
};

const main = async () => {
  const args = parseArgs();
  const stage = String(args.stage || args.mode || "all").toLowerCase();
  const refreshArg = String(args.refresh || "").toLowerCase();

  const refreshPlaces = ["true", "1", "yes", "places", "all"].includes(refreshArg);
  const refreshDescriptions = ["true", "1", "yes", "descriptions", "all"].includes(
    refreshArg
  );

  if (!GOOGLE_PLACES_API_KEY) {
    console.warn("⚠️  GOOGLE_PLACES_API_KEY tanımlı değil, Google Places sorguları başarısız olacaktır.");
  }
  if ((stage === "descriptions" || stage === "all") && !GEMINI_API_KEY) {
    console.error("🚫 GEMINI_API_KEY tanımlı değil. Açıklama üretimi yapılamaz.");
    process.exit(1);
  }

  await ensureCacheFiles();

  const placesCache = await loadJson(PLACES_CACHE_FILE, {});
  const descriptionsCache = await loadJson(DESCRIPTIONS_CACHE_FILE, {});
  const generalInfoCache = await loadJson(GENERAL_INFO_CACHE_FILE, {});

  let districts = await loadJson(DISTRICTS_FILE, []);
  if (!Array.isArray(districts)) {
    console.error("🚫 districts.json hatalı formatta.");
    process.exit(1);
  }

  const filterCity = args.city ? normalizeKey(args.city) : null;
  const filterDistrict = args.district ? normalizeKey(args.district) : null;
  const startIndex = args.start ? Number(args.start) : 0;
  const endIndex = args.end ? Number(args.end) : null;

  if (filterCity) {
    districts = districts.filter(
      (item) => normalizeKey(item.city_name) === filterCity
    );
  }
  if (filterDistrict) {
    districts = districts.filter(
      (item) => normalizeKey(item.district_name) === filterDistrict
    );
  }

  const start = Number.isFinite(startIndex) && startIndex > 0 ? startIndex : 0;
  const end =
    Number.isFinite(endIndex) && endIndex !== null
      ? Math.min(endIndex, districts.length)
      : districts.length;
  districts = districts.slice(start, end);

  const shouldCollect =
    stage === "places" || stage === "collect" || stage === "all";
  const shouldDescribe =
    stage === "descriptions" || stage === "describe" || stage === "all";

  const finalResults = shouldDescribe
    ? await loadJson(OUTPUT_FILE, [])
    : [];

  for (const district of districts) {
    const city = district.city_name;
    const districtName = district.district_name;
    const slug = `${slugify(city)}|${slugify(districtName)}`;

    let placeEntry = placesCache[slug];

    if (shouldCollect) {
      if (!placeEntry || refreshPlaces) {
        if (!GOOGLE_PLACES_API_KEY) {
          console.warn(
            "⚠️  Google Places anahtarı olmadığından veri toplanamadı."
          );
        } else {
          console.log(`📍 Google Places sorgulanıyor: ${city} / ${districtName}`);
          placeEntry = { city, district: districtName, categories: {} };
          for (const category of Object.keys(CATEGORY_CONFIG)) {
            try {
              const names = await fetchPlacesFromGoogle(city, districtName, category);
              placeEntry.categories[category] = names;
            } catch (error) {
              console.error(
                `  ⚠️  Google Places hatası (${city}/${districtName}/${category}): ${error.message}`
              );
              placeEntry.categories[category] = [];
            }
            await sleep(GOOGLE_DELAY_MS);
          }
          placesCache[slug] = placeEntry;
          await saveJson(PLACES_CACHE_FILE, placesCache);
          console.log(`✅ Yer isimleri kaydedildi: ${city} / ${districtName}`);
        }
      } else {
        console.log(
          `⏭️  Yer isimleri önbellekten kullanılıyor: ${city} / ${districtName}`
        );
      }
    }

    if (!shouldDescribe) {
      continue;
    }

    placeEntry = placesCache[slug];
    if (!placeEntry) {
      console.warn(
        `⚠️  ${city} / ${districtName} için yer verisi bulunamadı. Önce --stage=places çalıştırın.`
      );
      continue;
    }

    const categories = placeEntry.categories || {};

    const outputEntry = {
      city,
      district: districtName,
      genel_bilgi: "",
      gezilecek_yerler: {
        doğa: [],
        tarih: [],
      },
      yeme_icme: [],
    };

    try {
      outputEntry.genel_bilgi = await generateGeneralInfo(
        city,
        districtName,
        generalInfoCache,
        refreshDescriptions
      );
    } catch (error) {
      console.error(
        `⚠️  Genel bilgi üretilemedi (${city}/${districtName}): ${error.message}`
      );
    }

    for (const category of Object.keys(CATEGORY_CONFIG)) {
      const names = categories[category] || [];
      const list = [];

      for (const name of names) {
        try {
          const description = await generatePlaceDescription(
            city,
            districtName,
            name,
            category,
            descriptionsCache,
            refreshDescriptions
          );
          list.push({
            isim: name,
            aciklama: description || "",
            resim: buildImageUrl(name, city, category),
          });
        } catch (error) {
          console.error(
            `  ⚠️  Açıklama üretilemedi (${city}/${districtName}/${name}): ${error.message}`
          );
        }
      }

      if (category === "food") {
        outputEntry.yeme_icme = list;
      } else {
        outputEntry.gezilecek_yerler[CATEGORY_CONFIG[category].outputKey] = list;
      }
    }

    const existingIndex = finalResults.findIndex(
      (item) => item.city === city && item.district === districtName
    );

    if (existingIndex >= 0) {
      finalResults[existingIndex] = outputEntry;
    } else {
      finalResults.push(outputEntry);
    }

    await saveJson(DESCRIPTIONS_CACHE_FILE, descriptionsCache);
    await saveJson(GENERAL_INFO_CACHE_FILE, generalInfoCache);
    await writeFile(OUTPUT_FILE, JSON.stringify(finalResults, null, 2), "utf-8");

    console.log(
      `💾 JSON güncellendi: ${city} / ${districtName} (toplam ${finalResults.length})`
    );
  }

  if (shouldDescribe) {
    console.log("🎉 Açıklama üretimi tamamlandı.");
  } else {
    console.log("🎉 Yer isimleri toplandı.");
  }
};

main().catch((error) => {
  console.error("💥 Beklenmeyen hata:", error);
  process.exit(1);
});

