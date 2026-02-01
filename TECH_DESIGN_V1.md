# Technical Design V1: Google Photos Integration (Consensus)

## Document Status
**Version**: 1.0 (Post-Debate Refinement)
**Date**: 2026-01-31
**Status**: Ready for Implementation

**Changes from Original**:
- Removed ~40% complexity based on Tech Lead vs Challenger debate
- Simplified requirements based on Simplifier vs Challenger debate
- Focus on shippable MVP with measurable success criteria

---

## Problem Statement

Display photos from Google Photos on a MagicMirror display, providing a reliable digital photo frame experience.

**Core Value Proposition**: Photos display smoothly every 60 seconds without interruptions, handling network issues gracefully.

---

## V1 Scope: What We're Building

### In Scope
✅ **Google Photos API integration** (keep existing working code)
✅ **SQLite metadata management** (standard mode, no WAL)
✅ **Tick-based cache** (fixed batch size, no adaptive logic)
✅ **Incremental scanning** (Changes API to detect new photos)
✅ **Basic corruption detection** (detect and rebuild on startup)
✅ **Multiple album support** (simple array, no recursion)
✅ **Basic filtering** (skip videos, validate mime types)

### Out of Scope (Future V2)
❌ Google Drive API integration
❌ Offline mode with elaborate state management
❌ Format conversion (PNG/HEIC → JPG)
❌ WAL mode and complex database recovery
❌ Adaptive batch sizing with performance metrics
❌ Recursive folder scanning with depth control
❌ Elaborate error recovery state machines
❌ Photo filtering by date/size/aspect ratio

---

## User Stories (Simplified: 4 Core Stories)

### Story 1: Initial Setup
**As a** new MagicMirror user
**I want to** set up Google Photos integration quickly
**So that** I can see my photos within 10 minutes

**Acceptance Criteria:**
- User runs OAuth setup script
- User configures album IDs in config.js
- Module starts displaying photos within 10 minutes
- Clear error messages if setup fails

**Success Metric**: <10 minute time-to-first-photo

---

### Story 2: Smooth Playback
**As a** photo frame user
**I want** photos to display without interruptions
**So that** I have a seamless slideshow experience

**Acceptance Criteria:**
- New photo every 60 seconds (configurable)
- No duplicate photos within a single cycle
- Transitions are instant (<100ms from cache)
- Cache works in background without blocking display

**Success Metric**: Zero stutters or "loading" messages during normal operation

---

### Story 3: New Photo Discovery
**As a** photo frame user
**I want** newly uploaded photos to appear automatically
**So that** my display stays current

**Acceptance Criteria:**
- Module checks for new photos every 6 hours (configurable)
- Uses Changes API for efficient incremental scanning
- New photos added to rotation without duplicates
- Scan completes in <3 seconds for typical updates

**Success Metric**: <3s incremental scan time

---

### Story 4: Error Resilience
**As a** photo frame user
**I want** the module to handle errors gracefully
**So that** temporary issues don't break my display

**Acceptance Criteria:**
- Corrupt database detected on startup
- Auto-rebuild from API if corruption detected
- Network errors retry with exponential backoff (max 3 attempts)
- Module logs clear error messages

**Success Metric**: Zero crashes over 7 days continuous operation

---

## Architecture

### Component Structure
```
MMM-GooglePhotos/
├── MMM-GooglePhotos.js        (Frontend - minimal changes)
├── node_helper.js             (Backend - core logic)
├── components/
│   ├── PhotoDatabase.js       (SQLite manager - standard mode)
│   ├── CacheManager.js        (Fixed batch downloads)
│   └── PhotosAPI.js           (Google Photos client)
└── cache/
    ├── photos.db              (SQLite database)
    └── images/                (Cached photo files)
```

### Data Flow
```
Frontend (display timer: 60s)
    ↓
Backend (node_helper.js)
    ↓
PhotoDatabase.js (query next photo - <5ms)
    ↓
Send cached photo to frontend
    ↓
CacheManager (tick: 30s, batch=5)
    ↓
PhotosAPI.js (Google Photos API)
```

---

## Database Schema (Simplified)

```sql
-- Photos metadata
CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    album_id TEXT NOT NULL,
    filename TEXT,
    creation_time INTEGER,

    -- View tracking
    last_viewed_at INTEGER,
    view_count INTEGER DEFAULT 0,

    -- Cache tracking
    cached_path TEXT,
    cached_at INTEGER,
    cached_size_bytes INTEGER
);

-- Single index for display query
CREATE INDEX idx_photos_display ON photos(
    cached_path, last_viewed_at
) WHERE cached_path IS NOT NULL;

-- Single index for prefetch
CREATE INDEX idx_photos_prefetch ON photos(
    last_viewed_at
) WHERE cached_path IS NULL;
```

**Configuration**: Standard SQLite mode (no WAL, no complex recovery)

---

## Cache Management (Simplified)

