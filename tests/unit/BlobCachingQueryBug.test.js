/**
 * Unit test to verify Bug #3 Fix: BLOB Caching Query Bug
 *
 * Bug #3 WAS: getPhotosToCache() returned photos that were ALREADY cached in BLOB mode
 * Impact WAS: Photos were downloaded infinitely, wasting bandwidth and API quota
 *
 * FIX: Changed WHERE clause from `cached_path IS NULL` to `cached_data IS NULL`
 *
 * This test verifies the fix works correctly.
 */

const fs = require("fs").promises;
const path = require("path");
const PhotoDatabase = require("../../components/PhotoDatabase");

describe("BLOB Caching Query Bug - Bug #3 (FIXED)", () => {
  let testDir;
  let dbPath;
  let db;
  let logs;

  // Mock logger
  const mockLogger = (...args) => {
    logs.push(args.join(" "));
  };

  beforeEach(async () => {
    testDir = path.join(__dirname, `temp-caching-bug-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    dbPath = path.join(testDir, "test_photos.db");
    logs = [];

    db = new PhotoDatabase(dbPath, mockLogger, { sortMode: "sequential" });
    await db.initialize();
  });

  afterEach(async () => {
    if (db) await db.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("Bug #3: getPhotosToCache() now correctly excludes BLOB-cached photos (FIXED)", () => {

    test("FIXED: getPhotosToCache() no longer returns BLOB-cached photos", async () => {
      console.log("\n" + "=".repeat(80));
      console.log("🔍 BLOB CACHING QUERY BUG - Detailed Analysis");
      console.log("=".repeat(80));

      // Setup: Create 10 photos in different states
      const photos = [];
      for (let i = 1; i <= 10; i++) {
        photos.push({
          id: `photo${i}`,
          name: `photo${i}.jpg`,
          parents: ["folder1"]
        });
      }

      await db.savePhotos(photos);

      console.log("\n📊 Initial Setup: 10 photos in database");
      console.log("  All photos start with NO cache (cached_data=NULL)");

      // Cache photos 1-3 as BLOBs
      console.log("\n💾 Caching Photos 1-3 in BLOB mode...");
      const fakeJpegData = Buffer.alloc(50000, 0xFF); // 50KB JPEG

      for (let i = 1; i <= 3; i++) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), `photo${i}`]);
      }

      console.log("  ✅ Photos 1-3: cached as BLOB");

      // Photos 4-10 are NOT cached yet
      console.log("\n❌ Photos 4-10: Not cached");

      // Verify the setup
      const allPhotos = await db.db.all(`
        SELECT
          id,
          CASE WHEN cached_data IS NOT NULL THEN 'BLOB' ELSE 'NONE' END as cache_status
        FROM photos
        ORDER BY CAST(SUBSTR(id, 6) AS INTEGER)
      `);

      console.log("\n📋 Current Cache State:");
      console.log("┌─────────┬──────────────┬─────────────┐");
      console.log("│ Photo   │ Cache Status │ Should Cache│");
      console.log("├─────────┼──────────────┼─────────────┤");
      allPhotos.forEach(p => {
        const shouldCache = p.cache_status === 'NONE' ? "YES" : "NO";
        console.log(`│ ${p.id.padEnd(7)} │ ${p.cache_status.padEnd(12)} │ ${shouldCache.padEnd(11)} │`);
      });
      console.log("└─────────┴──────────────┴─────────────┘");

      console.log("\n✅ FIXED Behavior:");
      console.log("  Query: WHERE cached_data IS NULL");
      console.log("  Should return: [photo4, photo5, photo6, photo7, photo8, photo9, photo10]");
      console.log("  (Only photos with NO BLOB cache)");

      // Call getPhotosToCache()
      const photosToCache = await db.getPhotosToCache(10);

      console.log("\n📤 getPhotosToCache(10) returned:");
      photosToCache.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.id} ${p.filename}`);
      });

      console.log("\n✅ FIX VERIFICATION:");

      // Check if BLOB-cached photos are correctly excluded (FIXED)
      const blobCachedIds = ['photo1', 'photo2', 'photo3'];
      const returnedIds = photosToCache.map(p => p.id);
      const incorrectlyIncluded = blobCachedIds.filter(id => returnedIds.includes(id));

      console.log(`  BLOB-cached photos returned: ${incorrectlyIncluded.length} of ${blobCachedIds.length}`);
      console.log(`  ${incorrectlyIncluded.length === 0 ? '✅ Correctly excluded (FIXED!)' : '❌ Bug still exists!'}`);

      // Check if uncached photos are correctly included
      const uncachedIds = ['photo4', 'photo5', 'photo6', 'photo7', 'photo8', 'photo9', 'photo10'];
      const uncachedIncluded = uncachedIds.filter(id => returnedIds.includes(id));

      console.log(`  Uncached photos returned: ${uncachedIncluded.length} of ${uncachedIds.length}`);
      console.log(`  ${uncachedIncluded.length === 7 ? '✅ Correctly included all' : '❌ Should all be included!'}`);

      console.log("\n✅ FIX SUMMARY:");
      console.log("  1. Photo1, Photo2, Photo3 are cached as BLOBs");
      console.log("  2. getPhotosToCache() now correctly EXCLUDES them");
      console.log("  3. Only uncached photos are returned");
      console.log("  4. No more infinite download loop!");
      console.log("  5. Result: Efficient caching, no wasted bandwidth");

      console.log("\n" + "=".repeat(80));

      // ASSERTIONS - Verify the FIX works correctly

      // FIXED: Should NOT include BLOB-cached photos
      expect(incorrectlyIncluded.length).toBe(0); // No BLOB photos included ✅
      expect(incorrectlyIncluded).toEqual([]);

      // CORRECT: Should include all uncached photos
      expect(uncachedIncluded.length).toBe(7); // All uncached photos correctly included ✅

      // Total returned: 0 BLOB + 7 uncached = 7
      expect(photosToCache.length).toBe(7); // FIXED: Returns only uncached photos!

      console.log("\n✅ FIX VERIFIED: getPhotosToCache() correctly excludes BLOB-cached photos!");
      console.log("   Expected: 7 photos (only uncached)");
      console.log(`   Got: ${photosToCache.length} photos (BLOB-cached correctly excluded)`);

      // After fix, assertions should be:
      // expect(incorrectlyIncluded.length).toBe(0);
      // expect(photosToCache.length).toBe(4);
      // expect(returnedIds).toEqual(['photo7', 'photo8', 'photo9', 'photo10']);
    });
  });
});
