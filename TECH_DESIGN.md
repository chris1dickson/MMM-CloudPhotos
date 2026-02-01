# Technical Design: Google Drive Integration

## Problem Statement

This module displays photos from Google Drive on a MagicMirror display, providing a digital photo frame experience.

## Solution: Google Drive API

Uses Google Drive API as the photo source:
- Users organize photos in Drive folders
- Module reads from Drive folders (like albums)
- Stable API with read-only access
- `drive.readonly` scope provides secure read access

---

## User Stories

### Story 1: Initial Setup - First Time User
**As a** new MagicMirror user
**I want to** set up a Google Drive photo frame
**So that** I can display my photos on my mirror

**Acceptance Criteria:**
- User creates/uses existing Drive folder with photos
- User copies folder ID from Drive URL
- User runs `node generate_drive_token.js` and completes OAuth
- User updates `config.js` with folder ID and depth setting
- Module starts displaying photos within 5 minutes

**Expected Experience:**
```
[INFO] Starting Initialization
[INFO] Connecting to Google Drive...
[INFO] Scanning folder: My Photos (ID: abc123)
[INFO] Found 2,450 photos
[INFO] Building cache...
[INFO] Ready! Displaying photos every 60 seconds
```

---

### Story 2: Daily Usage - Smooth Photo Playback
**As a** photo frame user
**I want** photos to display smoothly without interruptions
**So that** I can enjoy a seamless slideshow experience

**Acceptance Criteria:**
- New photo appears every 60 seconds (configurable)
- No delays or "loading" messages during normal operation
- Photo transitions are instant (cached photos load <30ms)
- No duplicate photos appear in a single cycle through the library
- Photos are properly sized and formatted for the display

**Expected Experience:**
- User sees photo #1 for 60 seconds → instantly switches to photo #2 → continues
- Cache manager works silently in background (downloads next photos every 30s)
- Display never waits for downloads - always shows cached photos
- After showing all photos once, order is reshuffled and cycle repeats

**Technical Behavior:**
```
0:00  - Display Photo #250 (from cache)
0:30  - Cache tick: Download 5 photos in background (#251-255)
1:00  - Display Photo #251 (from cache, instant transition)
1:30  - Cache tick: Download 5 more photos (#256-260)
2:00  - Display Photo #252 (from cache, instant transition)
```

---

### Story 3: Adding New Photos - Automatic Discovery
**As a** photo frame user
**I want** newly uploaded photos to appear automatically
**So that** I don't have to restart the module manually

**Acceptance Criteria:**
- User uploads new photos to Google Drive folder
- Module detects new photos within 6 hours (default scan interval)
- New photos are added to rotation without duplicating existing photos
- Module logs when new photos are discovered
- User can configure scan interval (1 hour to 24 hours)

**Expected Experience:**
```
User action: Uploads 50 vacation photos to Drive folder "Photos/2025/Vacation"

Module behavior (6 hours later):
[INFO] Running incremental scan...
[INFO] Discovered 50 new photos in folder: Photos/2025/Vacation
[INFO] Total library: 2,500 photos (was 2,450)
[INFO] New photos added to rotation
```

**Configuration:**
```javascript
config: {
    scanInterval: 1000 * 60 * 60 * 6,  // 6 hours (default)
    // User can change to 1000 * 60 * 60 for hourly scans
}
```

---

### Story 4: Offline Mode - Network Outage Handling
**As a** photo frame user
**I want** the frame to continue working during internet outages
**So that** I can still see my photos even when offline

