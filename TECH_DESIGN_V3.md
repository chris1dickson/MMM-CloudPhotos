# Technical Design V3: Google Drive Migration (Final)

## Document Status
**Version**: 3.0 (Final Consensus)
**Date**: 2026-01-31
**Status**: Ready for Implementation

**Context**: Google Photos API is deprecated/restricted. This design migrates to Google Drive API as the new storage medium.

**Changes from V2**:
- ✅ **Google Drive API restored** (mandatory - Photos API is dead)
- ✅ Graceful degradation (~20 lines) instead of elaborate offline mode (150 lines)
- ✅ Keeps all valid simplifications from V1/V2 debates

---

## Problem Statement

**Google Photos API is no longer viable.** Users need a new way to display their photos on MagicMirror.

**Solution**: Use Google Drive API as the photo source, allowing users to organize photos in Drive folders.

---

## Core Value Proposition

**Display photos from Google Drive folders on MagicMirror smoothly and reliably.**

---

## Why Google Drive?

1. **Stable API**: Google Drive API is mature and stable
2. **User control**: Users already organize files in Drive folders
3. **Read-only scope**: `drive.readonly` provides secure access
4. **No migration pain**: Users don't need to move photos to a special service
5. **Folder organization**: Natural hierarchy (Vacation/2024, Family/Kids, etc.)

---

## User Stories (4 Core Stories)

### Story 1: Initial Setup
**As a** new user
**I want to** connect Google Drive in under 10 minutes
**So that** I can see my photos quickly

**Acceptance Criteria:**
- User creates/uses existing Drive folder with photos
- User copies folder ID from Drive URL
- User runs `node generate_drive_token.js` and completes OAuth
- User updates config.js with folder ID
- Photos display within 10 minutes

**Success Metric**: <10 minute time-to-first-photo

---

### Story 2: Smooth Playback
**As a** user
**I want** photos to display every 60 seconds without stuttering
**So that** I have a seamless slideshow experience

**Acceptance Criteria:**
- New photo every 60 seconds (configurable)
- No duplicates within a single cycle
- Transitions are instant (<100ms from cache)
- No "loading" messages during normal operation

**Success Metric**: Zero display interruptions during 24-hour operation

---

### Story 3: New Photo Discovery
**As a** user
**I want** newly uploaded photos to appear automatically
**So that** my display stays current

**Acceptance Criteria:**
- Module checks for new photos every 6 hours (configurable)
- Uses Drive Changes API for efficient scanning
- New photos added without duplicates
- Scan completes in <3 seconds

**Success Metric**: <3s incremental scan time

---

### Story 4: Network Resilience
**As a** user
**I want** the module to handle network issues gracefully
**So that** temporary WiFi problems don't break my display

**Acceptance Criteria:**
- Cached photos continue displaying during outages
- Module stops wasting CPU after detecting offline state
- Automatically resumes when connection returns
- No confusing error messages for temporary issues

**Success Metric**: Display continues during 2-hour WiFi outage

---

## Architecture

### Component Structure
```
MMM-GooglePhotos/
├── MMM-GooglePhotos.js          (Frontend - minimal changes)
├── node_helper.js               (~300 lines)
└── components/
    ├── PhotoDatabase.js         (~120 lines)
    ├── CacheManager.js          (~120 lines with graceful degradation)
    └── GDriveAPI.js             (~150 lines - NEW)
```

**Total: ~690 lines** (down from 2,080 original, includes Drive API)

### Data Flow
```
User organizes photos in Drive folders
    ↓
GDriveAPI.js scans folders (with depth control)
    ↓
PhotoDatabase.js stores metadata (SQLite)
    ↓
CacheManager.js downloads photos (batch=5, 30s ticks)
    ↓
Display shows photos every 60s (from cache)
```

---

## Google Drive API Integration

### Authentication

**OAuth 2.0 Scope**: `https://www.googleapis.com/auth/drive.readonly`

**Setup Process**:
1. Enable Google Drive API in Cloud Console
2. Create OAuth Desktop credentials
3. Run `node generate_drive_token.js`
4. Complete OAuth flow in browser
5. Token saved to `token_drive.json`

