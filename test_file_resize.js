#!/usr/bin/env node

"use strict";

/**
 * Test File Mode with Resizing
 * Verifies that file mode now resizes images when Sharp is available
 */

const fs = require("fs");
const path = require("path");

// Check if Sharp is available
let sharp = null;
try {
  sharp = require("sharp");
  console.log("✅ Sharp is installed");
} catch (e) {
  console.log("❌ Sharp not available - install with: npm install sharp");
  process.exit(1);
}

// Import components
const GDriveAPI = require("./components/GDriveAPI.js");
const PhotoDatabase = require("./components/PhotoDatabase.js");
const CacheManager = require("./components/CacheManager.js");

// Load configuration from test-config.json
const baseConfig = JSON.parse(fs.readFileSync('./test-config.json', 'utf8'));

// Configuration
const CONFIG = {
  ...baseConfig,
  cachePath: path.resolve(__dirname, "cache", "test-file-mode"),
  maxCacheSizeMB: 50,
  showWidth: 1920,
  showHeight: 1080,
  jpegQuality: 85,
  useBlobStorage: false // Test FILE MODE with resizing
};

async function runTest() {
  console.log("\n=".repeat(60));
  console.log("TEST: File Mode with Image Resizing");
  console.log("=".repeat(60));

  // Initialize components
  console.log("\n[1] Initializing components...");

  const dbPath = path.resolve(__dirname, "cache", "test-file-resize.db");
  const db = new PhotoDatabase(dbPath, console.log, { sortMode: 'sequential' });
  await db.initialize();

  const driveAPI = new GDriveAPI(CONFIG, console.log);
  await driveAPI.initialize();

  const cacheManager = new CacheManager(CONFIG, db, driveAPI, console.log);

  console.log("✅ Components initialized");

  // Scan for photos
  console.log("\n[2] Scanning for photos...");
  for (const folder of CONFIG.driveFolders) {
    const photos = await driveAPI.scanFolder(folder.id, folder.depth);
    console.log(`✅ Found ${photos.length} photos`);

    if (photos.length > 0) {
      await db.savePhotos(photos);
      console.log(`✅ Saved ${photos.length} photos to database`);
    }
  }

  // Get total count
  const totalCount = await db.getTotalPhotoCount();
  console.log(`\n📊 Total photos in database: ${totalCount}`);

  if (totalCount === 0) {
    console.log("❌ No photos found. Please check your folder ID.");
    await cleanup(db, cacheManager);
    process.exit(1);
  }

  // Download and resize one photo in FILE MODE
  console.log("\n[3] Testing file mode with resizing...");
  console.log("Config: useBlobStorage = false (file mode)");
  console.log(`Config: showWidth = ${CONFIG.showWidth}, showHeight = ${CONFIG.showHeight}`);
  console.log(`Config: jpegQuality = ${CONFIG.jpegQuality}`);

  const photosToCache = await db.getPhotosToCache(1);

  if (photosToCache.length === 0) {
    console.log("❌ No photos need caching");
    await cleanup(db, cacheManager);
    process.exit(1);
  }

  const testPhoto = photosToCache[0];
  console.log(`\n📸 Testing with photo: ${testPhoto.filename || testPhoto.id}`);

  // Download photo (will trigger resizing in file mode)
  console.log("\n[4] Downloading and processing...");
  const result = await cacheManager.downloadPhoto(testPhoto.id);

  console.log("\n✅ Download complete!");
  console.log(`   Photo ID: ${result.photoId}`);
  console.log(`   Final size: ${(result.size / 1024).toFixed(2)}KB`);

  // Verify file exists and get stats
  const photoRecord = await db.query(
    "SELECT cached_path, cached_size_bytes FROM photos WHERE id = ?",
    [testPhoto.id]
  );

  if (photoRecord.length > 0 && photoRecord[0].cached_path) {
    const filePath = photoRecord[0].cached_path;
    console.log(`   File path: ${filePath}`);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`   File size on disk: ${(stats.size / 1024).toFixed(2)}KB`);

      // Check image dimensions using Sharp
      const metadata = await sharp(filePath).metadata();
      console.log(`   Image dimensions: ${metadata.width}x${metadata.height}`);
      console.log(`   Image format: ${metadata.format}`);

      // Verify resize was applied
      if (metadata.width <= CONFIG.showWidth && metadata.height <= CONFIG.showHeight) {
        console.log("\n✅ SUCCESS: Image was resized to fit screen dimensions!");
      } else {
        console.log("\n❌ WARNING: Image dimensions exceed screen size (resize may have failed)");
      }
    } else {
      console.log("\n❌ ERROR: File does not exist on disk");
    }
  } else {
    console.log("\n❌ ERROR: No cached_path in database");
  }

  // Cleanup
  await cleanup(db, cacheManager);

  console.log("\n=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
}

async function cleanup(db, cacheManager) {
  console.log("\n[Cleanup] Closing connections...");
  cacheManager.stop();
  await db.close();
  console.log("✅ Cleanup complete");
}

// Run test
runTest().catch((error) => {
  console.error("\n❌ Test failed:", error);
  process.exit(1);
});
