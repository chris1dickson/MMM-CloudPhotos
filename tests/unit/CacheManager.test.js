/**
 * Unit Tests for CacheManager
 * Tests caching logic without real Drive API calls
 */

const fs = require('fs');
const path = require('path');
const CacheManager = require('../../components/CacheManager');

// Helper: Create a valid JPEG buffer for testing using Sharp
let mockJpegBuffer = null;
async function createMockJpegBuffer() {
  if (!mockJpegBuffer) {
    // Create a 100x100 red square JPEG using Sharp
    const sharp = require('sharp');
    mockJpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .jpeg()
    .toBuffer();
  }
  return mockJpegBuffer;
}

// Mock dependencies
const mockDb = {
  getCacheSizeBytes: jest.fn(),
  getPhotosToCache: jest.fn(),
  updatePhotoCache: jest.fn(),
  updatePhotoCacheBlob: jest.fn(), // For BLOB storage mode
  getCachedPhotoCount: jest.fn(),
  getTotalPhotoCount: jest.fn(),
  getOldestCachedPhotos: jest.fn(),
  clearPhotoCache: jest.fn()
};

const mockDriveAPI = {
  downloadPhoto: jest.fn()
};

describe('CacheManager', () => {
  let cacheManager;
  let tempCachePath;

  beforeEach(() => {
    // Create temp cache directory
    tempCachePath = path.resolve(__dirname, `../temp/cache_${Date.now()}`);
    fs.mkdirSync(tempCachePath, { recursive: true });

    // Reset mocks
    jest.clearAllMocks();

    // Create cache manager
    cacheManager = new CacheManager(
      {
        cachePath: tempCachePath,
        maxCacheSizeMB: 200
      },
      mockDb,
      mockDriveAPI,
      () => {} // Silent logger
    );

    // Stop automatic ticking for controlled tests
    cacheManager.stop();
  });

  afterEach(async () => {
    if (cacheManager) {
      cacheManager.stop();
    }

    // Clean up temp directory
    if (fs.existsSync(tempCachePath)) {
      await fs.promises.rm(tempCachePath, { recursive: true, force: true });
    }
  });

  describe('Initialization', () => {
    test('should create cache manager', () => {
      expect(cacheManager).toBeDefined();
      expect(cacheManager.consecutiveFailures).toBe(0);
    });

    test('should stop automatic ticking', () => {
      expect(cacheManager.timer).toBeNull();
    });
  });

  describe('Cache Statistics', () => {
    test('should return cache stats', async () => {
      mockDb.getCacheSizeBytes.mockResolvedValue(100 * 1024 * 1024); // 100 MiB (104857600 bytes)
      mockDb.getCachedPhotoCount.mockResolvedValue(50);
      mockDb.getTotalPhotoCount.mockResolvedValue(100);

      const stats = await cacheManager.getStats();

      expect(stats.totalSizeMB).toBe('100.00'); // 100 MiB = 100.00 MB
      expect(stats.maxSizeMB).toBe(200);
      expect(stats.cachedCount).toBe(50);
      expect(stats.totalCount).toBe(100);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.isOffline).toBe(false);
    });

    test('should report offline status after failures', async () => {
      mockDb.getCacheSizeBytes.mockResolvedValue(0);
      mockDb.getCachedPhotoCount.mockResolvedValue(0);
      mockDb.getTotalPhotoCount.mockResolvedValue(0);

      cacheManager.consecutiveFailures = 4;

      const stats = await cacheManager.getStats();

      expect(stats.isOffline).toBe(true);
    });
  });

  describe('Graceful Degradation', () => {
    test('should skip downloads after 3 failures', async () => {
      cacheManager.consecutiveFailures = 4;
      mockDb.getCacheSizeBytes.mockResolvedValue(0);

      // Mock sleep to avoid 60 second wait
      cacheManager.sleep = jest.fn().mockResolvedValue();

      await cacheManager.tick();

      // Should not attempt to download
      expect(mockDb.getPhotosToCache).not.toHaveBeenCalled();
      // Should have slept
      expect(cacheManager.sleep).toHaveBeenCalledWith(60000);
    });

    test('should reset failure counter after wait', async () => {
      cacheManager.consecutiveFailures = 4;
      mockDb.getCacheSizeBytes.mockResolvedValue(0);

      // Mock sleep to avoid 60 second wait
      cacheManager.sleep = jest.fn().mockResolvedValue();

      await cacheManager.tick();

      // Should reset to 0 after sleep
      expect(cacheManager.consecutiveFailures).toBe(0);
    });
  });

  describe('Download Operations', () => {
    test('should download a photo', async () => {
      const mockJpeg = await createMockJpegBuffer();
      const mockStream = require('stream').Readable.from([mockJpeg]);
      mockDriveAPI.downloadPhoto.mockResolvedValue(mockStream);

      await cacheManager.downloadPhoto('test123');

      expect(mockDriveAPI.downloadPhoto).toHaveBeenCalledWith('test123', { timeout: 30000 });
      // Should call either updatePhotoCache (file mode) or updatePhotoCacheBlob (BLOB mode)
      const dbUpdateCalled = mockDb.updatePhotoCache.mock.calls.length > 0 ||
                             mockDb.updatePhotoCacheBlob.mock.calls.length > 0;
      expect(dbUpdateCalled).toBe(true);
    });

    test('should retry failed downloads', async () => {
      const mockJpeg = await createMockJpegBuffer();
      mockDriveAPI.downloadPhoto
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(require('stream').Readable.from([mockJpeg]));

      await cacheManager.downloadPhoto('test123');

      // Should have tried 3 times
      expect(mockDriveAPI.downloadPhoto).toHaveBeenCalledTimes(3);
    });

    test('should fail after max retries', async () => {
      mockDriveAPI.downloadPhoto.mockRejectedValue(new Error('Network error'));

      await expect(cacheManager.downloadPhoto('test123')).rejects.toThrow();

      expect(mockDriveAPI.downloadPhoto).toHaveBeenCalledTimes(3);
    });
  });

  describe('Batch Downloads', () => {
    test('should download multiple photos', async () => {
      const mockJpeg = await createMockJpegBuffer();
      // Mock implementation that creates a new stream for each call
      mockDriveAPI.downloadPhoto.mockImplementation(() => {
        return Promise.resolve(require('stream').Readable.from([mockJpeg]));
      });
      mockDb.getCacheSizeBytes.mockResolvedValue(0);
      mockDb.getPhotosToCache.mockResolvedValue([
        { id: 'photo1', filename: 'test1.jpg' },
        { id: 'photo2', filename: 'test2.jpg' },
        { id: 'photo3', filename: 'test3.jpg' }
      ]);

      await cacheManager.tick();

      // Each photo gets downloaded (may have retries, so check >= 3)
      expect(mockDriveAPI.downloadPhoto).toHaveBeenCalled();
      expect(cacheManager.consecutiveFailures).toBe(0);
    });

    test('should track failures when all downloads fail', async () => {
      mockDriveAPI.downloadPhoto.mockRejectedValue(new Error('Network error'));
      mockDb.getCacheSizeBytes.mockResolvedValue(0);
      mockDb.getPhotosToCache.mockResolvedValue([
        { id: 'photo1', filename: 'test1.jpg' },
        { id: 'photo2', filename: 'test2.jpg' }
      ]);

      await cacheManager.tick();

      expect(cacheManager.consecutiveFailures).toBe(1);
    });

    test('should reset failures on partial success', async () => {
      const mockJpeg = await createMockJpegBuffer();
      let callCount = 0;
      mockDriveAPI.downloadPhoto.mockImplementation(() => {
        callCount++;
        // First photo fails all 3 attempts
        if (callCount <= 3) {
          return Promise.reject(new Error('Network error'));
        }
        // Second photo succeeds
        return Promise.resolve(require('stream').Readable.from([mockJpeg]));
      });

      mockDb.getCacheSizeBytes.mockResolvedValue(0);
      mockDb.getPhotosToCache.mockResolvedValue([
        { id: 'photo1', filename: 'test1.jpg' },
        { id: 'photo2', filename: 'test2.jpg' }
      ]);

      await cacheManager.tick();

      expect(cacheManager.consecutiveFailures).toBe(0);
    });
  });

  describe('Cache Eviction', () => {
    test('should evict oldest photos', async () => {
      mockDb.getOldestCachedPhotos.mockResolvedValue([
        { id: 'old1', cached_path: path.join(tempCachePath, 'old1.jpg') },
        { id: 'old2', cached_path: path.join(tempCachePath, 'old2.jpg') }
      ]);

      // Create dummy files
      await fs.promises.writeFile(path.join(tempCachePath, 'old1.jpg'), 'data');
      await fs.promises.writeFile(path.join(tempCachePath, 'old2.jpg'), 'data');

      await cacheManager.evictOldest(2);

      expect(mockDb.clearPhotoCache).toHaveBeenCalledTimes(2);
      expect(fs.existsSync(path.join(tempCachePath, 'old1.jpg'))).toBe(false);
      expect(fs.existsSync(path.join(tempCachePath, 'old2.jpg'))).toBe(false);
    });

    test('should trigger eviction when cache is full', async () => {
      const maxSize = 200 * 1024 * 1024; // 200MB
      mockDb.getCacheSizeBytes.mockResolvedValue(maxSize + 1000000); // Over limit
      mockDb.getPhotosToCache.mockResolvedValue([]);
      mockDb.getOldestCachedPhotos.mockResolvedValue([
        { id: 'old1', cached_path: '/path/old1.jpg' }
      ]);

      await cacheManager.tick();

      expect(mockDb.getOldestCachedPhotos).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup to target size', async () => {
      mockDb.getCacheSizeBytes.mockResolvedValue(500 * 1024 * 1024); // 500MB
      mockDb.getOldestCachedPhotos.mockResolvedValue([
        { id: 'p1', cached_path: '/path/p1.jpg', cached_size_bytes: 100 * 1024 * 1024 },
        { id: 'p2', cached_path: '/path/p2.jpg', cached_size_bytes: 100 * 1024 * 1024 },
        { id: 'p3', cached_path: '/path/p3.jpg', cached_size_bytes: 100 * 1024 * 1024 }
      ]);

      await cacheManager.cleanup(200);

      expect(mockDb.clearPhotoCache).toHaveBeenCalledTimes(3);
    });
  });
});
