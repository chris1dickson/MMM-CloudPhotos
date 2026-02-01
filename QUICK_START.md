# Quick Start Guide - MMM-GooglePhotos V3

Get your photos displaying in **under 15 minutes**!

---

## Prerequisites

- ✅ MagicMirror installed
- ✅ Google account with photos
- ✅ Terminal/SSH access
- ✅ Internet connection

---

## 5-Step Setup

### Step 1: Install the Module (2 minutes)

```bash
# Navigate to modules folder
cd ~/MagicMirror/modules/MMM-GooglePhotos

# Install dependencies
npm install
```

Wait for installation to complete (~1-2 minutes).

---

### Step 2: Set Up Google Drive API (5 minutes)

#### A. Enable API

1. Go to https://console.cloud.google.com
2. Create new project (or select existing)
3. Click "Enable APIs and Services"
4. Search "Google Drive API" → Click "Enable"

#### B. Create Credentials

1. Go to "Credentials" tab
2. Click "+ Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: **Desktop app**
4. Name: `MMM-GooglePhotos`
5. Click "Create"
6. Download JSON file
7. Save as `google_drive_auth.json` in module folder

```bash
# If downloaded to ~/Downloads:
cp ~/Downloads/client_secret_*.json ~/MagicMirror/modules/MMM-GooglePhotos/google_drive_auth.json
```

---

### Step 3: Generate OAuth Token (3 minutes)

```bash
cd ~/MagicMirror/modules/MMM-GooglePhotos
node generate_drive_token.js
```

Follow the prompts:
1. **Copy the URL** shown in terminal
2. **Open it in browser**
3. **Sign in** to Google
4. **Click "Allow"**
5. **Copy the code** from browser
6. **Paste it** in terminal

You should see: `✅ Success! Token saved to token_drive.json`

---

### Step 4: Organize Photos in Drive (2 minutes)

1. Go to https://drive.google.com
2. Create a folder (e.g., "MagicMirror Photos")
3. Upload some photos to test
4. Copy the folder ID from URL:
   ```
   https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j
                                          ^^^^^^^^^^^^^^^^^^^^
                                          Copy this part
   ```

---

### Step 5: Configure MagicMirror (3 minutes)

Edit `~/MagicMirror/config/config.js`:

Add this to your `modules` array:

```javascript
{
  module: "MMM-GooglePhotos",
  position: "fullscreen_below",
  config: {
    driveFolders: [
      {
        id: "PASTE_YOUR_FOLDER_ID_HERE",
        depth: -1
      }
    ]
  }
}
```

**Replace** `PASTE_YOUR_FOLDER_ID_HERE` with the folder ID you copied.

Save the file.

---

### Step 6: Restart and Enjoy!

```bash
pm2 restart MagicMirror
```

Or restart however you normally run MagicMirror.

---

## Check If It's Working

View logs:
```bash
pm2 logs MagicMirror --lines 50
```

You should see:
```
[GPHOTOS-V3] Initializing MMM-GooglePhotos V3 (Google Drive)...
[GPHOTOS-V3] ✅ Initialization complete!
[GPHOTOS-V3] Found 123 photos
```

Photos should start displaying after ~1 minute.

---

## Troubleshooting

### "Authentication failed"
- Check `google_drive_auth.json` exists
- Run `node generate_drive_token.js` again

### "No photos found"
- Verify folder ID is correct
- Make sure photos are in the Drive folder
- Check folder is not in trash

### "Module not starting"
- Run `npm install` again
- Check Node version: `node --version` (need ≥18)
- Check logs: `pm2 logs MagicMirror`

---

## Next Steps

### Add More Folders

```javascript
driveFolders: [
  { id: "FOLDER_1_ID", depth: -1 },
  { id: "FOLDER_2_ID", depth: -1 },
  { id: "FOLDER_3_ID", depth: 0 }   // depth: 0 = no subfolders
]
```

### Customize Display

```javascript
config: {
  driveFolders: [/* ... */],
  updateInterval: 60000,      // 60 seconds per photo
  showWidth: 1920,            // Your screen width
  showHeight: 1080,           // Your screen height
  maxCacheSizeMB: 200         // Cache size (default: 200MB)
}
```

### Depth Control

| Value | Behavior |
|-------|----------|
| `-1` | Scan all subfolders (recommended) |
| `0` | Only this folder, no subfolders |
| `1` | Folder + 1 level of subfolders |
| `N` | Folder + N levels |

---

## Full Documentation

- **Complete guide**: [README_V3.md](README_V3.md)
- **Migrating from V2**: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- **Config examples**: [config_example_v3.js](config_example_v3.js)

---

## Common Questions

**Q: Can I use Google Photos albums?**
A: No, V3 uses Google Drive folders. Google Photos API is deprecated.

**Q: Do I need to pay for Google Drive?**
A: No! Free tier includes 15GB storage. API is also free (1B requests/day).

**Q: How do I add more photos?**
A: Just upload to your Drive folder. Module scans every 6 hours automatically.

**Q: Can I use existing photos from Google Photos?**
A: Yes, but you need to copy/move them to Google Drive first.

**Q: Photos not changing?**
A: Default is 60 seconds per photo. Check `updateInterval` in config.

---

## Support

- **Issues**: https://github.com/hermanho/MMM-GooglePhotos/issues
- **Questions**: https://github.com/hermanho/MMM-GooglePhotos/discussions

---

**🎉 Enjoy your photos!**

---

## Complete Example Configuration

```javascript
{
  module: "MMM-GooglePhotos",
  position: "fullscreen_below",
  config: {
    // Your Drive folders
    driveFolders: [
      {
        id: "1a2b3c4d5e6f7g8h9i0j",  // Family photos
        depth: -1                     // Scan all subfolders
      },
      {
        id: "2b3c4d5e6f7g8h9i0j1k",  // Vacation photos
        depth: 0                      // Only this folder
      }
    ],

    // Display settings
    updateInterval: 60000,   // Change photo every 60 seconds
    showWidth: 1080,         // Display resolution
    showHeight: 1920,

    // Optional: Cache settings
    maxCacheSizeMB: 200,     // 200MB cache (5-6 hours offline)
    scanInterval: 21600000   // Scan every 6 hours for new photos
  }
}
```

---

**Time to first photo: ~10-15 minutes** ⏱️

*Most time is spent on Google Cloud Console setup and token generation.*
