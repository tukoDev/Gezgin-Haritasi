#!/usr/bin/env node

/**
 * District details generator script.
 *
 * Reads district definitions from `districts.json`, queries the Google Gemini API
 * to synthesize travel content, enriches the data with Unsplash image URLs,
 * and writes the structured result into `district_details.json`.
 *
 * Requirements:
 *  - Node.js 18+ (for native fetch and top-level await)
 *  - Dependencies: `dotenv` (npm install dotenv), `mysql2` (already in project)
 *  - Environment variable: GEMINI_API_KEY (or GOOGLE_API_KEY) in a `.env` file located at project root
 *
 * Usage:
 *  node generateDistrictDetails.mjs
 */

import { config as loadEnv } from "dotenv";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_CALL_DELAY_MS = 3000;
const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_DELAY_MS = 30000;

const INPUT_FILE = path.join(__dirname, "districts.json");
const OUTPUT_FILE = path.join(__dirname, "district_details.json");
const REQUEST_DELAY_MS = 2000;

if (!GEMINI_API_KEY) {
  console.error(
    "🚫 GEMINI_API_KEY (or GOOGLE_API_KEY) is missing. Set it in your .env file."
  );
  process.exit(1);
}

if (!existsSync(INPUT_FILE)) {
  console.error(`🚫 Input file not found: ${INPUT_FILE}`);
  process.exit(1);
}

/**
 * Sleep helper for rate limiting.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ensures the raw model output is parsed to JSON.
 * Strips markdown fences if the model wraps the response.
 * @param {string} raw
 */
const parseJsonResponse = (raw) => {
  const trimmed = raw.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Model response does not contain JSON.");
  }

  const jsonString = trimmed.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(jsonString);
};

/**
 * Creates an Unsplash featured image URL for a given search query.
 * @param {string} query
 * @returns {string}
 */
const buildImageUrl = (query) =>
  `https://source.unsplash.com/featured/?${encodeURIComponent(query)}`;

/**
 * Calls Google Gemini's generateContent API with the prompt.
 * @param {string} cityName
 * @param {string} districtName
 * @returns {Promise<object>}
 */
const fetchDistrictDetails = async (cityName, districtName) => {
  const prompt = `
Lütfen ${cityName} iline bağlı ${districtName} ilçesi hakkında aşağıdaki bilgileri üret:

1. Genel Bilgi (3-4 cümle, kısa ama bilgilendirici)
2. Gezilecek Yerler:
   - Doğa (3 yer, her biri için 1 cümlelik açıklama)
   - Tarih (3 yer, her biri için 1 cümlelik açıklama)
3. Yeme-İçme (3 mekan, her biri için 1 cümlelik açıklama)

Cevabı aşağıdaki JSON formatında ver:
{
  "genel_bilgi": "",
  "dogal_yerler": [{ "isim": "", "aciklama": "" }],
  "tarihi_yerler": [{ "isim": "", "aciklama": "" }],
  "yeme_icme": [{ "isim": "", "aciklama": "" }]
}
`.trim();

  let lastError;

  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      console.warn(
        `🔁 Gemini retry ${attempt}/${GEMINI_MAX_RETRIES} for ${cityName} / ${districtName}`
      );
    }

    await sleep(
      attempt === 1 ? GEMINI_CALL_DELAY_MS : GEMINI_RETRY_DELAY_MS
    );

    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are a helpful travel assistant that always responds with valid JSON matching the user's requested schema.\n\n${prompt}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
          },
        }),
      });

      if (response.status === 429) {
        const errorBody = await response.text();
        lastError = new Error(
          `Gemini API error (status ${response.status}): ${errorBody}`
        );
        console.warn(
          `⚠️  Gemini rate limit hit for ${cityName} / ${districtName}. Waiting ${Math.round(
            GEMINI_RETRY_DELAY_MS / 1000
          )} seconds before retry.`
        );
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Gemini API error (status ${response.status}): ${errorBody}`
        );
      }

      const data = await response.json();
      const textResponse =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ??
        data?.candidates?.[0]?.output ??
        data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text)
          .join("\n");

      if (!textResponse) {
        throw new Error("Gemini API returned an unexpected response structure.");
      }

      return parseJsonResponse(textResponse);
    } catch (error) {
      lastError = error;
      console.error(
        `⚠️  Gemini request failed on attempt ${attempt} for ${cityName} / ${districtName}: ${error.message}`
      );
      if (attempt === GEMINI_MAX_RETRIES) {
        break;
      }
      console.warn(
        `⏳ Preparing retry ${attempt + 1} for ${cityName} / ${districtName}...`
      );
    }
  }

  throw lastError || new Error("Gemini request failed without a response.");
};

/**
 * Transforms the OpenAI response into the desired shape.
 * @param {object} base
 * @param {object} generated
 */
const transformResponse = (base, generated) => {
  const { city_name: cityName, district_name: districtName } = base;

  const mapPlaces = (places = [], type) =>
    places.map((place) => ({
      isim: place.isim ?? "",
      aciklama: place.aciklama ?? "",
      resim: buildImageUrl(`${districtName} ${cityName} ${type} ${place.isim}`),
    }));

  return {
    city: cityName,
    district: districtName,
    genel_bilgi: generated.genel_bilgi ?? "",
    gezilecek_yerler: {
      "doğa": mapPlaces(generated.dogal_yerler, "nature"),
      tarih: mapPlaces(generated.tarihi_yerler, "history"),
    },
    yeme_icme: mapPlaces(generated.yeme_icme, "food"),
  };
};

/**
 * Loads existing output if present.
 */
const loadExistingOutput = async () => {
  if (!existsSync(OUTPUT_FILE)) {
    return [];
  }

  try {
    const raw = await readFile(OUTPUT_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    console.warn("⚠️  Existing output file could not be parsed. Starting fresh.");
    return [];
  }
};

/**
 * Main execution flow.
 */
const main = async () => {
  const raw = await readFile(INPUT_FILE, "utf-8");
  const districts = JSON.parse(raw);
  const existingOutput = await loadExistingOutput();

  // Track already processed districts to allow resume
  const processedSet = new Set(
    existingOutput.map(
      (item) => `${item.city.toLowerCase()}|${item.district.toLowerCase()}`
    )
  );

  const results = [...existingOutput];

  for (const district of districts) {
    const key = `${district.city_name.toLowerCase()}|${district.district_name.toLowerCase()}`;

    if (processedSet.has(key)) {
      console.log(
        `⏭️  Skipping ${district.city_name} / ${district.district_name} (already processed).`
      );
      continue;
    }

    try {
      console.log(
        `🧭 Processing ${district.city_name} / ${district.district_name}...`
      );
      const aiResponse = await fetchDistrictDetails(
        district.city_name,
        district.district_name
      );

      const transformed = transformResponse(district, aiResponse);
      results.push(transformed);

      await writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), "utf-8");
      console.log(
        `✅ Saved details for ${district.city_name} / ${district.district_name} (total: ${results.length}).`
      );
    } catch (error) {
      console.error(
        `❌ Failed for ${district.city_name} / ${district.district_name}:`,
        error.message
      );
    }

    await sleep(REQUEST_DELAY_MS);
  }

  console.log("🎉 All districts processed.");
};

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});

