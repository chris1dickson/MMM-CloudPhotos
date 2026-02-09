# Changelog

## Version 3.1.0 - OneDrive Provider (2025-02-09)

### ✨ New Features

**OneDrive Support is Now Live!**

MMM-CloudPhotos now supports **Microsoft OneDrive** as a photo storage provider, alongside Google Drive.

#### What's New

1. **OneDriveProvider** - Complete implementation using Microsoft Graph API
   - OAuth2 authentication with refresh token support
   - Folder scanning with depth control
   - Incremental sync using Delta API (super efficient!)
   - Automatic token refresh

2. **Token Generation Script** - `generate_onedrive_token.js`
   - Interactive OAuth2 flow
   - Local callback server for easy authorization
   - Saves token with client credentials

3. **Comprehensive Documentation** - `ONEDRIVE_SETUP.md`
   - Step-by-step Azure app registration
   - Complete configuration examples
   - Troubleshooting guide
   - Security best practices

#### Configuration Example

```javascript
{
  module: "MMM-CloudPhotos",
  position: "fullscreen_below",
  config: {
    provider: "onedrive",
    providerConfig: {
      clientId: "YOUR_CLIENT_ID",
      clientSecret: "YOUR_CLIENT_SECRET",
      tokenPath: "./token_onedrive.json",
      folders: [
        { id: "YOUR_FOLDER_ID", depth: -1 }
      ]
    },
    updateInterval: 60000,
    showWidth: 1920,
    showHeight: 1080
  }
}
```

#### Features

- ✅ **Delta API Sync** - Only fetch changes, not full folder scans
- ✅ **Automatic Token Refresh** - Tokens refreshed before expiry
- ✅ **Recursive Folder Scanning** - Scan subfolders to any depth
- ✅ **Image Optimization** - Same Sharp processing as Google Drive
- ✅ **Rate Limit Friendly** - 10,000 requests per 10 minutes

#### Files Added

- `components/providers/OneDriveProvider.js` - OneDrive implementation
- `generate_onedrive_token.js` - OAuth token generator
- `ONEDRIVE_SETUP.md` - Complete setup guide

#### Provider Factory Updated

- Registered OneDrive in ProviderFactory
- Now supports: `google-drive` and `onedrive`

---

## Version 3.0.0 - Module Refactor (2025-02-09)

### 🚨 Breaking Changes

**Module Renamed: MMM-GooglePhotos → MMM-CloudPhotos**

This module has been refactored to support multiple cloud storage providers. While it currently supports Google Drive, the new architecture makes it easy to add OneDrive, Dropbox, iCloud Photos, and other providers in the future.

#### What Changed

1. **Module Name**
   - Old: `MMM-GooglePhotos`
   - New: `MMM-CloudPhotos`

2. **Module Files**
   - `MMM-GooglePhotos.js` → `MMM-CloudPhotos.js`
   - `MMM-GooglePhotos.css` → `MMM-CloudPhotos.css`

3. **Configuration Format** (Backward Compatible)
   - Old V2/V3 config still works
   - New config supports provider selection:

   ```javascript
   // New Format (Recommended)
   {
     module: "MMM-CloudPhotos",
     config: {
       provider: "google-drive",  // NEW: Select provider
       providerConfig: {
         keyFilePath: "./google_drive_auth.json",
         tokenPath: "./token_drive.json",
         driveFolders: [{ id: "folder_id", depth: -1 }]
       },
       // Universal settings
       showWidth: 1920,
       showHeight: 1080,
       updateInterval: 60000,
       useBlobStorage: true,
       maxCacheSizeMB: 200
     }
   }

   // Old Format (Still Works)
   {
     module: "MMM-CloudPhotos",
     config: {
       keyFilePath: "./google_drive_auth.json",
       tokenPath: "./token_drive.json",
       driveFolders: [{ id: "folder_id", depth: -1 }],
       // ... other settings
     }
   }
   ```