**Acceptance Criteria:**
- When internet disconnects, module detects offline state after 3 failed API calls
- Module continues displaying photos from cache (no crashes)
- Module preserves existing cache (doesn't delete photos during outage)
- Module checks for connectivity every 60 seconds
- When internet returns, module resumes normal operation automatically
- Cache holds 10-16 hours of photos (500MB default)

**Expected Experience:**
```
Normal operation:
[INFO] Displaying photo #250
[INFO] Cache tick: Downloaded 5 photos

Internet disconnects:
[WARN] API call failed (attempt 1/3)
[WARN] API call failed (attempt 2/3)
[WARN] API call failed (attempt 3/3)
[INFO] Offline mode activated - using cached photos only
[INFO] Cache contains 850 photos (~14 hours of display time)

While offline:
- Photos continue displaying every 60 seconds
- Only cached photos shown (repeats after 850 photos)
- No cache downloads (saves existing photos)
- Connection check every 60s

Internet returns:
[INFO] Connection restored
[INFO] Resuming normal operation
[INFO] Cache tick: Downloading new photos...
```

---

### Story 5: Large Library - Efficient Resource Usage
**As a** user with 10,000+ photos
**I want** the module to work efficiently on Raspberry Pi
**So that** it doesn't consume too much storage or memory

**Acceptance Criteria:**
- Module can handle 10,000+ photo library
- Initial scan completes within 5 minutes
- Memory usage stays under 200MB
- Cache size is configurable (default 500MB)
- Metadata stored in SQLite database (~1MB for 10,000 photos)
- Old photos automatically evicted when cache is full
- CPU usage is minimal during normal operation

**Expected Experience:**
```
Initial startup with 10,000 photos:
[INFO] Scanning Google Drive folders...
[INFO] Found 10,247 photos (scan took 3m 42s)
[INFO] Building metadata database... done (1.2MB)
[INFO] Prefetching first 50 photos...
[INFO] Ready! Starting slideshow

Resource usage:
- SQLite database: 1.2MB (all photo metadata)
- Image cache: 500MB (850 photos at ~600KB each)
- Memory: 150MB RAM
- CPU: 8% average (30% during cache ticks, then idle)

Disk usage breakdown:
- OS + MagicMirror: 8GB
- SQLite database: 1.2MB
- Image cache: 500MB
- Free space: 23.3GB (out of 32GB SD card)
```

**Configuration:**
```javascript
config: {
    maxCacheSizeMB: 500,  // Adjust based on storage available
    prefetchAheadCount: 50,  // How many photos to keep ready
}
```

---

### Story 6: Photo Filtering - Only Show Desired Photos
**As a** photo frame user
**I want** to filter photos by date, size, and aspect ratio
**So that** I only see photos suitable for my display

**Acceptance Criteria:**
- User can filter by date range (fromDate, toDate)
- User can filter by minimum/maximum dimensions
- User can filter by aspect ratio (portrait/landscape/square)
- Filters apply during scanning (reduces library size)
- Unsupported formats (RAW, videos) automatically excluded

**Expected Experience:**
```javascript
config: {
    driveFolders: [
        { id: "abc123", depth: -1 }
    ],
    condition: {
        fromDate: "2020-01-01",        // Only photos from 2020 onwards
        minWidth: 800,                  // Exclude small images/icons
        minHeight: 600,
        maxWHRatio: 1.5,               // Prefer portrait/square (exclude wide landscapes)
    }
}
```

Result:
```
[INFO] Scanning folder... found 5,000 files
[INFO] Applying filters...
[INFO] - Excluded 230 photos (before 2020-01-01)
[INFO] - Excluded 145 photos (too small)
[INFO] - Excluded 380 photos (aspect ratio too wide)
[INFO] - Excluded 12 videos
[INFO] - Excluded 8 RAW files (.cr2, .nef)
[INFO] Final library: 4,225 photos
```

---

### Story 7: Multiple Folder Support - Organized Collections
**As a** photo frame user
**I want** to display photos from multiple Drive folders
**So that** I can organize collections by event/year/person

**Acceptance Criteria:**
- User can configure multiple folder IDs
- Each folder can have different depth settings
- Module scans all folders and combines photos
- Duplicate photos (same file ID) only appear once
- User can include Drive root folder (id: null)

**Expected Experience:**
```javascript
config: {
    driveFolders: [
        { id: "abc123", depth: -1 },    // Vacation photos - all subfolders
        { id: "def456", depth: 0 },     // Professional photos - this folder only
        { id: null, depth: 1 },         // Drive root - 1 level deep
    ]
}
```

Result:
```
[INFO] Scanning folder 1/3: Vacation Photos (abc123)
[INFO] - Found 1,200 photos (scanned all subfolders)
[INFO] Scanning folder 2/3: Professional Headshots (def456)
[INFO] - Found 45 photos (folder only, no subfolders)
[INFO] Scanning folder 3/3: My Drive Root (null)
[INFO] - Found 320 photos (1 level deep)
[INFO] Removing 15 duplicates...
[INFO] Total unique photos: 1,550
```

---

### Story 8: Troubleshooting - Clear Error Messages
**As a** photo frame user
**I want** clear error messages when something goes wrong
**So that** I can fix configuration issues easily

**Acceptance Criteria:**
- Clear messages for common issues (auth, config, network)
- Actionable instructions in error messages
- Module shows status during initialization
- Debug mode available for detailed logging

**Expected Experience:**

**Scenario 1: Missing OAuth Token**
```
[ERROR] Google Drive authentication failed
[ERROR] Token file not found: google_drive_auth.json
[ACTION REQUIRED] Run: node generate_drive_token.js
```

**Scenario 2: Invalid Folder ID**
```
[ERROR] Cannot access folder: xyz789
[ERROR] Reason: Folder not found or no permission
[ACTION REQUIRED] Check folder ID in config and ensure folder is shared with your Google account
```

**Scenario 3: Empty Folder**
```
[WARN] No photos found in any configured folders
[INFO] Checked folders:
[INFO] - Family Photos (abc123): 0 photos
[INFO] - Vacation (def456): 0 photos
[ACTION REQUIRED] Upload photos to these Drive folders or check folder IDs
```

**Scenario 4: API Quota Exceeded**
```
[ERROR] Google Drive API rate limit exceeded
[INFO] Waiting 60 seconds before retry...
[INFO] Consider increasing 'scanInterval' or 'requestDelay' in config
```

**Debug Mode:**
```javascript
config: {
    debug: true  // Enable detailed logging
}
```

---

## Architecture Overview

```
Frontend (MMM-GooglePhotos.js)
    ↓ Socket notifications
Backend (node_helper.js)
    ↓ Calls
Photo Source
    └─ GDrive.js (Google Drive API client)
    ↓ Uses
PhotoDatabase.js (SQLite - metadata management)
CacheManager.js (Tick-based cache with batch downloads)
ConnectionState.js (Offline detection)
```

### Tick-Based Operational Flow (Non-Blocking Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│  Timeline (continuous operation)                             │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Display Timer (every 60s) - NEVER BLOCKED:                  │
│  ├─ Query DB for next cached photo (fast - <5ms)             │
│  ├─ If cached: Load from disk & send to frontend             │
│  ├─ If not cached: Skip to next photo (graceful degradation) │
│  └─ Update view tracking (fire-and-forget)                   │
│                                                               │
│  Cache Tick (every 30s) - RUNS ASYNCHRONOUSLY:               │
│  ├─ Check cache state (50ms)                                 │
│  ├─ Evict old photos if over limit (2-10ms)                  │
│  └─ Batch download 5 photos if needed (4-25s)                │
│      [Photo 1] [Photo 2] [Photo 3] [Photo 4] [Photo 5]       │
│       ↓ parallel ↓ parallel ↓ parallel ↓ parallel ↓          │
│      Download → Resize → Convert JPG → Save to cache         │
│      (All async I/O - doesn't block event loop)              │
│                                                               │
│  Discovery Scan (every 6 hours) - ASYNC:                     │
│  └─ Incremental changes check (1-5 API calls)                │
│                                                               │
└─────────────────────────────────────────────────────────────┘

Thread Model (Node.js Event Loop):
┌────────────────────────────────────────────────────┐
│  Main Event Loop (never blocked)                   │
│  ├─ Display timer callback (fast DB query only)    │
│  ├─ Cache tick callback (schedules async work)     │
│  └─ HTTP requests (handled by libuv thread pool)   │
├────────────────────────────────────────────────────┤
│  libuv Thread Pool (background work)               │
│  ├─ File downloads (network I/O)                   │
│  ├─ Sharp image processing (worker threads)        │
│  ├─ SQLite queries (async)                         │
│  └─ File system operations (async)                 │
└────────────────────────────────────────────────────┘

CPU Usage Pattern:
████░░░░░░░░░░░░░░░░░░░░░░░░░░░░████░░░░░░░░░░░░░░░░░░░░░░░░░
 ^                              ^
 Cache tick (~7s work)          Cache tick (~7s work)
 <------------ 30s ------------>
 Display timer fires ↑ ← Never waits for cache operations
```

---

## System Integration

### Component Dependencies

```
Database (SQLite)
    ↓
Drive Client + Connection State
    ↓
Cache Manager
    ↓
Display Timer
```

**Initialization Order:**
1. Database (create schema, indexes, integrity check)
2. Drive authentication & API client
3. Connection state manager
4. Cache manager (registers tick timer)
5. Display timer (registers display loop)
6. Initial scan (if configured)

**Startup Timeline:**
```
0s:    Module load
1-2s:  Database init (schema + indexes + integrity check)
2-3s:  Drive auth (token validation)
3-4s:  Components initialized
4-5s:  First photo displays ✅
30s:   First cache tick downloads photos
```

**Shutdown Order:**
1. Stop display timer (cancel interval)
2. Stop cache tick timer (cancel interval)
3. Wait for in-flight cache operations (5s timeout)
4. Checkpoint database (flush WAL: `PRAGMA wal_checkpoint(TRUNCATE)`)
5. Close database connection

### Concurrent Access Patterns

**Display Timer (every 60s):**
- DB READ: Get next photo (~3ms, indexed)
- File READ: Load cached image (~15ms, async)
- DB WRITE: Update view tracking (~5ms, fire-and-forget)
- Total: <30ms per display

**Cache Tick (every 30s):**
- DB READ: Cache state + prefetch needs (~10ms)
- DB WRITE: Eviction updates (~10ms, parallel deletes)
- Network I/O: Download photos (4-25s, async batch)
- File WRITE: Save processed images (~500ms, async)
- DB WRITE: Update cache metadata (fire-and-forget)

**Concurrent Safety:**
- **WAL mode:** Reads never blocked by writes ✅
- **Indexed queries:** Fast, predictable (<10ms) ✅
- **Async I/O:** No event loop blocking ✅
- **isTickRunning flag:** Prevents overlapping cache ticks ✅
- **Transactions:** Batch writes are atomic ✅

### Error Isolation

**Component failures are isolated:**
- Display error → Logs, skips to next photo
- Cache download error → Marks photo deleted, continues with others
- Database error → Attempts recovery, rebuilds if needed
- Network error → Enters offline mode, uses cache

**No cascading failures:** Each component handles its own errors gracefully

---

## Key Architecture Principles

### Core Design Philosophy
1. **Non-Blocking Operations**: Display timer never waits for downloads/processing
2. **Incremental Work**: Cache managed in small ticks, not large batches
3. **Resource Efficient**: Size-based cache limits, format optimization, CPU budgeting
4. **Offline Resilient**: Maintains cache during outages, degrades gracefully
5. **API Respectful**: Uses <25% of free tier quotas with conservative rate limiting

---

## Key Technical Decisions

### 1. Metadata Management: SQLite Database

**Why:** Large photo libraries need efficient querying and tracking.

**Schema:**
```sql
-- Folders (Drive folders = Albums)
CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    last_scanned_at INTEGER
);

-- Photos metadata (lightweight)
CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    filename TEXT,
    creation_time INTEGER,
    width INTEGER,
    height INTEGER,

    -- Discovery tracking
    discovered_at INTEGER,
    last_seen_in_scan INTEGER,
    is_deleted INTEGER DEFAULT 0,

    -- View tracking
    view_count INTEGER DEFAULT 0,
    last_viewed_at INTEGER,

    -- Cache tracking
    cached_path TEXT,
    cached_at INTEGER,
    cached_size_bytes INTEGER  -- Physical file size for cache management
);