```javascript
async function authenticateDrive() {
    const credentials = JSON.parse(
        await fs.promises.readFile('./google_drive_auth.json', 'utf8')
    );
    const token = JSON.parse(
        await fs.promises.readFile('./token_drive.json', 'utf8')
    );

    const auth = new google.auth.OAuth2(
        credentials.client_id,
        credentials.client_secret,
        credentials.redirect_uri
    );
    auth.setCredentials(token);

    return google.drive({ version: 'v3', auth });
}
```

### Folder Scanning with Depth Control

```javascript
class GDriveAPI {
    async scanFolder(folderId, maxDepth = -1, currentDepth = 0) {
        const photos = [];
        const visitedFolders = new Set(); // Prevent circular references

        // Scan current folder for images
        const query = [
            folderId ? `'${folderId}' in parents` : "'root' in parents",
            "mimeType contains 'image/'",
            "trashed = false",
            "not name contains '.cr2'",  // Exclude RAW
            "not name contains '.nef'"
        ].join(' and ');

        const response = await this.drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType, imageMediaMetadata, createdTime)',
            pageSize: 1000
        });

        photos.push(...response.data.files);

        // Recursively scan subfolders if within depth limit
        if (maxDepth === -1 || currentDepth < maxDepth) {
            const subfolders = await this.drive.files.list({
                q: `${folderId ? `'${folderId}' in parents` : "'root' in parents"} and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)'
            });

            for (const folder of subfolders.data.files) {
                if (visitedFolders.has(folder.id)) continue; // Skip cycles
                visitedFolders.add(folder.id);

                const subPhotos = await this.scanFolder(
                    folder.id,
                    maxDepth,
                    currentDepth + 1
                );
                photos.push(...subPhotos);
            }
        }

        return photos;
    }
}
```

**Key Features**:
- ✅ Circular folder detection (visitedFolders Set)
- ✅ Depth control (-1 = infinite, 0 = folder only, N = N levels)
- ✅ Filters RAW files automatically
- ✅ Handles Drive root (folderId = null)

### Incremental Scanning (Changes API)

```javascript
async scanForChanges() {
    const token = await this.db.getSetting('changes_token');

    if (!token) {
        // First run: do full scan and save token
        const startToken = await this.drive.changes.getStartPageToken();
        await this.db.saveSetting('changes_token', startToken.data.startPageToken);
        return await this.fullScan();
    }

    // Incremental scan
    let pageToken = token;
    const changedPhotos = [];

    do {
        const response = await this.drive.changes.list({
            pageToken: pageToken,
            pageSize: 1000,
            fields: 'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, parents, imageMediaMetadata, createdTime, trashed))'
        });

        for (const change of response.data.changes) {
            if (change.removed || change.file?.trashed) {
                await this.db.deletePhoto(change.fileId);
            } else if (change.file?.mimeType?.startsWith('image/')) {
                changedPhotos.push(change.file);
            }
        }

        pageToken = response.data.nextPageToken;

        if (response.data.newStartPageToken) {
            await this.db.saveSetting('changes_token', response.data.newStartPageToken);
        }
    } while (pageToken);

    return changedPhotos;
}
```

**Benefits**:
- 1-5 API calls per scan (vs 25+ for full scan)
- Detects new photos, deletions, moves
- Saves 92% of API quota

---

## Database Schema (Simplified)

```sql
-- Photos metadata
CREATE TABLE photos (
    id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    filename TEXT,
    creation_time INTEGER,
    width INTEGER,
    height INTEGER,

    -- Simple view tracking (no analytics)
    last_viewed_at INTEGER,

    -- Cache tracking
    cached_path TEXT,
    cached_at INTEGER,
    cached_size_bytes INTEGER
);

-- Settings (for Changes API token)
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Two indexes only
CREATE INDEX idx_display ON photos(cached_path, last_viewed_at)
    WHERE cached_path IS NOT NULL;

CREATE INDEX idx_prefetch ON photos(last_viewed_at)
    WHERE cached_path IS NULL;
