# Setup Guide for Your Google Drive Folder

**Your Folder ID**: `1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I`

**Folder URL**: https://drive.google.com/drive/folders/1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I

---

## Quick Test (5 Steps)

### Step 1: Install Dependencies

```bash
npm install
```

Wait ~1-2 minutes for installation to complete.

---

### Step 2: Set Up Google Drive API

#### A. Enable API

1. Go to https://console.cloud.google.com
2. Create/select a project
3. Click "Enable APIs and Services"
4. Search "Google Drive API" → Enable

#### B. Create Credentials

1. Go to "Credentials" tab
2. Click "+ Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: **Desktop app**
4. Name: `MMM-GooglePhotos`
5. Click "Create"
6. Download JSON file
7. Save as `google_drive_auth.json` in this folder

```bash
# If downloaded to Downloads folder:
cp ~/Downloads/client_secret_*.json google_drive_auth.json
```

---

### Step 3: Generate OAuth Token

```bash
node generate_drive_token.js
```

Follow the prompts:
1. Copy the URL shown
2. Open in browser
3. Sign in and authorize
4. Copy the code
5. Paste in terminal

You should see: `✅ Success! Token saved to token_drive.json`

---

### Step 4: Run Quick Test

```bash
node quick-test.js
```

This will:
- ✅ Connect to your Drive folder
- ✅ Scan for photos
- ✅ Download 3 test photos
- ✅ Verify everything works

**Expected output:**
```
╔════════════════════════════════════════════════════════════╗
║     MMM-GooglePhotos V3 - Quick Test                      ║
║     Testing with Your Google Drive Folder                 ║
╚════════════════════════════════════════════════════════════╝

[0] Checking Prerequisites
✅ OAuth credentials found
✅ OAuth token found
ℹ️  Testing folder: 1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I

[1] Initializing Database
✅ Database initialized

[2] Authenticating with Google Drive API
✅ Successfully authenticated

[3] Scanning Your Google Drive Folder
✅ Found X photos in Y seconds

... (more output)

═══════════════════════════════════════════════════════════
🎉 ALL TESTS PASSED!
═══════════════════════════════════════════════════════════
```

---

### Step 5: Run Full Test Suite (Optional)

```bash
# Run all automated tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

---

## What Gets Tested

### Quick Test (`quick-test.js`)
1. ✅ Database initialization
2. ✅ Google Drive authentication
3. ✅ Folder scanning (YOUR photos!)
4. ✅ Save to database
5. ✅ Cache manager
6. ✅ Download photos
7. ✅ Cache statistics
8. ✅ Display logic
9. ✅ Changes API

### Automated Tests (`npm test`)
- **34+ unit tests** - Components in isolation
- **6 integration tests** - Full workflows
- **No Drive credentials needed** - All mocked

---

## Your Configuration

### For Testing

Already configured in `test-config.json`:
```json
{
  "driveFolders": [
    {
      "id": "1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I",
      "depth": -1
    }
  ]
}
```

### For MagicMirror

Add to `~/MagicMirror/config/config.js`:
```javascript
{
  module: "MMM-GooglePhotos",
  position: "fullscreen_below",
  config: {
    driveFolders: [
      {
        id: "1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I",
        depth: -1  // Scan all subfolders
      }
    ],
    updateInterval: 60000,  // 60 seconds per photo
    showWidth: 1080,
    showHeight: 1920
  }
}
```

---

## Files Created During Testing

```
cache/
├── test_photos.db       (SQLite database)
└── images/
    ├── <photo1>.jpg    (Downloaded photos)
    ├── <photo2>.jpg
    └── <photo3>.jpg
```

**To clean up:**
```bash
rm -rf cache/test_photos.db
rm -rf cache/images/*
```

---

## Troubleshooting

### "google_drive_auth.json not found"

Make sure you:
1. Created OAuth credentials in Google Cloud Console
2. Downloaded the JSON file
3. Saved it as `google_drive_auth.json` (exact name!)
4. Placed it in the module root folder

### "token_drive.json not found"

Run the token generator:
```bash
node generate_drive_token.js
```

### "No photos found"

Check:
1. Folder ID is correct (check URL)
2. Folder has photos (not empty)
3. Photos are not in trash
4. You have access to the folder

### "Authentication failed"

Try:
1. Regenerate token: `node generate_drive_token.js`
2. Check Google Drive API is enabled
3. Verify credentials file is valid JSON

---

## Next Steps After Testing

### 1. Review Downloaded Photos

```bash
ls -lh cache/images/
```

### 2. Check Database

```bash
sqlite3 cache/test_photos.db "SELECT * FROM photos;"
```

### 3. Deploy to MagicMirror

See `QUICK_START.md` for deployment instructions.

### 4. Run Automated Tests

```bash
npm test
```

---

## Quick Commands

```bash
# Test with your folder
node quick-test.js

# Run automated tests (no Drive API)
npm test

# Generate new token
node generate_drive_token.js

# Clean up test files
rm -rf cache/test_photos.db cache/images/*

# View database
sqlite3 cache/test_photos.db "SELECT COUNT(*) FROM photos;"
```

---

## Your Folder Details

**Folder ID**: `1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I`

**URL**: https://drive.google.com/drive/folders/1dkAgKSTNWoY-qXMg4xHEyqJFRqZniB2I

**Scan Depth**: -1 (all subfolders)

**Photo Limit**: 10 for testing (configurable)

---

## Support

If you encounter issues:

1. Check logs in console
2. Verify prerequisites (Node ≥18)
3. Review `TESTING.md` for details
4. Check `TROUBLESHOOTING` section in README_V3.md

---

## Success Indicators

✅ `quick-test.js` completes without errors
✅ Photos appear in `cache/images/`
✅ Database created at `cache/test_photos.db`
✅ Console shows green checkmarks
✅ No red error messages

**When you see "🎉 ALL TESTS PASSED!" you're ready to deploy!**

---

*Your folder is pre-configured in `test-config.json` and `quick-test.js`*