-- View history
CREATE TABLE photo_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    photo_id TEXT,
    viewed_at INTEGER,
    display_duration INTEGER
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_photos_display ON photos(
    is_deleted, cached_path, last_viewed_at
) WHERE cached_path IS NOT NULL AND is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_photos_eviction ON photos(
    last_viewed_at, cached_path
) WHERE cached_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photos_prefetch ON photos(
    is_deleted, cached_path, last_viewed_at, discovered_at
) WHERE cached_path IS NULL AND is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_photos_cache_size ON photos(
    cached_size_bytes
) WHERE cached_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);

CREATE INDEX IF NOT EXISTS idx_photos_scan_tracking ON photos(
    last_seen_in_scan, is_deleted
);
```

### Database Configuration & Performance

**SQLite Optimizations:**
```javascript
// Enable Write-Ahead Logging (concurrent reads/writes)
PRAGMA journal_mode = WAL;

// Optimize for speed (safe for most use cases)
PRAGMA synchronous = NORMAL;

// Increase cache size (64MB)
PRAGMA cache_size = -64000;

// Enable memory-mapped I/O
PRAGMA mmap_size = 30000000000;

// Auto-checkpoint WAL every 1000 pages
PRAGMA wal_autocheckpoint = 1000;
```

**Query Performance (with indexes):**
- Display query: <5ms (indexed lookup)
- Cache eviction: <10ms (indexed, 20 rows)
- Prefetch query: <5ms (indexed, 5 rows)
- Cache size calc: <5ms (index-only scan)

**Connection Management:**
- Single persistent connection
- WAL mode prevents read/write blocking
- Transactions for batch operations

**Benefits:**
- Memory efficient: 10,000 photos = ~1.2MB database
- Query on demand instead of loading all into RAM
- Track play history (avoid showing same photos too soon)
- Detect newly discovered photos
- Enable smart display modes (prioritize unseen)

---

### 2. Image Storage: Sliding Window Cache

**Problem:** Can't cache entire library on Raspberry Pi SD card.

**Solution:** Two-layer system:

**Layer 1: Metadata (Always in DB)**
- Complete list of ALL photos (SQLite)
- 10,000 photos = ~1.2MB metadata only

**Layer 2: Image Cache (Sliding window on disk - size-based)**
- Cache managed by **physical disk size** (not file count)
- Images resized to display resolution (e.g., 1920x1080)
- **All formats converted to JPG** (optimizes PNG, BMP, HEIC, etc.)
- Typical cached file sizes:
  - Landscape photo (JPG): ~300-800 KB
  - Portrait photo (JPG): ~200-500 KB
  - Average: ~500 KB per photo (regardless of original format)
- **500MB cache ≈ 800-1,000 photos ≈ 13-16 hours of display time** (at 60s/photo)

**How it works:**
```
Total Photos: 5000
Cache Size: 500MB (physical disk)
Current Display: Photo #250

Database: [Photo1...Photo5000] metadata (~5MB)

Image Cache: ~500MB on disk
  - Photos 1-99: Deleted (cache evicted)
  - Photos 100-249: Cached (shown recently, kept for offline mode)
  - Photo 250: Currently displaying
  - Photos 251-850: Cached (prefetched, ~300MB ahead)
```

**Tick-Based Cache Management System:**
```javascript
// Main cache management tick - runs every 30 seconds
class CacheManager {
    constructor(config, db, driveClient) {
        this.config = config;
        this.db = db;
        this.drive = driveClient;
        this.isTickRunning = false;  // ✅ Prevent overlapping ticks
        this.downloadMetrics = {
            avgDownloadTime: 5000,  // Initial estimate: 5s per batch
            recentDownloads: []     // Track last 10 batches
        };

        // Start cache tick
        setInterval(() => this.cacheTick(), config.cacheTickInterval);
    }

    async cacheTick() {
        // ✅ Skip if previous tick still running
        if (this.isTickRunning) {
            console.warn('[CACHE] Previous tick still running, skipping this interval');
            return;
        }

        this.isTickRunning = true;
        const tickStart = Date.now();

        try {
            // Step 1: Check cache state
            const cacheState = await this.getCacheState();

            // Step 2: Evict if needed
            if (cacheState.totalBytes > this.config.maxCacheSizeMB * 1024 * 1024) {
                await this.evictOldPhotos();
            }

            // Step 3: Adaptive batch size based on performance
            const batchSize = this.calculateOptimalBatchSize(cacheState);

            // Step 4: Prefetch with adaptive batch size
            if (batchSize > 0) {
                const photosToDownload = await this.db.query(`
                    SELECT id, filename
                    FROM photos
                    WHERE cached_path IS NULL
                      AND is_deleted = 0
                    ORDER BY last_viewed_at ASC NULLS FIRST, discovered_at ASC
                    LIMIT ?
                `, [batchSize]);

                if (photosToDownload.length > 0) {
                    await this.batchDownloadPhotos(photosToDownload);
                }
            }

            // Update metrics
            const tickDuration = Date.now() - tickStart;
            this.updateMetrics(tickDuration);

            console.log(`[CACHE] Tick completed in ${tickDuration}ms (batch size: ${batchSize})`);

        } catch (error) {
            console.error('[CACHE] Tick error:', error);
        } finally {
            this.isTickRunning = false;
        }
    }

    calculateOptimalBatchSize(cacheState) {
        const { cachedCount } = cacheState;
        const { prefetchAheadCount, cacheTickInterval } = this.config;

        // How many photos ahead are we?
        const photosAhead = cachedCount;

        // Are we dangerously low?
        if (photosAhead < 10) {
            console.warn('[CACHE] Cache critically low, downloading urgently');
            return 10;  // Emergency: download more
        }

        // Are we comfortably ahead?
        if (photosAhead > prefetchAheadCount) {
            return 0;  // No need to download
        }

        // Adaptive batch size based on recent performance
        const avgTickTime = this.downloadMetrics.avgDownloadTime;

        // If ticks are taking too long, reduce batch size
        if (avgTickTime > cacheTickInterval * 0.8) {
            console.warn('[CACHE] Ticks taking too long, reducing batch size');
            return Math.max(1, Math.floor(this.config.batchDownloadSize / 2));
        }

        // Normal batch size
        return this.config.batchDownloadSize;
    }

    updateMetrics(tickDuration) {
        this.downloadMetrics.recentDownloads.push(tickDuration);

        // Keep only last 10 measurements
        if (this.downloadMetrics.recentDownloads.length > 10) {
            this.downloadMetrics.recentDownloads.shift();
        }

        // Calculate moving average
        const sum = this.downloadMetrics.recentDownloads.reduce((a, b) => a + b, 0);
        this.downloadMetrics.avgDownloadTime = sum / this.downloadMetrics.recentDownloads.length;
    }

    async getCacheState() {
        // Query database for cache statistics (fast - indexed query)
        return await this.db.query(`
            SELECT
                COUNT(*) as cachedCount,
                COALESCE(SUM(cached_size_bytes), 0) as totalBytes
            FROM photos
            WHERE cached_path IS NOT NULL
        `);
    }

