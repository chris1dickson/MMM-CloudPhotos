#!/usr/bin/env node

"use strict";

/**
 * Quick Validation Script
 * Tests the updated CacheManager file mode logic
 */

const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");

console.log("=".repeat(60));
console.log("VALIDATION: CacheManager File Mode Changes");
console.log("=".repeat(60));

// Test 1: Check if Sharp is available
console.log("\n[TEST 1] Checking Sharp availability...");
let sharp = null;
try {
  sharp = require("sharp");
  console.log("✅ Sharp is installed");
} catch (e) {
  console.log("⚠️  Sharp not installed (will use fallback mode)");
}

// Test 2: Import CacheManager
console.log("\n[TEST 2] Importing CacheManager...");
let CacheManager;
try {
  CacheManager = require("./components/CacheManager.js");
  console.log("✅ CacheManager imported successfully");
} catch (e) {
  console.error("❌ Failed to import CacheManager:", e.message);
  process.exit(1);
}

// Test 3: Create mock instances
console.log("\n[TEST 3] Creating CacheManager instance...");

const mockDb = {
  getCacheSizeBytes: async () => 0,
  getPhotosToCache: async () => [],
  updatePhotoCache: async (id, path, size) => {
    console.log(`   Mock DB: updatePhotoCache(${id}, ${path}, ${size})`);
  },
  updatePhotoCacheBlob: async (id, buffer, mimeType) => {
    console.log(`   Mock DB: updatePhotoCacheBlob(${id}, ${buffer.length} bytes, ${mimeType})`);
  },
  getCachedPhotoCount: async () => 0,
  getTotalPhotoCount: async () => 0,
  getOldestCachedPhotos: async () => [],
  clearPhotoCache: async () => {}
};

const mockDriveAPI = {
  downloadPhoto: async (photoId) => {
    // Create a mock image stream (simpleJPEG header + data)
    const mockImageData = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0 marker
      0x00, 0x10, // APP0 length
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, // Version
      0x00, 0x00, 0x01, 0x00, 0x01, // DPI
      0x00, 0x00, // Thumbnail
      ...Buffer.alloc(1000, 0xFF), // Some data
      0xFF, 0xD9 // JPEG EOI
    ]);
    return Readable.from([mockImageData]);
  }
};

const tempCachePath = path.resolve(__dirname, "cache", "test_validation");
fs.mkdirSync(tempCachePath, { recursive: true });

try {
  const cacheManager = new CacheManager(
    {
      cachePath: tempCachePath,
      maxCacheSizeMB: 200,
      showWidth: 1920,
      showHeight: 1080,
      jpegQuality: 85,
      useBlobStorage: false // Test file mode
    },
    mockDb,
    mockDriveAPI,
    (msg) => console.log(`   [CACHE] ${msg}`)
  );

  cacheManager.stop(); // Stop automatic ticking

  console.log("✅ CacheManager instance created");
  console.log(`   BLOB mode: ${cacheManager.useBlobStorage}`);
  console.log(`   Screen dimensions: ${cacheManager.screenWidth}x${cacheManager.screenHeight}`);
  console.log(`   JPEG quality: ${cacheManager.jpegQuality}`);

  // Test 4: Test downloadPhoto method
  console.log("\n[TEST 4] Testing downloadPhoto method...");

  cacheManager.downloadPhoto("test_photo_123")
    .then((result) => {
      console.log("✅ Download completed successfully");
      console.log(`   Result:`, result);

      // Check if file exists
      const expectedFile = path.join(tempCachePath, "test_photo_123.jpg");
      if (fs.existsSync(expectedFile)) {
        const stats = fs.statSync(expectedFile);
        console.log(`✅ File created: ${expectedFile}`);
        console.log(`   File size: ${stats.size} bytes`);

        if (sharp) {
          // Verify it's a valid image
          sharp(expectedFile)
            .metadata()
            .then((metadata) => {
              console.log(`✅ Image metadata:`);
              console.log(`   Dimensions: ${metadata.width}x${metadata.height}`);
              console.log(`   Format: ${metadata.format}`);

              cleanup();
              console.log("\n" + "=".repeat(60));
              console.log("✅ ALL VALIDATION TESTS PASSED");
              console.log("=".repeat(60));
            })
            .catch((err) => {
              console.error("❌ Failed to read image metadata:", err.message);
              cleanup();
              process.exit(1);
            });
        } else {
          cleanup();
          console.log("\n" + "=".repeat(60));
          console.log("✅ ALL VALIDATION TESTS PASSED (without Sharp)");
          console.log("=".repeat(60));
        }
      } else {
        console.error("❌ File was not created");
        cleanup();
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("❌ Download failed:", error.message);
      console.error(error.stack);
      cleanup();
      process.exit(1);
    });

} catch (error) {
  console.error("❌ Test failed:", error.message);
  console.error(error.stack);
  cleanup();
  process.exit(1);
}

function cleanup() {
  console.log("\n[Cleanup] Removing test files...");
  if (fs.existsSync(tempCachePath)) {
    fs.rmSync(tempCachePath, { recursive: true, force: true });
    console.log("✅ Cleanup complete");
  }
}