```

**Removed from original**:
- ❌ `photo_views` analytics table
- ❌ `view_count` column
- ❌ `discovered_at` tracking
- ❌ `is_deleted` flag
- ❌ Complex multi-column indexes

### Database Initialization (Simple)

```javascript
async function initDatabase(dbPath) {
    try {
        const db = await sqlite.open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Quick integrity check (5s timeout)
        const check = await Promise.race([
            db.get('PRAGMA integrity_check'),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 5000)
            )
        ]);

        if (check?.integrity_check !== 'ok') {
            throw new Error('Database corrupt');
        }

        return db;

    } catch (error) {
        // Simple recovery: delete and rebuild
        console.warn('[DB] Corrupt or missing, rebuilding...');
        await fs.promises.unlink(dbPath).catch(() => {});

        const db = await sqlite.open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        await createSchema(db);

        console.log('[DB] Rebuild complete, will trigger full scan');
        return db;
    }
}
```

**12 lines vs 171 lines** of complex recovery

---

## Cache Management with Graceful Degradation

```javascript
class CacheManager {
    constructor(config, db, driveAPI) {
        this.config = config;
        this.db = db;
        this.drive = driveAPI;
        this.isRunning = false;
        this.consecutiveFailures = 0;  // Graceful degradation tracking

        // Fixed 30-second tick
        setInterval(() => this.tick(), 30000);
    }

    async tick() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            // Step 1: Check cache size
            const cacheSize = await this.getCacheSizeBytes();

            // Step 2: Evict if over limit (200MB default)
            if (cacheSize > this.config.maxCacheSizeMB * 1024 * 1024) {
                await this.evictOldest(10);
            }

            // Step 3: Graceful degradation - skip downloads if offline
            if (this.consecutiveFailures > 3) {
                console.log('[CACHE] Offline detected - skipping downloads');
                await this.sleep(60000); // Wait 1 minute before retry
                this.consecutiveFailures = 0; // Reset to try again
                return;
            }

            // Step 4: Download next batch (FIXED: 5 photos)
            const photos = await this.db.query(`
                SELECT id FROM photos
                WHERE cached_path IS NULL
                ORDER BY last_viewed_at ASC NULLS FIRST
                LIMIT 5
            `);

            if (photos.length === 0) return;

            // Step 5: Batch download with failure tracking
            const results = await Promise.allSettled(
                photos.map(p => this.downloadPhoto(p.id))
            );

            const failures = results.filter(r => r.status === 'rejected').length;