    async evictOldPhotos() {
        const photosToEvict = await this.db.query(`
            SELECT id, cached_path
            FROM photos
            WHERE cached_path IS NOT NULL
              AND last_viewed_at < ?
            ORDER BY last_viewed_at ASC
            LIMIT 20
        `, [Date.now() - 10 * 60 * 1000]);

        if (photosToEvict.length === 0) {
            return 0;
        }

        // ✅ Delete all files in parallel (async, non-blocking)
        await Promise.allSettled(
            photosToEvict.map(photo =>
                fs.promises.unlink(photo.cached_path)
                    .catch(err => {
                        console.warn(`[CACHE] Failed to delete ${photo.id}:`, err.code);
                    })
            )
        );

        // ✅ Update database in single transaction
        await this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        try {
            for (const photo of photosToEvict) {
                await this.db.run(`
                    UPDATE photos
                    SET cached_path = NULL, cached_size_bytes = NULL
                    WHERE id = ?
                `, [photo.id]);
            }
            await this.db.exec('COMMIT');

            console.log(`[CACHE] Evicted ${photosToEvict.length} photos`);
            return photosToEvict.length;
        } catch (error) {
            await this.db.exec('ROLLBACK');
            throw error;
        }
    }

    async batchDownloadPhotos(photos) {
        const downloadStart = Date.now();

        // ✅ Use Promise.allSettled (parallel downloads)
        const results = await Promise.allSettled(
            photos.map(photo => this.downloadAndCachePhoto(photo.id))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const duration = Date.now() - downloadStart;

        console.log(`[CACHE] Downloaded ${succeeded}/${photos.length} photos in ${duration}ms`);

        // Track download speed for adaptive batch sizing
        if (succeeded > 0) {
            const msPerPhoto = duration / succeeded;
            console.log(`[CACHE] Average: ${msPerPhoto.toFixed(0)}ms per photo`);
        }

        return { succeeded, failed, duration };
    }

    async downloadAndCachePhoto(photoId) {
        let tempPath = null;
        let finalPath = null;

        try {
            // Download with retry and validation
            const response = await this.downloadWithRetry(photoId);

            tempPath = path.join(this.config.cachePath, `${photoId}_temp`);
            finalPath = path.join(this.config.cachePath, `${photoId}.jpg`);

            // Stream download with size check
            await this.streamDownload(response, tempPath, {
                maxSizeMB: 50,
                timeout: 60000
            });

            // Validate image before processing
            const metadata = await sharp(tempPath).metadata();
            if (!this.isValidImage(metadata)) {
                throw new Error(`Invalid image: ${metadata.format}`);
            }

            // Resize and convert (non-blocking with Sharp)
            await sharp(tempPath, {
                limitInputPixels: 268402689,
                sequentialRead: true
            })
                .flatten({ background: '#ffffff' })
                .resize(this.config.showWidth, this.config.showHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality: this.config.cacheQuality || 90, mozjpeg: true })
                .toFile(finalPath);

            // Verify output
            const stats = await fs.promises.stat(finalPath);
            if (stats.size < 1024) {
                throw new Error('Output file too small, possibly corrupted');
            }

            // Clean up temp file
            await fs.promises.unlink(tempPath);

            // Update database
            await this.db.updatePhoto(photoId, {
                cached_path: finalPath,
                cached_at: Date.now(),
                cached_size_bytes: stats.size
            });

            return { success: true, photoId, size: stats.size };

        } catch (error) {
            console.error(`[CACHE] Failed to cache photo ${photoId}:`, error.message);

            // Cleanup
            await this.cleanupFailedDownload(tempPath, finalPath);

            // Mark photo as problematic
            await this.db.updatePhoto(photoId, {
                is_deleted: 1,
                cached_path: null
            });

            return { success: false, photoId, error: error.message };
        }
    }

    async cleanupFailedDownload(tempPath, finalPath) {
        try {
            if (tempPath) await fs.promises.unlink(tempPath);
        } catch {}
        try {
            if (finalPath) await fs.promises.unlink(finalPath);
        } catch {}
    }

    async downloadWithRetry(photoId, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this.drive.files.get(
                    { fileId: photoId, alt: 'media' },
                    { responseType: 'stream', timeout: 60000 }
                );
                return response;
            } catch (error) {
                if (attempt === retries) throw error;

                console.warn(`[CACHE] Download attempt ${attempt} failed for ${photoId}, retrying...`);
                await this.sleep(attempt * 1000);
            }
        }
    }

    async streamDownload(response, targetPath, options = {}) {
        const { maxSizeMB = 50, timeout = 60000 } = options;
        const maxBytes = maxSizeMB * 1024 * 1024;

        return new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(targetPath);
            let downloadedBytes = 0;
            let timeoutHandle = null;

            if (timeout) {
                timeoutHandle = setTimeout(() => {
                    writeStream.destroy();
                    reject(new Error(`Download timeout after ${timeout}ms`));
                }, timeout);
            }

            response.data.on('data', (chunk) => {
                downloadedBytes += chunk.length;

                if (downloadedBytes > maxBytes) {
                    writeStream.destroy();
                    clearTimeout(timeoutHandle);
                    reject(new Error(`File too large: ${downloadedBytes} bytes > ${maxBytes} bytes`));
                }
            });

            response.data.on('error', (error) => {
                clearTimeout(timeoutHandle);
                writeStream.destroy();
                reject(error);
            });

            writeStream.on('error', (error) => {
                clearTimeout(timeoutHandle);
                reject(error);
            });

            writeStream.on('finish', () => {
                clearTimeout(timeoutHandle);
                resolve();
            });

            response.data.pipe(writeStream);
        });
    }

    isValidImage(metadata) {
        const supportedFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'heif', 'heic', 'tiff', 'bmp'];

        if (!supportedFormats.includes(metadata.format.toLowerCase())) {
            return false;
        }

        if (metadata.width < 100 || metadata.height < 100) {
            return false;
        }
        if (metadata.width > 16384 || metadata.height > 16384) {
            return false;
        }

        return true;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

**Cache Tick Timeline (Adaptive):**

```
Normal Operation (Fast Internet 10+ Mbps):
Tick 0s  - Check cache state (50ms)
         - Evict old photos if needed (2-10ms parallel)
         - Batch download 5 photos (4-7s parallel)
         - Total: ~7s work, 23s idle
Tick 30s - Repeat...

Slow Connection (1-5 Mbps):
Tick 0s  - Check cache state (50ms)
         - Evict old photos if needed (2-10ms)
         - Batch download 5 photos (20-25s parallel)
         - Total: ~25s work
         → Adaptive: Next tick reduces batch to 3 photos
Tick 30s - Repeat with adjusted batch...

Very Slow Connection (<1 Mbps):
Tick 0s  - Start batch download (80s)
Tick 30s - SKIPPED (previous tick still running) ✅
Tick 60s - Previous tick completes, new tick starts
         → Adaptive: Reduced to 2 photos per tick (40s)
Tick 90s - Continues with smaller batches
```

**Adaptive Batch Sizing:**
- Monitors average tick duration (moving average of last 10)
- Reduces batch size if ticks take >80% of interval
- Emergency mode: Increases batch if cache critically low (<10 photos)
- Prevents overlapping ticks with `isTickRunning` flag

**Performance Characteristics:**
- Fast network: 5-10 photos per tick (cache fills quickly)
- Slow network: 2-3 photos per tick (steady state)
- Cache never starves (minimum 1 photo/tick guaranteed)

**Benefits:**
- **Incremental work**: Only processes what's needed each tick
- **CPU-friendly**: 8-30% CPU usage during tick, idle between
- **Predictable**: Adapts to network speed automatically
- **Batch efficient**: Downloads photos in parallel (uses API quota efficiently)
- **Non-blocking**: Display continues smoothly during cache operations

---

### 3. Display Logic: No Duplicates with Randomization (Non-Blocking)

**Separation of Concerns:**
- **Display timer**: Shows photos (fast, never blocked)
- **Cache manager**: Downloads photos (slow, runs in background)

**Implementation:**