### Fixed Batch System
```javascript
class CacheManager {
    constructor(config, db, photosClient) {
        this.config = config;
        this.db = db;
        this.photos = photosClient;
        this.isRunning = false;

        // Start cache tick - runs every 30 seconds
        setInterval(() => this.cacheTick(), 30000);
    }

    async cacheTick() {
        if (this.isRunning) return; // Prevent overlap
        this.isRunning = true;

        try {
            // 1. Check cache size
            const cacheSize = await this.getCacheSizeBytes();

            // 2. Evict if over limit (500MB)
            if (cacheSize > 500 * 1024 * 1024) {
                await this.evictOldest(20);
            }

            // 3. Download next batch (fixed: 5 photos)
            const photosToDownload = await this.db.query(`
                SELECT id FROM photos
                WHERE cached_path IS NULL
                ORDER BY last_viewed_at ASC NULLS FIRST
                LIMIT 5
            `);

            await this.batchDownload(photosToDownload);

        } finally {
            this.isRunning = false;
        }
    }

    async batchDownload(photos) {
        // Download in parallel with basic retry
        await Promise.allSettled(
            photos.map(photo => this.downloadPhoto(photo.id))
        );
    }
}
```

**Key Simplifications**:
- Fixed batch size: 5 photos
- No adaptive sizing based on performance
- No elaborate metrics tracking
- Simple overlap prevention with flag

---

## Display Logic (Non-Blocking)

```javascript
class PhotoDisplay {
    constructor(config, db) {
        this.config = config;
        this.db = db;

        // Display timer - runs every 60s
        setInterval(() => this.displayNext(), 60000);
    }

    async displayNext() {
        try {
            // Query next photo (fast: <5ms)
            const photo = await this.db.query(`
                SELECT id, cached_path, filename
                FROM photos
                WHERE cached_path IS NOT NULL
                ORDER BY last_viewed_at ASC NULLS FIRST, RANDOM()
                LIMIT 1
            `);

            if (!photo) {
                console.warn('No cached photos available');
                return;
            }

            // Load and send (async, non-blocking)
            const imageBuffer = await fs.promises.readFile(photo.cached_path);
            this.sendToFrontend('DISPLAY_PHOTO', {
                id: photo.id,
                image: imageBuffer.toString('base64')
            });

            // Update view tracking (fire-and-forget)
            this.db.updateViewed(photo.id).catch(err =>
                console.error('View tracking failed:', err)
            );

        } catch (error) {
            console.error('Display error:', error);
        }
    }
}
```

---

## Error Handling (Basic)

### Corruption Detection on Startup
```javascript
async function initDatabase(dbPath) {
    try {
        const db = await sqlite.open({ filename: dbPath });

        // Quick integrity check (30s timeout)
        const check = await Promise.race([
            db.get('PRAGMA integrity_check'),
            timeout(30000)
        ]);

        if (check.integrity_check !== 'ok') {
            throw new Error('Database corrupted');
        }

        return db;

    } catch (error) {
        console.warn('Database corrupt, rebuilding...');

        // Delete and recreate
        await fs.promises.unlink(dbPath);
        const db = await sqlite.open({ filename: dbPath });
        await createSchema(db);

        // Trigger full rescan
        return db;
    }
}
```

### Network Retry (Simple)
```javascript
async function downloadWithRetry(photoId, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await photosAPI.download(photoId);
        } catch (error) {
            if (attempt === retries) {
                console.error(`Failed to download ${photoId} after 3 attempts`);
                throw error;
            }
            await sleep(attempt * 1000); // 1s, 2s, 3s backoff
        }
    }
}
```

**What We Cut**:
- Complex ConnectionState management
- Offline mode preservation
- Exponential backoff beyond 3 retries
- Elaborate error categorization

---

## Configuration (Simplified)

```javascript
{
    module: "MMM-GooglePhotos",
    config: {
        // Album configuration
        albums: ["album_id_1", "album_id_2"],  // Simple array

        // Display settings
        updateInterval: 60000,  // 60 seconds

        // Cache settings
        maxCacheSizeMB: 500,
        cacheTickInterval: 30000,  // 30 seconds
        batchDownloadSize: 5,       // Fixed batch

        // Scanning
        scanInterval: 21600000,  // 6 hours

        // Display resolution
        showWidth: 1080,
        showHeight: 1920
    }
}
```

**Removed Options**:
- Multiple folders with depth control
- Adaptive batching configuration
- Offline mode settings
- Format conversion options
- Complex filtering conditions

---

## Success Metrics

### Performance Targets
| Metric | Target | Measurement |
|--------|--------|-------------|
| **Stability** | Zero crashes | 7 days continuous operation |
| **Scan Speed** | <3s | Incremental scan time |
| **Display Speed** | <100ms | Photo transition latency |
| **Memory Usage** | <200MB | Stable over 24 hours |
| **No Duplicates** | 100% | Within 24hr display cycle |

### API Quota Compliance
| Operation | Frequency | Daily Total |
|-----------|-----------|-------------|
| Incremental scan | Every 6 hours | 4 scans |
| Batch downloads | Every 30s (when needed) | ~240 calls |
| **Total** | | **~244 queries/day** |