4. **Internal Architecture**
   - Provider abstraction layer introduced
   - `GDriveAPI` refactored to `GoogleDriveProvider`
   - New `BaseProvider` interface for adding providers
   - Provider factory pattern for instantiation

#### Migration Guide

**No migration needed!** This is treated as a new module.

1. Remove old `MMM-GooglePhotos` from your config
2. Add `MMM-CloudPhotos` with the same configuration
3. Restart MagicMirror

Your existing `google_drive_auth.json` and `token_drive.json` files will continue to work. Your photo cache and database will be preserved if you use the same cache directory.

### ✨ New Features

- **Provider System**: Extensible architecture for multiple cloud storage providers
- **Provider Factory**: Automatic provider instantiation based on config
- **Better Logging**: Provider-aware log messages show which cloud service is being used
- **Future-Ready**: Easy to add OneDrive, Dropbox, iCloud Photos, etc.

### 🔧 Technical Changes

#### New Components

- `components/providers/BaseProvider.js` - Abstract provider interface
- `components/providers/ProviderFactory.js` - Provider registry and factory
- `components/providers/GoogleDriveProvider.js` - Google Drive implementation

#### Updated Components

- `node_helper.js` - Uses provider factory instead of direct GDriveAPI instantiation
- `CacheManager.js` - Provider-agnostic (works with any BaseProvider)
- `package.json` - Updated name, version (3.0.0), description

#### Backward Compatibility

- Old config format automatically converted to new format
- Existing auth files (`google_drive_auth.json`, `token_drive.json`) work unchanged
- Database schema unchanged (seamless upgrade)
- All existing features preserved

### 📚 Documentation Updates

- `README.md` - Updated for new module name and configuration
- `BLOB_STORAGE_GUIDE.md` - Updated references to MMM-CloudPhotos
- `REFACTOR_PLAN.md` - Complete refactoring documentation
- `CHANGELOG.md` - This file!

### 🧪 Testing

All tests updated and passing:
- ✅ 34/34 unit tests passing
- ✅ 6/6 integration tests passing
- ✅ Provider system tested
- ✅ Backward compatibility verified

---

## Version 2.1.8 - File Mode Resizing (2025-02-09)

### ✨ New Features

- **Image resizing in file mode**: Both BLOB and file storage modes now resize images when Sharp is installed
- File mode now achieves same 70-80% storage savings as BLOB mode

### 🐛 Bug Fixes

- Fixed file mode downloading original-size images
- Fixed test mocks to use valid JPEG buffers

### 🧪 Testing

- All 40 tests passing (34 unit + 6 integration)
- Added `test_file_resize.js` standalone test
- Updated test mocks for Sharp compatibility

---

## Version 2.1.0 - Google Drive Migration (2025)

### 🚨 Breaking Changes

- **Google Photos API deprecated** - Module now uses Google Drive API
- Requires new authentication setup (Google Drive credentials)
- Config uses `driveFolders` instead of `albums`

### ✨ New Features

- Google Drive API integration
- Folder-based photo organization
- Recursive folder scanning
- Incremental sync with Changes API
- BLOB storage mode with automatic image resizing
- Offline-first architecture with local cache

---

## Version 1.x - Legacy (Google Photos API)

**Note**: V1.x used the deprecated Google Photos API and no longer works.

Refer to V2+ for current functionality.

---

## Future Roadmap

### Planned Providers

- **OneDrive** - Microsoft cloud storage
- **Dropbox** - Popular file hosting
- **iCloud Photos** - Apple's photo service
- **Local Filesystem** - Scan local folders
- **SMB/NAS** - Network share support

### Planned Features

- WebP support for smaller file sizes
- Lazy loading thumbnails
- Preloading next image in background
- ML-based smart photo selection
- Face detection and filtering
- Geolocation-based filtering

---

For detailed technical documentation, see:
- `REFACTOR_PLAN.md` - Complete architecture documentation
- `BLOB_STORAGE_GUIDE.md` - Image processing and storage guide
- `README.md` - User guide and setup instructions