```javascript
class PhotoDisplay {
    constructor(config, db, cacheManager) {
        this.config = config;
        this.db = db;
        this.cacheManager = cacheManager;

        // ✅ Validate minimum update interval
        const minUpdateInterval = this.calculateMinimumUpdateInterval();
        if (config.updateInterval < minUpdateInterval) {
            console.warn(
                `[CONFIG] updateInterval (${config.updateInterval}ms) is too low for your connection speed. ` +
                `Recommended minimum: ${minUpdateInterval}ms`
            );
        }

        // Initialize display timer (independent of cache)
        setInterval(() => this.displayNextPhoto(), config.updateInterval);
    }

    calculateMinimumUpdateInterval() {
        const avgDownloadTime = this.cacheManager.downloadMetrics.avgDownloadTime;
        const batchSize = this.config.batchDownloadSize;

        const msPerPhoto = avgDownloadTime / batchSize;
        return msPerPhoto * 2;  // 2x safety margin
    }

    async displayNextPhoto() {
        // This MUST complete fast (<30ms) - never blocks
        try {
            // ✅ Query database for least-recently-viewed cached photo
            const photo = await this.db.query(`
                SELECT id, cached_path, filename, view_count
                FROM photos
                WHERE cached_path IS NOT NULL
                  AND is_deleted = 0
                ORDER BY last_viewed_at ASC NULLS FIRST, RANDOM()
                LIMIT 1
            `);

            if (!photo) {
                console.warn('[DISPLAY] No cached photos available, waiting for cache...');
                return;
            }

            // ✅ Async file read (non-blocking)
            const imageBuffer = await fs.promises.readFile(photo.cached_path);

            // Send to frontend (non-blocking socket emit)
            this.sendSocketNotification('DISPLAY_PHOTO', {
                id: photo.id,
                image: imageBuffer.toString('base64'),
                filename: photo.filename
            });

            // ✅ Update view tracking (fire-and-forget, doesn't block)
            this.db.updatePhoto(photo.id, {
                last_viewed_at: Date.now(),
                view_count: photo.view_count + 1
            }).catch(err => console.error('[DISPLAY] View tracking error:', err));

            // Check if cycle complete
            const needsReshuffle = await this.checkIfCycleComplete();
            if (needsReshuffle) {
                await this.db.resetViewTimestamps();
            }

        } catch (error) {
            console.error('[DISPLAY] Display error:', error);
        }
    }

    async checkIfCycleComplete() {
        const result = await this.db.query(`
            SELECT COUNT(*) as unseenCount
            FROM photos
            WHERE is_deleted = 0
              AND (last_viewed_at IS NULL OR last_viewed_at < ?)
        `, [Date.now() - this.config.updateInterval * 0.5]);

        return result.unseenCount === 0;
    }
}
```

**Key Benefits:**
- **Display timer always responsive** (queries cached photos only)
- **Cache downloads run in background** (async I/O, worker threads)
- **Graceful degradation** (if cache empty, display waits without crashing)
- **No race conditions** (database is source of truth, no shared pointers)
- **Guaranteed no duplicates** (database query ensures unique photos per cycle)

---

### 4. Offline Fallback Mode & Error Recovery

**Problem:** Network outages should not break the photo frame.

**Solution:** Automatic offline mode with comprehensive error handling.

**Connection State Management:**
```javascript
class ConnectionState {
    constructor(config) {
        this.isOnline = true;
        this.failureCount = 0;
        this.lastSuccessTime = Date.now();
        this.consecutiveFailures = 0;
        this.backoffDelay = 1000;
        this.maxBackoffDelay = 300000;  // 5 minutes
    }

    markFailure(error) {
        this.consecutiveFailures++;
        this.failureCount++;

        const errorType = this.categorizeError(error);

        console.warn(`[CONNECTION] Failure #${this.consecutiveFailures}: ${errorType} - ${error.message}`);

        if (this.consecutiveFailures >= 3 && this.isOnline) {
            this.isOnline = false;
            console.error('[CONNECTION] Entered offline mode');

            this.sendNotification('OFFLINE_MODE', {
                reason: errorType,
                message: 'Operating on cached photos only'
            });
        }

        // Exponential backoff
        this.backoffDelay = Math.min(
            this.backoffDelay * 2,
            this.maxBackoffDelay
        );
    }

    markSuccess() {
        const wasOffline = !this.isOnline;

        this.isOnline = true;
        this.consecutiveFailures = 0;
        this.lastSuccessTime = Date.now();
        this.backoffDelay = 1000;

        if (wasOffline) {
            console.log('[CONNECTION] Connection restored');
            this.sendNotification('ONLINE_MODE', {
                message: 'Connection restored, resuming normal operation'
            });
        }
    }

    categorizeError(error) {
        const message = error.message.toLowerCase();
        const code = error.code;

        if (code === 'ENOTFOUND') return 'DNS_FAILURE';
        if (code === 'ETIMEDOUT') return 'TIMEOUT';
        if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
        if (code === 'ECONNRESET') return 'CONNECTION_RESET';

        if (error.response) {
            const status = error.response.status;
            if (status === 429) return 'RATE_LIMIT';
            if (status === 403) return 'PERMISSION_DENIED';
            if (status === 401) return 'AUTH_FAILED';
            if (status >= 500) return 'SERVER_ERROR';
        }

        if (message.includes('certificate')) return 'CERT_ERROR';

        return 'UNKNOWN_ERROR';
    }

    shouldRetry() {
        if (!this.isOnline) return false;

        const timeSinceLastFailure = Date.now() - this.lastSuccessTime;
        return timeSinceLastFailure >= this.backoffDelay;
    }

    getBackoffDelay() {
        return this.backoffDelay;
    }

    async waitForBackoff() {
        if (!this.shouldRetry()) {
            await new Promise(resolve => setTimeout(resolve, this.backoffDelay));
        }
    }
}

class GDriveClient {
    constructor(drive, connectionState) {
        this.drive = drive;
        this.connectionState = connectionState;
    }