**Well under** Google Photos API free tier limits.

---

## Implementation Plan

### Phase 1: Core Database (Week 1)
- [ ] Create PhotoDatabase.js with basic schema
- [ ] Implement corruption detection on startup
- [ ] Add display query (<5ms requirement)
- [ ] Test with 1,000 photos

### Phase 2: Cache Manager (Week 2)
- [ ] Implement CacheManager with fixed batch (5 photos)
- [ ] Add size-based eviction (500MB limit)
- [ ] Test download performance on Pi 4
- [ ] Verify non-blocking behavior

### Phase 3: Integration & Testing (Week 3)
- [ ] Integrate with existing MMM-GooglePhotos.js frontend
- [ ] Add incremental scan (Changes API)
- [ ] Run 7-day stability test
- [ ] Measure all success metrics

---

## File Structure

```
MMM-GooglePhotos/
├── MMM-GooglePhotos.js           (Frontend - minimal changes)
├── node_helper.js                (Backend - refactored to ~350 lines)
├── components/
│   ├── PhotoDatabase.js          (NEW - ~200 lines)
│   ├── CacheManager.js           (NEW - ~150 lines)
│   └── PhotosAPI.js              (Refactor existing - ~100 lines)
├── google_photos_auth.json       (OAuth credentials)
├── generate_token.js             (OAuth token generator)
├── cache/
│   ├── photos.db                 (SQLite database)
│   └── images/                   (Cached images)
└── package.json                  (dependencies)
```

**Total Lines of Code**: ~800 lines (down from 2,080)

---

## Dependencies

```json
{
    "dependencies": {
        "googleapis": "^140.0.0",
        "sqlite3": "^5.1.7",
        "sqlite": "^5.1.1",
        "google-auth-library": "^9.15.1",
        "axios": "^1.8.2"
    }
}
```

**Removed Dependencies**:
- `sharp` (no format conversion in v1)
- `mkdirp` (use fs.promises.mkdir with recursive:true)
- `re2-wasm` (simplified pattern matching)

---

## What's Different from Original Design

### Architecture Changes
| Original | V1 Consensus |
|----------|--------------|
| Google Drive API | Google Photos API (existing) |
| WAL mode SQLite | Standard mode SQLite |
| Adaptive batch sizing | Fixed batch (5 photos) |
| Multiple components (ConnectionState, etc) | Simplified 3 components |
| 2,080 lines | ~800 lines |

### Requirements Changes
| Original | V1 Consensus |
|----------|--------------|
| 8 user stories | 4 core stories |
| Offline mode (12+ hours) | Basic retry (no offline mode) |
| Format conversion (PNG→JPG) | Keep original formats |
| Photo filtering (date/size/ratio) | Basic mime-type validation |
| Multiple folders with depth | Simple album array |
| Elaborate error recovery | Basic corruption detection |

### What We're Deferring to V2
- Google Drive integration
- Offline mode with state preservation
- Format optimization (conversion to JPG)
- Advanced photo filtering
- WAL mode and complex recovery
- Adaptive performance tuning

---

## Testing Strategy

### Unit Tests
- Database: Schema creation, queries, corruption detection
- Cache Manager: Batch downloads, eviction, overlap prevention
- Display: Query performance, view tracking

### Integration Tests
- Display + Database: Non-blocking concurrent access
- Cache + API: Download reliability with retries
- End-to-end: 1,000 photos → display cycle completion

### System Tests
- **7-day stability test**: No crashes, no memory leaks
- **Performance validation**: All metrics meet targets
- **Raspberry Pi 3B+ & 4**: Test on actual hardware

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Database corruption | Detect on startup, auto-rebuild (5 min) |
| Network failures | 3-attempt retry with exponential backoff |
| API quota exceeded | Conservative batch sizing (244 calls/day) |
| Cache starvation | Fixed 30s tick ensures steady prefetch |
| Memory exhaustion | 500MB cache limit, size-based eviction |

---

## Success Criteria for V1 Release

✅ All 4 user stories implemented
✅ All 5 success metrics achieved
✅ 7-day stability test passed
✅ Works on Raspberry Pi 3B+ and 4
✅ Clear documentation for setup
✅ <10 minute initial setup time

**When these are met**: V1 is shippable.

---

## Consensus Notes

This document represents the consensus from two debates:

1. **Tech Lead vs Challenger**: Identified architectural over-engineering, simplified to core components
2. **Simplifier vs Challenger**: Balanced minimalism with necessary complexity, defined MVP scope

**Key Compromises**:
- Keep SQLite (Challenger won: necessary for 1,000+ photos)
- Remove offline mode (Simplifier won: edge case)
- Add corruption detection (Challenger won: 20 lines prevents support nightmares)
- Fixed batch sizing (Simplifier won: adaptive is overkill)
- Keep multiple albums (Challenger won: real user need)

**Philosophy**: Ship something testable in 3 weeks, measure actual performance, iterate based on real usage data.

---

**Document Version**: 1.0
**Last Updated**: 2026-01-31
**Status**: Ready for Implementation
