# Testing MMM-GooglePhotos V3 Without MagicMirror

You can test all V3 components standalone without installing MagicMirror!

---

## Quick Test (5 minutes)

### Step 1: Install Dependencies

```bash
cd MMM-GooglePhotos
npm install
```

### Step 2: Set Up Google Drive API

Follow the same setup as normal:

1. **Enable Google Drive API** in Google Cloud Console
2. **Create OAuth credentials** (Desktop app)
3. **Save as** `google_drive_auth.json`
4. **Generate token**:
   ```bash
   node generate_drive_token.js
   ```

### Step 3: Edit Test Configuration

Open `test_v3_standalone.js` and edit line ~41:

```javascript
const CONFIG = {
  driveFolders: [
    {
      id: "YOUR_FOLDER_ID_HERE",  // 👈 CHANGE THIS
      depth: -1
    }
  ],
  // ... rest of config
};
```

Replace `YOUR_FOLDER_ID_HERE` with your actual Google Drive folder ID.

**How to get folder ID:**
```
https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
                                       ^^^^^^^^^^^^^^^^^^^^
                                       This is the folder ID
```

### Step 4: Run Tests

```bash
node test_v3_standalone.js
```

---

## What Gets Tested

The standalone test script validates **12 core functionalities**:

### ✅ Component Tests
1. **Database Initialization** - Creates SQLite database
2. **Google Drive Authentication** - Verifies OAuth connection
3. **Folder Scanning** - Scans your Drive folders for photos
4. **Save to Database** - Stores photo metadata
5. **Cache Manager** - Initializes caching system

### ✅ Functionality Tests
6. **Single Photo Download** - Downloads one photo from Drive
7. **Batch Download** - Downloads multiple photos
8. **Cache Statistics** - Reports cache usage
9. **Display Logic** - Gets next photo to show
10. **Incremental Scan** - Tests Changes API
11. **Cache Eviction** - Tests LRU eviction
12. **Settings Storage** - Tests database settings

---

## Expected Output

```
╔══════════════════════════════════════════════════════════╗
║  MMM-GooglePhotos V3 - Standalone Test Suite            ║
╚══════════════════════════════════════════════════════════╝

ℹ️  Checking prerequisites...
✅ Prerequisites OK

============================================================
TEST: Database Initialization
============================================================
ℹ️  [DB] Initializing database...
ℹ️  [DB] Database opened successfully
✅ PASS (125ms)

============================================================
TEST: Google Drive API Authentication
============================================================
ℹ️  [GDRIVE] Initializing Google Drive API...
ℹ️  [GDRIVE] Successfully authenticated with Google Drive API
✅ PASS (892ms)

============================================================
TEST: Folder Scanning
============================================================
ℹ️  Scanning folder: 1a2b3c4d5e6f7g8h9i0j (depth: -1)
ℹ️  [GDRIVE] Found 247 photos in current folder
ℹ️  Found 247 photos
ℹ️    [1] IMG_1234.jpg (abc123xyz)
ℹ️    [2] IMG_1235.jpg (def456uvw)
ℹ️    [3] IMG_1236.jpg (ghi789rst)
✅ PASS (3421ms)

... (more tests)

============================================================
TEST SUMMARY
============================================================
Total Tests: 12
✅ Passed: 12
❌ Failed: 0
⏱️  Total Time: 15.67s
============================================================
```

---

## Troubleshooting

### Error: "YOUR_FOLDER_ID_HERE"

You forgot to edit the config. Open `test_v3_standalone.js` and set your folder ID.

### Error: "google_drive_auth.json not found"

Run the setup steps first:
1. Create OAuth credentials in Google Cloud Console
2. Save as `google_drive_auth.json`

### Error: "token_drive.json not found"

Generate the token:
```bash
node generate_drive_token.js
```

### Error: "No photos found"

Make sure:
- Folder ID is correct
- Folder has photos (images)
- Photos are not in trash

### Error: "Authentication failed"

- Check `google_drive_auth.json` is valid JSON
- Regenerate token: `node generate_drive_token.js`
- Verify Google Drive API is enabled

---

## Test Files Created

The test creates these temporary files:

```
cache/
├── test_photos.db        (Test database - safe to delete)
└── images/
    ├── abc123xyz.jpg     (Downloaded test photos)
    ├── def456uvw.jpg
    └── ghi789rst.jpg
```

**To clean up:**
```bash
rm -rf cache/test_photos.db
rm -rf cache/images/*
```

---

## Advanced Testing

### Test Specific Components

You can modify the test script to focus on specific areas:

**Test only scanning:**
```javascript
// Comment out other tests, keep only:
await suite.test("Folder Scanning", async () => {
  // ...
});
```

**Test with different folder depths:**
```javascript
driveFolders: [
  { id: "YOUR_FOLDER_ID", depth: 0 },   // No subfolders
  { id: "YOUR_FOLDER_ID", depth: 1 },   // 1 level
  { id: "YOUR_FOLDER_ID", depth: -1 }   // All subfolders
]
```

**Test cache limits:**
```javascript
maxCacheSizeMB: 10,  // Small cache for testing eviction
photoLimit: 100      // Download more photos
```

---

## Performance Benchmarks

On a typical system with 1,000 photos:

| Test | Expected Time | What It Tests |
|------|---------------|---------------|
| Database Init | <100ms | SQLite setup |
| Authentication | <1s | OAuth connection |
| Folder Scan | 2-5s | Drive API queries |
| Save 10 Photos | <100ms | Database writes |
| Download 1 Photo | 1-3s | Network + disk |
| Download 3 Photos | 3-5s | Parallel downloads |
| Cache Stats | <50ms | Database queries |
| Incremental Scan | 1-2s | Changes API |

**Total test time: ~15-30 seconds** for full suite.

---

## Integration with CI/CD

The test script exits with:
- **Exit code 0** if all tests pass
- **Exit code 1** if any test fails

You can use it in automated testing:

```bash
#!/bin/bash
node test_v3_standalone.js
if [ $? -eq 0 ]; then
  echo "✅ All tests passed"
else
  echo "❌ Tests failed"
  exit 1
fi
```

---

## What This Proves

✅ **Drive API integration works**
✅ **Authentication is correct**
✅ **Database schema is valid**
✅ **Photo scanning works**
✅ **Caching works**
✅ **Changes API works**
✅ **All components integrate properly**

**Everything works without MagicMirror!** 🎉

The only thing missing is the visual display, which requires the MagicMirror frontend.

---

## Next Steps After Testing

Once tests pass:

1. **Install in MagicMirror**:
   ```bash
   cd ~/MagicMirror/modules
   git clone <your-repo> MMM-GooglePhotos
   ```

2. **Use the same credentials**:
   - Copy `google_drive_auth.json`
   - Copy `token_drive.json`

3. **Configure** `config.js` with same folder ID

4. **Restart** MagicMirror and enjoy!

---

## Debugging Tips

### Enable Verbose Logging

Edit test script and add more logging:

```javascript
suite.log(`Photo details: ${JSON.stringify(photo, null, 2)}`);
```

### Check Database Contents

After running tests:

```bash
sqlite3 cache/test_photos.db

# View all photos
SELECT * FROM photos;

# View cached photos only
SELECT * FROM photos WHERE cached_path IS NOT NULL;

# Check settings
SELECT * FROM settings;
```

### Monitor Network Calls

Use Wireshark or similar to see Drive API calls in action.

### Test with Verbose Output

Modify component constructors to always log:

```javascript
const driveAPI = new GDriveAPI(config, database, console.log);
```

---

**Happy Testing!** 🧪