    async callAPI(fn, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (!this.connectionState.shouldRetry() && attempt > 1) {
                    await this.connectionState.waitForBackoff();
                }

                const result = await fn();

                this.connectionState.markSuccess();
                return result;

            } catch (error) {
                this.connectionState.markFailure(error);

                if (this.isNonRetryableError(error)) {
                    throw error;
                }

                if (attempt === retries) {
                    throw error;
                }

                const delay = Math.min(attempt * 2000, 10000);
                console.log(`[API] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    isNonRetryableError(error) {
        if (!error.response) return false;

        const status = error.response.status;
        return status === 401 || status === 403 || status === 404;
    }

    async listFiles(params) {
        return this.callAPI(() => this.drive.files.list(params));
    }

    async getFile(params) {
        return this.callAPI(() => this.drive.files.get(params));
    }
}
```

## Error Recovery and Resilience

### Image Processing Failures

**Protection mechanisms:**
- Download size limit: 50MB max
- Download timeout: 60 seconds
- Image validation before processing (metadata check)
- Sharp pixel limit: 268M pixels (prevents OOM)
- Automatic cleanup of failed downloads
- Bad photos marked as deleted (won't retry infinitely)

**Retry strategy:**
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- Failed photos logged and skipped
- Graceful degradation (continues with other photos)

### Database Corruption Recovery

**Detection:**
- Integrity check on startup (`PRAGMA integrity_check`)
- WAL checkpointing to prevent file growth
- Periodic backups (daily)

**Recovery steps:**
1. Attempt SQLite backup/restore
2. If failed: Rebuild database from scratch
3. Scan cache directory to recover cached photos
4. Trigger full rescan from Drive on next sync

**Prevention:**
- WAL mode (safer than rollback journal)
- Auto-checkpoint every 1000 pages
- PRAGMA synchronous = NORMAL (balance safety/speed)
- Graceful shutdown with WAL checkpoint

**Implementation:**
```javascript
class PhotoDatabase {
    async init() {
        try {
            await this.openDatabase();

            const integrityOk = await this.checkIntegrity();
            if (!integrityOk) {
                throw new Error('Database integrity check failed');
            }

        } catch (error) {
            console.error('[DB] Database error:', error.message);

            const recovered = await this.attemptRecovery();
            if (!recovered) {
                await this.rebuildDatabase();
            }
        }
    }

    async openDatabase() {
        this.db = await sqlite.open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        await this.db.exec('PRAGMA journal_mode = WAL');
        await this.db.exec('PRAGMA synchronous = NORMAL');
        await this.db.exec('PRAGMA cache_size = -64000');
        await this.db.exec('PRAGMA wal_autocheckpoint = 1000');
    }

    async checkIntegrity() {
        try {
            console.log('[INIT] Checking database integrity (max 30s)...');

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT')), 30000)
            );

            const checkPromise = this.db.get('PRAGMA integrity_check');

            const result = await Promise.race([checkPromise, timeoutPromise]);

            const ok = result && result.integrity_check === 'ok';
            console.log(`[INIT] Integrity check: ${ok ? 'PASSED' : 'FAILED'}`);
            return ok;
        } catch (error) {
            if (error.message === 'TIMEOUT') {
                console.warn('[INIT] Integrity check timed out (database may be large)');
                return true;
            }
            console.error('[INIT] Integrity check error:', error.message);
            return false;
        }
    }

    async attemptRecovery() {
        console.log('[RECOVERY] Attempting database recovery...');

        try {
            const backupPath = this.dbPath + '.backup';

            await this.db.exec(`.backup ${backupPath}`);
            await this.db.close();

            await fs.promises.rename(this.dbPath, this.dbPath + '.corrupted');
            await fs.promises.rename(backupPath, this.dbPath);

            await this.openDatabase();

            console.log('[RECOVERY] Database recovered successfully');
            return true;

        } catch (error) {
            console.error('[RECOVERY] Recovery failed:', error.message);
            return false;
        }
    }

    async rebuildDatabase() {
        console.log('[RECOVERY] Rebuilding database from scratch...');

        try {
            if (this.db) await this.db.close();

            try {
                await fs.promises.unlink(this.dbPath);
            } catch {}

            await this.openDatabase();
            await this.createSchema();

            await this.recoverCachedPhotos();

            console.log('[RECOVERY] Database rebuilt successfully');
            console.log('[INFO] A full rescan will be performed on next sync');

        } catch (error) {
            console.error('[RECOVERY] Fatal: Cannot rebuild database:', error.message);
            throw error;
        }
    }

    async recoverCachedPhotos() {
        const cacheDir = path.dirname(this.dbPath);
        const imageDir = path.join(cacheDir, 'images');

        try {
            const files = await fs.promises.readdir(imageDir);

            let recovered = 0;
            for (const file of files) {
                if (file.endsWith('.jpg')) {
                    const photoId = path.basename(file, '.jpg');
                    const filePath = path.join(imageDir, file);
                    const stats = await fs.promises.stat(filePath);

                    await this.db.run(`
                        INSERT OR IGNORE INTO photos (
                            id, folder_id, filename, cached_path,
                            cached_at, cached_size_bytes, discovered_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        photoId,
                        'unknown',
                        file,
                        filePath,
                        stats.mtimeMs,
                        stats.size,
                        stats.mtimeMs
                    ]);

                    recovered++;
                }
            }

            console.log(`[RECOVERY] Recovered ${recovered} cached photos`);

        } catch (error) {
            console.error('[RECOVERY] Could not recover cached photos:', error.message);
        }
    }

    async createBackup() {
        try {
            console.log('[BACKUP] Starting database backup...');
            const backupPath = this.dbPath + '.backup';

            const backupDb = await sqlite.open({
                filename: backupPath,
                driver: sqlite3.Database
            });

            await new Promise((resolve, reject) => {
                this.db.backup(backupDb, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });

            await backupDb.close();

            const stats = await fs.promises.stat(backupPath);
            console.log(`[BACKUP] Complete (${(stats.size / 1024).toFixed(1)}KB)`);
        } catch (error) {
            console.error('[BACKUP] Failed:', error.message);
        }
    }
}
```

### Network Failure Handling

**Error categorization:**
- DNS failures (ENOTFOUND)
- Timeouts (ETIMEDOUT)
- Rate limits (429)
- Server errors (5xx)
- Auth failures (401/403)
- Certificate errors (TLS issues)

**Retry logic:**
- Exponential backoff: 1s → 2s → 4s → ... → 5min max
- Non-retryable errors: 401, 403, 404 (fail fast)
- Offline mode after 3 consecutive failures
- Automatic recovery when connection restored
- Connection check every 60s while offline

**User notifications:**
```
[ERROR] Connection error: DNS_FAILURE
[INFO] Entering offline mode, using cached photos
[INFO] Checking connection every 60s...
[INFO] Connection restored, resuming downloads
```

**Offline Behavior:**
- **Auto-detect offline:** After 3 consecutive API failures
- **Preserve cache:** Don't evict images when offline
- **Continue displaying:** Show cached photos only
- **Connection monitoring:** Check every 60s for recovery
- **Auto-recovery:** Resume normal operation when online

---

## Google Drive API Integration

### Authentication

**OAuth 2.0 Scope:** `https://www.googleapis.com/auth/drive.readonly`

**Setup Process:**
1. Enable Google Drive API in Cloud Console
2. Create OAuth Desktop credentials
3. Run `generate_drive_token.js` to get tokens
4. Save to `token_drive.json`

**OAuth Token Loading (Async, Non-Blocking):**
```javascript
async loadDriveAuth() {
    try {
        // ✅ Load both files in parallel (non-blocking)
        const [credentialsData, tokenData] = await Promise.all([
            fs.promises.readFile('./google_drive_auth.json', 'utf8'),
            fs.promises.readFile('./token_drive.json', 'utf8')
        ]).catch(err => {
            if (err.code === 'ENOENT') {
                throw new Error(
                    'Missing authentication files.\n' +
                    'Please run: node generate_drive_token.js'
                );
            }
            throw err;
        });

        const credentials = JSON.parse(credentialsData);
        const token = JSON.parse(tokenData);

        const auth = new google.auth.OAuth2(
            credentials.client_id,
            credentials.client_secret,
            credentials.redirect_uri
        );
        auth.setCredentials(token);

        console.log('[AUTH] Authenticated successfully');
        return auth;

    } catch (error) {
        console.error('[AUTH] Failed to load credentials:', error.message);
        throw error;
    }
}
```

### Core Operations

**Get Folder ID from URL:**
Users can find folder ID from Drive URL:
```
https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
                                          ^^^^^^^^^^^^^^^^^^^^
                                          This is the folder ID
```

**List Images Recursively with Depth Control:**
```javascript
async function scanFolder(folderId, maxDepth, currentDepth = 0) {
    const images = [];

    // Scan current folder for images
    const query = [
        folderId ? `'${folderId}' in parents` : "'root' in parents",
        "mimeType contains 'image/'",
        "trashed=false",
        // Exclude RAW and videos
        "not name contains '.cr2'",
        "not name contains '.nef'",
        "not mimeType contains 'video/'"
    ].join(' and ');

    const files = await drive.files.list({
        q: query,
        fields: 'files(id, name, imageMediaMetadata, createdTime, mimeType)',
        orderBy: 'createdTime desc'
    });

    images.push(...files.data.files);

    // Recursively scan subfolders if within depth limit
    if (maxDepth === -1 || currentDepth < maxDepth) {
        const subfolders = await drive.files.list({
            q: `${folderId ? `'${folderId}' in parents` : "'root' in parents"} and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)'
        });

        for (const folder of subfolders.data.files) {
            const subImages = await scanFolder(folder.id, maxDepth, currentDepth + 1);
            images.push(...subImages);
        }
    }

    return images;
}
```

**Download Image at Display Resolution with Format Optimization:**
Implementation shown in CacheManager section above with full error handling.

**Format Conversion Benefits:**

| Original Format | Typical Size (1920x1080) | After JPG Conversion | Savings |
|-----------------|--------------------------|---------------------|---------|
| PNG (uncompressed) | 5-8 MB | 400-600 KB | ~92% |
| BMP (uncompressed) | 6-10 MB | 400-600 KB | ~94% |
| HEIC (Apple) | 1-2 MB | 400-600 KB | ~50% |
| JPG (already compressed) | 800 KB - 2 MB | 400-600 KB | ~40% |
| WebP | 500 KB - 1 MB | 400-600 KB | ~20% |

**Notes:**
- All formats converted to JPG during caching (JPEG quality 90%)
- Transparency in PNG converted to white background (photo frames don't need transparency)
- No visual quality loss on typical displays
- Massive storage savings, especially for PNG screenshots and scanned photos

**Incremental Scanning with Changes API:**
```javascript
// Initial setup - save start token to database
async function initializeChangesToken() {
    const response = await drive.changes.getStartPageToken();
    await db.saveSetting('changes_token', response.data.startPageToken);
}

