/**
 * Unit tests to demonstrate Bugs #4 and #5: BLOB Storage Issues
 *
 * Bug #5: getCacheSizeBytes() returns 0 for BLOB storage
 * Bug #4: evictOldest() reports incorrect eviction counts and tries to delete non-existent files
 */

const fs = require("fs").promises;
const path = require("path");
const PhotoDatabase = require("../../components/PhotoDatabase");
const CacheManager = require("../../components/CacheManager");

describe("BLOB Storage Bugs - Bug #4 & #5", () => {
  let testDir;
  let dbPath;
  let db;
  let cacheManager;
  let logs;

  // Mock logger that captures logs
  const mockLogger = (...args) => {
    logs.push(args.join(" "));
  };

  // Mock provider
  const mockProvider = {
    downloadPhoto: jest.fn()
  };

  beforeEach(async () => {
    // Create temp directory
    testDir = path.join(__dirname, `temp-blob-bugs-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    dbPath = path.join(testDir, "test_photos.db");
    logs = [];

    // Initialize database
    db = new PhotoDatabase(dbPath, mockLogger, { sortMode: "sequential" });
    await db.initialize();

    // Initialize CacheManager
    const config = {
      maxCacheSizeMB: 1,     // 1 MB limit for testing
      showWidth: 800,
      showHeight: 600
    };

    cacheManager = new CacheManager(config, db, () => mockProvider, mockLogger);

    // Stop the tick timer to avoid interference
    clearInterval(cacheManager.timer);
  });

  afterEach(async () => {
    // Cleanup
    if (db) await db.close();
    await fs.rm(testDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe("Bug #5: Cache Size Calculation Returns 0 for BLOB Storage", () => {

    test("getCacheSizeBytes() correctly calculates BLOB storage size (FIXED)", async () => {
      // Add photos to database
      const photos = [
        { id: "photo1", name: "photo1.jpg", parents: ["folder1"] },
        { id: "photo2", name: "photo2.jpg", parents: ["folder1"] },
        { id: "photo3", name: "photo3.jpg", parents: ["folder1"] }
      ];

      await db.savePhotos(photos);

      // Simulate BLOB storage - store photo data directly in database
      // Each photo is ~50KB JPEG
      const fakeJpegData = Buffer.alloc(50000, 0xFF); // 50KB of data

      for (const photo of photos) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), photo.id]);
      }

      // Verify photos are in BLOB storage
      const cachedCount = await db.getCachedPhotoCount();
      expect(cachedCount).toBe(3);

      // Check actual BLOB size in database
      const actualSize = await db.db.get(`
        SELECT SUM(LENGTH(cached_data)) as total
        FROM photos
        WHERE cached_data IS NOT NULL
      `);
      expect(actualSize.total).toBe(150000); // 3 * 50KB = 150KB

      // FIXED: getCacheSizeBytes() should return 150000
      const reportedSize = await db.getCacheSizeBytes();

      console.log("\n✅ Bug #5 FIXED - Verification:");
      console.log(`  Actual BLOB size in database: ${actualSize.total} bytes (150 KB)`);
      console.log(`  Reported by getCacheSizeBytes(): ${reportedSize} bytes`);
      console.log(`  Expected: 150000, Got: ${reportedSize}`);

      // After fix, this should pass:
      expect(reportedSize).toBe(150000);
    });

    test("Cache size calculation affects eviction trigger", async () => {
      // Setup: maxCacheSizeMB = 1 MB (1048576 bytes)
      // Add enough BLOB photos to exceed limit (2 MB worth)

      const photos = [];
      for (let i = 1; i <= 20; i++) {
        photos.push({
          id: `photo${i}`,
          name: `photo${i}.jpg`,
          parents: ["folder1"]
        });
      }

      await db.savePhotos(photos);

      // Add 2 MB of BLOB data (20 photos * 100KB each)
      const fakeJpegData = Buffer.alloc(100000, 0xFF); // 100KB

      for (const photo of photos) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?,
              last_viewed_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), Date.now(), photo.id]);
      }

      // Actual size: 2 MB (way over 1 MB limit)
      const actualSize = await db.db.get(`
        SELECT SUM(LENGTH(cached_data)) as total
        FROM photos
        WHERE cached_data IS NOT NULL
      `);
      expect(actualSize.total).toBe(2000000); // 2 MB

      // FIXED: Reported size should match actual size
      const reportedSize = await db.getCacheSizeBytes();
      expect(reportedSize).toBe(2000000); // Should match actual

      // Calculate what eviction logic sees
      const reportedMB = reportedSize / (1024 * 1024); // 0 MB
      const actualMB = actualSize.total / (1024 * 1024); // 2 MB
      const limitMB = 1; // 1 MB

      console.log("\n✅ Bug #5 FIXED - Eviction Trigger:");
      console.log(`  Cache limit: ${limitMB} MB`);
      console.log(`  Actual cache size: ${actualMB.toFixed(2)} MB (OVER LIMIT!)`);
      console.log(`  Reported cache size: ${reportedMB.toFixed(2)} MB`);
      console.log(`  Should evict? ${actualMB > limitMB ? "YES" : "NO"} (actual)`);
      console.log(`  Will evict? ${reportedMB > limitMB ? "YES" : "NO"} (reported)`);

      // FIXED: Eviction will trigger because reported size is correct
      expect(reportedMB > limitMB).toBe(true);  // Will evict ✅
      expect(actualMB > limitMB).toBe(true);    // Should evict ✅
      expect(reportedMB).toBeCloseTo(actualMB, 1); // Should match within 0.1 MB
    });
  });

  describe("Bug #4: Cache Eviction Reports Wrong Count for BLOB Storage", () => {

    test("evictOldest() correctly reports eviction count for BLOB photos (FIXED)", async () => {
      // Add 10 photos with BLOB storage
      const photos = [];
      for (let i = 1; i <= 10; i++) {
        photos.push({
          id: `photo${i}`,
          name: `photo${i}.jpg`,
          parents: ["folder1"]
        });
      }

      await db.savePhotos(photos);

      const fakeJpegData = Buffer.alloc(10000, 0xFF); // 10KB each

      // Store as BLOBs with different view times (for LRU eviction)
      for (let i = 0; i < photos.length; i++) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?,
              last_viewed_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), Date.now() - (10000 * (10 - i)), photos[i].id]);
      }

      // Verify all 10 are cached
      const cachedBefore = await db.getCachedPhotoCount();
      expect(cachedBefore).toBe(10);

      // Clear logs
      logs = [];

      // Evict 5 oldest photos
      await cacheManager.evictOldest(5);

      // Check how many are still cached
      const cachedAfter = await db.getCachedPhotoCount();
      expect(cachedAfter).toBe(5); // ✅ Eviction actually works!

      // Check the log message
      const evictionLog = logs.find(log => log.includes("Evicted"));
      console.log("\n✅ Bug #4 FIXED - Verification:");
      console.log(`  Photos before eviction: ${cachedBefore}`);
      console.log(`  Photos after eviction: ${cachedAfter}`);
      console.log(`  Actual photos evicted: ${cachedBefore - cachedAfter}`);
      console.log(`  Log message: "${evictionLog}"`);

      // FIXED: Log should say "Evicted 5 photos"
      expect(evictionLog).toContain("Evicted 5 photos");
    });

    test("evictOldest() correctly evicts BLOB photos (FIXED)", async () => {
      // Add photos with BLOB storage
      const photos = [
        { id: "photo1", name: "photo1.jpg", parents: ["folder1"] },
        { id: "photo2", name: "photo2.jpg", parents: ["folder1"] },
        { id: "photo3", name: "photo3.jpg", parents: ["folder1"] }
      ];

      await db.savePhotos(photos);

      const fakeJpegData = Buffer.alloc(10000, 0xFF);

      for (const photo of photos) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?,
              last_viewed_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), Date.now(), photo.id]);
      }

      // Verify all 3 are cached before eviction
      const cachedBefore = await db.getCachedPhotoCount();
      expect(cachedBefore).toBe(3);

      console.log("\n✅ Bug #4 FIXED - Eviction:");
      console.log(`  Photos before eviction: ${cachedBefore}`);

      // Evict 3 photos
      await cacheManager.evictOldest(3);

      // Verify all 3 were evicted
      const cachedAfter = await db.getCachedPhotoCount();
      expect(cachedAfter).toBe(0);

      console.log(`  Photos after eviction: ${cachedAfter}`);
      console.log(`  FIXED: evictOldest() correctly cleared BLOB data ✅`);
    });
  });

  describe("Combined Bug Impact", () => {

    test("Cache size is correctly calculated and eviction triggers when over limit (FIXED)", async () => {
      // Simulate multiple cache ticks where cache should evict but doesn't

      const maxCacheMB = 0.1; // 100 KB limit
      cacheManager.maxCacheSizeMB = maxCacheMB;

      // Add photos exceeding the limit
      const photos = [];
      for (let i = 1; i <= 20; i++) {
        photos.push({ id: `photo${i}`, name: `photo${i}.jpg`, parents: ["folder1"] });
      }

      await db.savePhotos(photos);

      const fakeJpegData = Buffer.alloc(20000, 0xFF); // 20KB each

      // Store all as BLOBs
      for (const photo of photos) {
        await db.db.run(`
          UPDATE photos
          SET cached_data = ?,
              cached_mime_type = 'image/jpeg',
              cached_at = ?,
              last_viewed_at = ?
          WHERE id = ?
        `, [fakeJpegData, Date.now(), Date.now(), photo.id]);
      }

      // Actual size: 400 KB (20 photos * 20KB)
      const actualSize = await db.db.get(`
        SELECT SUM(LENGTH(cached_data)) as total
        FROM photos
      `);

      // Reported size: 0 KB
      const reportedSize = await db.getCacheSizeBytes();

      const actualMB = actualSize.total / (1024 * 1024);
      const reportedMB = reportedSize / (1024 * 1024);

      console.log("\n✅ Combined Fix Verified:");
      console.log(`  Cache limit: ${maxCacheMB} MB`);
      console.log(`  Actual size: ${actualMB.toFixed(2)} MB (${(actualMB / maxCacheMB).toFixed(1)}x over limit!)`);
      console.log(`  Reported size: ${reportedMB.toFixed(2)} MB`);
      console.log(`  Should evict? ${actualMB > maxCacheMB ? "YES" : "NO"}`);
      console.log(`  Will evict? ${reportedMB > maxCacheMB ? "YES" : "NO"}`);
      console.log(`  Result: Cache eviction will trigger correctly! ✅`);

      expect(actualMB).toBeGreaterThan(maxCacheMB); // WAY over limit
      expect(reportedMB).toBeGreaterThan(maxCacheMB); // Reports correctly over limit

      // FIXED: Eviction will be triggered
      const shouldEvict = reportedMB > maxCacheMB;
      expect(shouldEvict).toBe(true); // ✅ Will evict as expected
      expect(reportedMB).toBeCloseTo(actualMB, 1); // Sizes should match
    });
  });
});