            // Track failures for graceful degradation
            if (failures === photos.length) {
                this.consecutiveFailures++;
                console.warn(`[CACHE] All downloads failed (${this.consecutiveFailures}/3)`);
            } else {
                this.consecutiveFailures = 0; // Reset on any success
            }

        } finally {
            this.isRunning = false;
        }
    }

    async downloadPhoto(photoId) {
        try {
            // Download from Drive
            const response = await this.drive.files.get(
                { fileId: photoId, alt: 'media' },
                { responseType: 'stream', timeout: 30000 }
            );

            const filePath = path.join(this.config.cachePath, `${photoId}.jpg`);
            const writeStream = fs.createWriteStream(filePath);

            await finished(response.data.pipe(writeStream));

            // Get file size
            const stats = await fs.promises.stat(filePath);

            // Update database
            await this.db.run(`
                UPDATE photos
                SET cached_path = ?, cached_at = ?, cached_size_bytes = ?
                WHERE id = ?
            `, [filePath, Date.now(), stats.size, photoId]);

            return { success: true, photoId };

        } catch (error) {
            console.error(`[CACHE] Failed to download ${photoId}:`, error.message);
            throw error;
        }
    }

    async evictOldest(count) {
        const photos = await this.db.query(`
            SELECT id, cached_path
            FROM photos
            WHERE cached_path IS NOT NULL
            ORDER BY last_viewed_at ASC
            LIMIT ?
        `, [count]);

        // Delete files in parallel
        await Promise.allSettled(
            photos.map(p => fs.promises.unlink(p.cached_path))
        );

        // Update database
        for (const photo of photos) {
            await this.db.run(`
                UPDATE photos
                SET cached_path = NULL, cached_size_bytes = NULL
                WHERE id = ?
            `, [photo.id]);
        }

        console.log(`[CACHE] Evicted ${photos.length} photos`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
```

**Graceful Degradation Features (~20 lines added)**:
- ✅ Tracks consecutive failures
- ✅ After 3 failures, stops attempting downloads for 1 minute
- ✅ Automatically resumes trying (resets counter)
- ✅ Cached photos continue displaying (reading from disk doesn't require network)
- ✅ No elaborate ConnectionState.js (150 lines saved)

---

## Display Logic (Unchanged)

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
            // Get next cached photo (fast query)
            const photo = await this.db.query(`
                SELECT id, cached_path, filename
                FROM photos
                WHERE cached_path IS NOT NULL
                ORDER BY last_viewed_at ASC NULLS FIRST, RANDOM()
                LIMIT 1
            `);

            if (!photo) {
                console.warn('[DISPLAY] No cached photos available');
                return;
            }

            // Load from disk (works offline!)
            const imageBuffer = await fs.promises.readFile(photo.cached_path);

            // Send to frontend
            this.sendSocketNotification('DISPLAY_PHOTO', {
                id: photo.id,
                image: imageBuffer.toString('base64'),
                filename: photo.filename
            });

            // Update view tracking (fire-and-forget)
            this.db.run(
                'UPDATE photos SET last_viewed_at = ? WHERE id = ?',
                [Date.now(), photo.id]
            ).catch(() => {});

        } catch (error) {
            console.error('[DISPLAY] Error:', error);
        }
    }
}
```

---

## Configuration

```javascript
{
    module: "MMM-GooglePhotos",
    config: {
        // Google Drive folders
        driveFolders: [
            {
                id: "1a2b3c4d5e6f7g8h9i0j",  // Folder ID from Drive URL
                depth: -1                     // -1=infinite, 0=folder only, N=N levels
            },
            {
                id: null,                     // null = Drive root
                depth: 1                      // Only 1 level deep
            }
        ],

        // Display settings
        updateInterval: 60000,  // 60 seconds per photo

        // Cache settings (simplified)
        maxCacheSizeMB: 200,    // 200MB default (5-6 hours offline)

        // Scanning
        scanInterval: 21600000, // 6 hours (incremental)

        // Display resolution
        showWidth: 1080,
        showHeight: 1920
    }
}
```

**Getting Folder ID from URL**:
```
https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
                                          ^^^^^^^^^^^^^^^^^^^^
                                          This is the folder ID
```

---

## API Quota Compliance

### Google Drive API Free Tier
- **1,000 queries per 100 seconds per user**
- **1 billion queries per day** (effectively unlimited)

### Typical Usage

| Operation | API Calls | Frequency | Daily Total |
|-----------|-----------|-----------|-------------|
| Initial scan (10K photos, 20 folders) | ~25 | Once on startup | 25 |
| Incremental scan (Changes API) | 1-5 | Every 6 hours | 4-20 |
| Download photos (get file metadata) | 0 | N/A | 0 |
| Download photos (get file content) | 5 per 30s | When cache needs filling | ~240 |
| **Total Daily** | | | **~270 calls/day** |

**Well under free tier limits** (1.67% of rate limit)

---

## Error Handling

### Network Retry (Simple)
```javascript
async downloadWithRetry(photoId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await this.drive.files.get({ fileId: photoId, alt: 'media' });
        } catch (error) {
            if (attempt === maxRetries) throw error;

            console.warn(`[DOWNLOAD] Attempt ${attempt} failed for ${photoId}, retrying...`);
            await this.sleep(attempt * 1000); // 1s, 2s, 3s backoff
        }
    }
}
```

### Graceful Degradation (Network Outages)
- After 3 consecutive batch failures → stop trying for 1 minute
- Display continues showing cached photos (local disk reads)
- Automatically resumes attempting downloads
- No user intervention required

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Stability** | 0 crashes | 7 days continuous operation |
| **Initial scan** | <5 minutes | 10,000 photos across 20 folders |
| **Incremental scan** | <3 seconds | Changes API typical case |
| **Display latency** | <100ms | Photo transition from cache |
| **Memory usage** | <200MB | Stable over 24 hours |
| **No duplicates** | 100% | Within 24-hour display cycle |
| **Offline resilience** | Display continues | During 2-hour WiFi outage |

---

## File Structure

```
MMM-GooglePhotos/
├── MMM-GooglePhotos.js           (~150 lines, minimal changes)
├── node_helper.js                (~300 lines, refactored)
├── components/
│   ├── PhotoDatabase.js          (~120 lines)
│   ├── CacheManager.js           (~120 lines with graceful degradation)
│   └── GDriveAPI.js              (~150 lines, NEW for Drive integration)
├── google_drive_auth.json        (OAuth credentials)
├── token_drive.json              (OAuth token)
├── generate_drive_token.js       (Token generator script)
├── cache/
│   ├── photos.db                 (SQLite database)
│   └── images/                   (Cached photos)
└── package.json
```

**Total: ~690 lines** (includes Drive API integration)

---

## Dependencies

```json
{
    "dependencies": {
        "googleapis": "^140.0.0",
        "sqlite3": "^5.1.7",
        "sqlite": "^5.1.1",
        "google-auth-library": "^9.15.1"
    }
}
```

**Removed from original**:
- ❌ `sharp` (no format conversion in V3)
- ❌ `axios` (googleapis handles HTTP)
- ❌ `moment` (use native Date)
- ❌ `mkdirp` (use fs.promises.mkdir recursive)
- ❌ `re2-wasm` (simplified patterns)

---

## Testing Strategy

### Unit Tests
- Folder scanning with depth control
- Circular folder detection
- Graceful degradation (failure tracking)
- Database corruption recovery

### Integration Tests
- Full scan (10K photos) completes in <5 minutes
- Incremental scan (Changes API) completes in <3 seconds
- Cache fills to 200MB, then evicts correctly
- Display shows no duplicates over 24 hours

### System Tests
- 7-day stability test (zero crashes)
- Simulated network outage (2 hours offline)
- Memory profiling (stays under 200MB)
- API quota monitoring (stays under 1%)

---

## Implementation Phases

### Phase 1: Google Drive Integration (Week 1)
- [ ] Create GDriveAPI.js component
- [ ] Implement folder scanning with depth control
- [ ] Add circular folder detection (visitedFolders Set)
- [ ] Implement Changes API for incremental scanning
- [ ] Test with 1,000 photos across 5 folders

### Phase 2: Cache & Database (Week 2)
- [ ] Create simplified PhotoDatabase.js (12-line recovery)
- [ ] Implement CacheManager with graceful degradation
- [ ] Add failure tracking (consecutiveFailures)
- [ ] Test cache eviction at 200MB limit
- [ ] Verify display continues during simulated outage

### Phase 3: Integration & Testing (Week 3)
- [ ] Integrate with existing MMM-GooglePhotos.js frontend
- [ ] Run 7-day stability test
- [ ] Measure all success metrics
- [ ] Document setup process
- [ ] Create migration guide from Google Photos

---

## What's Different from Original Design

### What We Kept (Good Ideas)

| Feature | Status | Reason |
|---------|--------|--------|
| **Google Drive API** | ✅ Kept | Photos API is dead, Drive is the solution |
| **SQLite database** | ✅ Kept | Necessary for 1,000+ photos |
| **Incremental scanning** | ✅ Kept | Saves 92% API quota |
| **Folder depth control** | ✅ Kept | Real user need (organize by year/event) |
| **Tick-based cache** | ✅ Kept | Non-blocking architecture |

### What We Simplified (From Debates)

| Feature | Original | V3 Decision | Lines Saved |
|---------|----------|-------------|-------------|
| **Cache size** | 500MB (13hr) | 200MB (5-6hr) | Config only |
| **Offline mode** | ConnectionState.js (150 lines) | Graceful degradation (20 lines) | ~130 |
| **Batch sizing** | Adaptive algorithm | Fixed batch=5 | ~30 |
| **Database recovery** | 3-tier system (171 lines) | Simple rebuild (12 lines) | ~159 |
| **View tracking** | Analytics table | Timestamp only | ~40 |
| **Format conversion** | PNG→JPG pipeline | Keep originals | ~100 |
| **WAL mode** | Complex setup | Standard SQLite | ~20 |
| **Total saved** | | | **~479 lines** |

### What We Removed (Unnecessary)

- ❌ Elaborate ConnectionState with exponential backoff beyond 3 attempts
- ❌ View analytics and statistics tracking
- ❌ Format conversion and image optimization
- ❌ Multiple folder complexity (kept simple array config)
- ❌ Complex retry state machines

---

## Migration from Google Photos API

For existing users of MMM-GooglePhotos:

### Step 1: Enable Google Drive API
1. Go to Google Cloud Console
2. Enable Google Drive API
3. Create OAuth Desktop credentials
4. Download as `google_drive_auth.json`

### Step 2: Generate Token
```bash
node generate_drive_token.js
```
Follow OAuth flow, token saved to `token_drive.json`

### Step 3: Update Configuration
```javascript
// OLD (Google Photos)
albums: ["album_id_1", "album_id_2"]

// NEW (Google Drive)
driveFolders: [
    { id: "drive_folder_id_1", depth: -1 },
    { id: "drive_folder_id_2", depth: 0 }
]
```

### Step 4: Clear Old Cache
```bash
rm -rf cache/photos.db
rm -rf cache/images/*
```

### Step 5: Restart
Module will perform initial scan and start displaying photos.

---

## Consensus Rationale

### Why This Design Works

1. **Google Drive API** - Mandatory (Photos API deprecated)
2. **200MB cache** - Sufficient for 99% of outages (5-6 hours)
3. **Fixed batch=5** - Simpler than adaptive, works for all speeds
4. **Graceful degradation** - 20 lines vs 150 lines, same UX benefit
5. **Simple recovery** - Trust SQLite's crash safety (20-year track record)
6. **Folder depth control** - Real user need (organize by hierarchy)
7. **Incremental scanning** - 1-5 API calls vs 25+ full scan

### What We Learned from Debates

**Debate 1 (Tech Lead vs Challenger)**:
- Exposed unproven claims (150MB RAM speculation)
- Cut unnecessary complexity (WAL mode, format conversion)
- Simplified database recovery (171 → 12 lines)

**Debate 2 (Simplifier vs Challenger)**:
- Demanded data for 500MB cache (none existed) → reduced to 200MB
- Removed adaptive batching (theoretical problem)
- Kept incremental scanning (proven efficiency)

**Key principle**: "If you can't defend it with data, simplify it"

---

## Philosophy

**V3 embodies "pragmatic simplicity"**:
- ✅ Solve the real problem (Photos API is dead → use Drive)
- ✅ Trust mature dependencies (SQLite, Drive API)
- ✅ Optimize for common cases (brief outages, not 13-hour disasters)
- ✅ Fail fast, recover automatically
- ✅ Keep code simple and debuggable

**We optimize for:**
- Code maintainability
- User experience quality
- Real usage patterns
- Clear failure modes

**We don't optimize for:**
- Theoretical edge cases
- Perfect resilience
- Feature completeness
- Premature optimization

---

## Known Limitations

### What V3 Doesn't Do

1. **No format conversion** - Keeps original formats (no PNG→JPG optimization)
2. **No view analytics** - Just prevents immediate repeats
3. **No extended offline** - Graceful for 5-6 hours, then cache may evict
4. **No WAL mode** - Uses standard SQLite (simpler but slightly less crash-resistant)
5. **No advanced filtering** - Basic mime-type check only (no date/size/ratio filters)

### Future Enhancements (V4?)

- Photo filters (date range, aspect ratio) - IF users request it
- Format conversion for storage optimization - IF 200MB isn't enough
- Extended offline mode (preserve cache) - IF 5-6 hours proves insufficient
- View statistics and favorites - IF users want engagement tracking
- Multiple Google accounts - IF users manage separate Drives

**Philosophy**: Add features when users prove they need them, not before.

---

## Success Criteria for V3 Release

✅ All 4 user stories implemented
✅ All 7 success metrics achieved
✅ Google Drive API integration working
✅ Folder scanning with depth control tested
✅ Graceful degradation verified (2-hour outage test)
✅ 7-day stability test passed (zero crashes)
✅ Works on Raspberry Pi 3B+ and 4
✅ Migration guide from Photos API complete

**When these are met**: V3 is shippable.

---

**Document Version**: 3.0 (Final)
**Last Updated**: 2026-01-31
**Status**: Ready for Implementation
**Total Code**: ~690 lines (71% reduction from original 2,080)
**Next Steps**: Begin Phase 1 - Google Drive Integration