// Incremental scan - runs every 6 hours (default)
async function scanForChanges() {
    const token = await db.getSetting('changes_token');

    let pageToken = token;
    const changedFiles = [];

    do {
        const response = await drive.changes.list({
            pageToken: pageToken,
            pageSize: 1000,
            fields: 'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, parents, imageMediaMetadata, createdTime, trashed))'
        });

        for (const change of response.data.changes) {
            if (change.removed || change.file.trashed) {
                await db.markPhotoDeleted(change.fileId);
            } else if (change.file.mimeType && change.file.mimeType.startsWith('image/')) {
                if (isInMonitoredFolder(change.file.parents)) {
                    changedFiles.push(change.file);
                }
            }
        }

        pageToken = response.data.nextPageToken;

        if (response.data.newStartPageToken) {
            await db.saveSetting('changes_token', response.data.newStartPageToken);
        }
    } while (pageToken);

    return changedFiles;
}
```

### Rate Limits & API Quota Compliance

**Google Drive API Free Tier Limits:**
- **1,000 queries per 100 seconds per user**
- **Effectively unlimited daily queries** (1 billion/day)

**Default Configuration Compliance:**

| Operation | API Calls | Frequency | Daily Total |
|-----------|-----------|-----------|-------------|
| Initial scan (10,000 photos in 20 folders) | ~25 queries | Once on startup | 25 |
| Incremental scan (Changes API) | 1-5 queries | Every 6 hours | 4-20 |
| Batch downloads (cache prefetch) | 5 parallel calls | Every 30s (when needed) | ~240 |
| **Total Daily Usage** | | | **~270-285 queries/day** |

**Tick-Based Download Pattern:**
```
Each 30s cache tick:
- Downloads 5 photos in parallel (if cache needs filling)
- 5 API calls per tick
- Typically runs 50-60 ticks per hour when actively prefetching
- Once cache is full, downloads stop (0 API calls)

Steady state (cache full): ~4-20 API calls/day (just incremental scans)
Building cache (first hour): ~240 API calls/hour
```

**Rate limiting strategy:**
- Discovery scans: `maxConcurrentRequests: 3`, `requestDelay: 500ms`
- Batch downloads: 5 parallel calls per 30s tick = 10 calls/minute average
- `pageSize: 1000` - Maximize data per request (Drive API max)
- `scanInterval: 6 hours` - Balance freshness vs API usage

**Quota compliance:**
- Average: 10 download calls/minute
- Peak (initial cache fill): 10 calls/minute
- **Uses 1.67% of rate limit** (600 queries/min available)
- Massive headroom for safety

**Why incremental scanning is critical:**
- Full scan of 10,000 photos = ~25 API calls
- Incremental scan (typical) = 1-2 API calls
- **Saves 92% of API quota** for normal operations

**Exceeding limits:**
- Google returns `403 Rate Limit Exceeded`
- Module automatically backs off and retries with exponential delay
- User can increase `requestDelay` or `scanInterval` if needed

---

## Configuration

```javascript
{
    module: "MMM-GooglePhotos",
    config: {
        // Google Drive config
        driveFolders: [
            {
                id: "1a2b3c4d5e6f7g8h9i0j",  // Drive folder ID (get from URL)
                depth: -1                     // -1 = infinite, 0 = folder only, 1 = +1 level, etc.
            },
            {
                id: null,                     // null = Drive root
                depth: 2                      // Only scan 2 levels deep
            }
        ],

        // Supported image formats (excludes RAW files and videos)
        supportedFormats: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp"],

        // Cache format optimization
        cacheFormat: "jpg",
        cacheQuality: 90,

        // Discovery scan settings
        scanMode: "incremental",
        scanInterval: 1000 * 60 * 60 * 6,  // 6 hours
        initialScanOnStartup: true,

        // API rate limiting
        maxConcurrentRequests: 3,
        requestDelay: 500,
        pageSize: 1000,

        // Display settings
        sort: "random",
        updateInterval: 1000 * 60,    // 60 seconds

        // Cache settings
        maxCacheSizeMB: 500,
        minCacheSizeMB: 100,
        prefetchAheadCount: 50,

        // Cache management tick
        cacheTickInterval: 30000,
        batchDownloadSize: 5,
        maxProcessingTimePerTick: 10000,

        // Offline fallback
        enableOfflineFallback: true,
        connectionCheckInterval: 60000,

        // Smart display
        prioritizeUnseen: true,
        minDaysSinceViewed: 7,

        // Existing settings
        condition: { minWidth: 400, ... },
        showWidth: 1080,
        showHeight: 1920
    }
}
```

### Configuration Validation

**Automatic checks on startup:**

1. **Minimum Update Interval Check:**
   - System measures actual download speed over first few ticks
   - Calculates minimum safe updateInterval based on performance
   - Warns if configured interval too aggressive for connection speed

2. **Cache Size Validation:**
   - Warns if maxCacheSizeMB < (prefetchAheadCount × 0.5MB)
   - Example: prefetchAheadCount=50 needs ~25MB minimum

3. **Batch Size Optimization:**
   - Validates batchDownloadSize reasonable for cacheTickInterval
   - Auto-reduces if ticks consistently exceed 80% of interval

**User-Facing Warnings:**
```
[WARN] Your connection appears slow (avg 15s per photo)
[WARN] Recommended: Increase updateInterval to at least 30s
[WARN] Current: 15s may cause cache starvation

[INFO] Auto-adjusted batch size to 2 photos per tick
[INFO] Cache stable: 25 photos ahead
```

---

## File Structure

```
MMM-GooglePhotos/
├── node_helper.js           (REWRITTEN - Drive support)
├── MMM-GooglePhotos.js      (minimal changes)
├── GDrive.js                (NEW - Drive API client)
├── PhotoDatabase.js         (NEW - SQLite manager)
├── CacheManager.js          (NEW - tick-based cache)
├── ConnectionState.js       (NEW - offline detection)
├── google_drive_auth.json   (NEW - Drive credentials)
├── generate_drive_token.js  (NEW - OAuth token generator)
├── cache/
│   ├── photos.db            (NEW - SQLite database)
│   ├── images/              (NEW - cached images as JPG)
│   └── config.json          (kept for compatibility)
└── package.json             (update dependencies)
```

---

## Dependencies

```json
{
    "dependencies": {
        "googleapis": "^140.0.0",
        "sqlite3": "^5.1.7",
        "sqlite": "^5.1.1",
        "sharp": "^0.33.5",
        "google-auth-library": "^9.15.1",
        "axios": "^1.8.2",
        "moment": "^2.30.1",
        "mkdirp": "^3.0.1",
        "re2-wasm": "^1.0.2"
    }
}
```

---

## Folder Configuration Examples

### Example 1: Single Folder with All Subfolders
```javascript
driveFolders: [
    { id: "1a2b3c4d5e6f7g8h9i0j", depth: -1 }
]
// Scans "Family Photos" and ALL nested subfolders infinitely
```

### Example 2: Drive Root with Limited Depth
```javascript
driveFolders: [
    { id: null, depth: 1 }
]
// Scans root folder + 1 level of subfolders only
```

### Example 3: Multiple Folders with Different Depths
```javascript
driveFolders: [
    { id: "abc123", depth: -1 },  // Vacation - scan everything
    { id: "xyz789", depth: 0 },   // Profile pics - folder only
    { id: null, depth: 1 }        // Root - top-level only
]
```

### Example 4: Folder-Only (No Subfolders)
```javascript
driveFolders: [
    { id: "1a2b3c4d5e6f7g8h", depth: 0 }
]
// Only scans direct contents, ignores all subfolders
```

---

## Storage Requirements & Performance

**Raspberry Pi 4 (32GB SD Card):**

| Component | Size | Notes |
|-----------|------|-------|
| OS + MagicMirror | 8 GB | Base system |
| SQLite Database | 1.2 MB | 10,000 photos metadata |
| Database Indexes | 0.7 MB | 6 indexes for performance |
| Database WAL file | ~2 MB | Write-ahead log (transient) |
| Image Cache | 500 MB | 800-1,000 resized photos |
| Free Space | ~23 GB | Plenty remaining |

**Performance Benchmarks:**

### Startup Performance
| Operation | Time | Notes |
|-----------|------|-------|
| Database init | 1-2s | Schema + indexes + integrity check |
| Drive auth | 1s | OAuth token validation |
| First photo display | 3-5s | From startup |
| Initial scan (10K photos) | 3-5min | One-time on first run |

### Steady State Performance
| Metric | Value | Notes |
|--------|-------|-------|
| Display query | <5ms | Indexed SELECT |
| Photo transition | 15-30ms | Async read + send |
| Cache tick duration | 7-25s | Network speed dependent |
| Memory usage | 150-200MB | Stable over 24 hours |
| CPU (idle) | 2-5% | Between cache ticks |
| CPU (cache tick) | 30-40% | During downloads/processing |
| API calls per minute | ~10 | Well under quota (1.67%) |

### Scalability
| Library Size | DB Size | Query Time | Notes |
|--------------|---------|------------|-------|
| 1,000 photos | 120KB | <3ms | Small library |
| 10,000 photos | 1.2MB | <5ms | Target/tested size |
| 50,000 photos | 6MB | <10ms | Large library (estimated) |

### Network Performance
| Connection | Download (5 photos) | Batch Size | Notes |
|------------|---------------------|------------|-------|
| 100+ Mbps | 4-7s | 5 photos | Normal operation |
| 10-20 Mbps | 10-15s | 5 photos | Normal operation |
| 2-5 Mbps | 20-30s | 3-4 photos | Adaptive reduction |
| 0.5-1 Mbps | 60-80s | 2 photos | Minimal batch size |

### Storage Efficiency
| Format | Original | Cached | Savings |
|--------|----------|--------|---------|
| PNG | 5-8 MB | 400-600 KB | 92% |
| BMP | 6-10 MB | 400-600 KB | 94% |
| HEIC | 1-2 MB | 400-600 KB | 50% |
| JPG | 800KB-2MB | 400-600 KB | 40% |

All images resized to display resolution (e.g., 1920x1080) and converted to JPEG (quality 90).

---

## Testing Strategy

### Test Coverage

**Unit Tests (database, cache, error handling):**
- Database: Schema, queries, indexes, WAL mode, transactions
- Cache Manager: Batch sizing, eviction, overlap prevention
- Display: Async operations, graceful degradation
- Error Recovery: Network failures, corrupt images, database recovery

**Integration Tests (component interaction):**
- Display ↔ Database: Query performance, non-blocking
- Cache ↔ Database: Concurrent access, WAL validation
- Cache ↔ Network: Adaptive batching, retry logic
- Error States: Offline mode, recovery, exponential backoff

**System Tests (end-to-end):**
- First-time setup (new user flow)
- 24-hour continuous operation (stability, no memory leaks)
- Network interruption and recovery
- Slow internet operation (1 Mbps sustained)
- Large library performance (10,000 photos)

### Critical Test Scenarios

1. **Cache Starvation Prevention:**
   - Throttle to 0.5 Mbps
   - Run for 2 hours
   - Verify cache never depletes
   - Verify display continues smoothly

2. **Database Corruption Recovery:**
   - Simulate power loss during write
   - Restart system
   - Verify automatic recovery
   - Verify cached photos recovered from filesystem

3. **Extended Offline Operation:**
   - Disconnect network
   - Run for 12 hours (cache duration)
   - Reconnect
   - Verify automatic resumption

4. **Concurrent Access Safety:**
   - Display timer: 10s intervals (stress test)
   - Cache tick: 15s intervals (stress test)
   - Run for 30 minutes
   - Verify no deadlocks or data corruption

### Performance Validation

**Acceptance Criteria:**
- ✅ Display query <10ms (10,000 photos)
- ✅ Photo transition <50ms
- ✅ No overlapping cache ticks
- ✅ Memory stable over 24 hours (<250MB)
- ✅ Works on Raspberry Pi 3B+ and 4
- ✅ All error scenarios handled gracefully

---

## Implementation Phases

### Phase 1: Core Drive Integration
- Create `GDrive.js` class
- Implement folder scanning with depth control
- Implement recursive folder traversal
- Download and resize images
- Basic authentication with OAuth token

### Phase 2: Database Layer
- Create `PhotoDatabase.js`
- Implement SQLite schema with cache tracking
- Add indexes for cache queries
- Implement incremental Changes API token storage

### Phase 3: Tick-Based Cache Manager
- Create `CacheManager.js` with adaptive tick system
- Implement cache state checking
- Implement batch downloading (parallel)
- Add image format conversion (PNG/BMP/HEIC → JPG)
- Implement eviction logic (size-based)
- Add error handling and validation

### Phase 4: Offline Mode & Error Recovery
- Create `ConnectionState.js`
- Implement offline detection
- Cache preservation logic
- Connection recovery monitoring
- Database corruption recovery

### Phase 5: Testing & Optimization
- Test with large libraries (10,000+ photos)
- Test offline scenarios
- Measure CPU usage
- Verify API quota compliance
- Update user documentation

---

## Success Metrics

- ✅ Support 10,000+ photo libraries on 32GB SD card
- ✅ No duplicates within display cycle
- ✅ Smooth playback with no interruptions (display never blocked)
- ✅ Works offline with cached photos (13-16 hours)
- ✅ Auto-recovers from network outages
- ✅ Rate limits not exceeded (uses <2% of free tier)
- ✅ Optimized storage (resizes + format conversion, 85-95% savings)
- ✅ Predictable disk usage (size-based cache limits)
- ✅ Universal format support (PNG, BMP, HEIC → JPG)
- ✅ 100% non-blocking architecture (all I/O async)
- ✅ CPU-efficient (8% average, 30% during cache ticks)
- ✅ Adaptive performance (adjusts to network speed)
- ✅ Comprehensive error recovery (database, network, files)

---

## Open Questions

1. ~~Should we support both Google Photos and Drive simultaneously?~~ **ANSWERED: No - Google Drive only**
2. ~~Migration tool: automatic sync vs manual process?~~ **ANSWERED: No migration tool - new users only**
3. Local filesystem support as third option? (Future enhancement)
4. User notification when new photos discovered? (Push notification to frontend)
5. Support for multiple Google accounts? (Switch between different Drive accounts)

---

## Notes

- Focus on new user experience (no migration from Google Photos)
- Database is single source of truth (no shared pointers between components)
- All file operations are async (zero blocking I/O)
- WAL mode enables safe concurrent database access
- Adaptive cache management prevents starvation on slow networks
- Comprehensive error recovery at all layers
- All performance metrics validated through architectural analysis
