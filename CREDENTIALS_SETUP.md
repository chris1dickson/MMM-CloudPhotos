# Google Drive Credentials Setup Guide

Step-by-step guide to create `google_drive_auth.json` for MMM-GooglePhotos V3.

---

## What You Need

MMM-GooglePhotos V3 requires **OAuth 2.0 Desktop credentials** from Google Cloud Console.

The file should be named: **`google_drive_auth.json`**

---

## Step-by-Step Instructions

### Step 1: Go to Google Cloud Console

Open in your browser:
```
https://console.cloud.google.com
```

Sign in with your Google account.

---

### Step 2: Create or Select a Project

#### Option A: Create New Project

1. Click the project dropdown (top left, near "Google Cloud")
2. Click "**NEW PROJECT**"
3. Project name: `MMM-GooglePhotos` (or any name)
4. Click "**CREATE**"
5. Wait ~10 seconds for project creation
6. Select your new project from the dropdown

#### Option B: Use Existing Project

1. Click the project dropdown
2. Select an existing project

---

### Step 3: Enable Google Drive API

1. In the left sidebar, click "**APIs & Services**" → "**Library**"
   - Or go directly to: https://console.cloud.google.com/apis/library

2. Search for: **`Google Drive API`**

3. Click on "**Google Drive API**"

4. Click the blue "**ENABLE**" button

5. Wait for it to enable (~5 seconds)

---

### Step 4: Configure OAuth Consent Screen (If Needed)

If this is a new project, you may need to configure the consent screen:

1. Go to "**APIs & Services**" → "**OAuth consent screen**"
   - Or: https://console.cloud.google.com/apis/credentials/consent

2. User Type: Select "**External**"
   - Click "**CREATE**"

3. **App Information:**
   - App name: `MMM-GooglePhotos`
   - User support email: Your email
   - Developer contact: Your email

4. Click "**SAVE AND CONTINUE**"

5. **Scopes:** Click "**SAVE AND CONTINUE**" (no changes needed)

6. **Test users:** Click "**SAVE AND CONTINUE**" (no changes needed)

7. Click "**BACK TO DASHBOARD**"

---

### Step 5: Create OAuth 2.0 Credentials

1. Go to "**APIs & Services**" → "**Credentials**"
   - Or: https://console.cloud.google.com/apis/credentials

2. Click "**+ CREATE CREDENTIALS**" (top of page)

3. Select "**OAuth client ID**"

4. Application type: **Desktop app** ⬅️ IMPORTANT!

5. Name: `MMM-GooglePhotos Desktop` (or any name)

6. Click "**CREATE**"

---

### Step 6: Download Credentials

After creating the credentials:

1. A dialog appears: "OAuth client created"

2. Click "**DOWNLOAD JSON**" button
   - This downloads a file like: `client_secret_123456789.json`

3. **IMPORTANT:** Rename this file to: **`google_drive_auth.json`**

4. Move it to your MMM-GooglePhotos folder

---

## File Location

The file should be at:
```
MMM-GooglePhotos/
└── google_drive_auth.json  ← Put it here
```

---

## What the File Looks Like

Your `google_drive_auth.json` should look similar to this:

```json
{
  "installed": {
    "client_id": "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
    "project_id": "your-project-name",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "GOCSPX-AbCdEfGhIjKlMnOpQrStUvWxYz",
    "redirect_uris": ["http://localhost"]
  }
}
```

Or it might have this structure:

```json
{
  "client_id": "123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com",
  "project_id": "your-project-name",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_secret": "GOCSPX-AbCdEfGhIjKlMnOpQrStUvWxYz",
  "redirect_uris": ["http://localhost", "urn:ietf:wg:oauth:2.0:oob"]
}
```

Both formats are valid!

---

## Verification

Check your file:

```bash
# Check file exists
ls -l google_drive_auth.json

# Check it's valid JSON
cat google_drive_auth.json | python -m json.tool
# or
node -e "console.log(JSON.parse(require('fs').readFileSync('google_drive_auth.json')))"
```

Should see no errors.

---

## Next Step: Generate Token

Once you have `google_drive_auth.json`:

```bash
node generate_drive_token.js
```

This creates `token_drive.json` which is the actual access token.

---

## Common Issues

### "File not found"

Make sure:
- File is named exactly: `google_drive_auth.json`
- File is in the module root folder (same folder as package.json)
- File is not in a subfolder

### "Invalid JSON"

Make sure:
- File downloaded completely
- File is not corrupted
- File ends with `.json` not `.json.txt`

### "Wrong application type"

Make sure you selected "**Desktop app**" not:
- ❌ Web application
- ❌ Android
- ❌ iOS
- ❌ TV and Limited Input
- ✅ Desktop app ← Use this one!

### "OAuth consent screen error"

You need to configure the consent screen first (Step 4 above).

---

## Security Note

⚠️ **Keep this file private!** ⚠️

- Contains your OAuth client secret
- Do not share publicly
- Do not commit to public repositories
- Add to `.gitignore`

The module includes `.gitignore` that ignores:
- `google_drive_auth.json`
- `token_drive.json`

---

## Alternative: Use Existing Credentials

If you already have credentials from another Google API project:

1. Make sure Google Drive API is enabled
2. Copy your existing credentials file
3. Rename to `google_drive_auth.json`
4. Place in module folder

---

## Quick Reference

| Step | What to Do |
|------|------------|
| 1 | Go to console.cloud.google.com |
| 2 | Create/select project |
| 3 | Enable Google Drive API |
| 4 | Configure OAuth consent (if needed) |
| 5 | Create OAuth Desktop credentials |
| 6 | Download JSON, rename to `google_drive_auth.json` |

---

## Visual Guide

### Finding Credentials Page

```
Google Cloud Console
├── Navigation Menu (☰)
└── APIs & Services
    └── Credentials  ← Click here
```

### Creating Credentials

```
Credentials Page
├── + CREATE CREDENTIALS (button at top)
└── OAuth client ID
    └── Application type: Desktop app ← Select this
        └── CREATE (button)
            └── DOWNLOAD JSON (button in dialog)
```

---

## Testing Credentials

After creating the file:

```bash
# Test 1: Check file exists
test -f google_drive_auth.json && echo "✅ File exists" || echo "❌ File not found"

# Test 2: Check it's valid JSON
node -e "try { JSON.parse(require('fs').readFileSync('google_drive_auth.json')); console.log('✅ Valid JSON'); } catch(e) { console.log('❌ Invalid JSON'); }"

# Test 3: Check it has required fields
node -e "const c = JSON.parse(require('fs').readFileSync('google_drive_auth.json')); const data = c.installed || c; console.log(data.client_id ? '✅ Has client_id' : '❌ Missing client_id'); console.log(data.client_secret ? '✅ Has client_secret' : '❌ Missing client_secret');"
```

All should show ✅ green checkmarks.

---

## Still Having Issues?

### Check Project Settings

```
Google Cloud Console
└── IAM & Admin
    └── Settings
        └── Project ID: Note this down
```

### Check API Status

```
Google Cloud Console
└── APIs & Services
    └── Enabled APIs & services
        └── Should see "Google Drive API" listed
```

### Regenerate Credentials

If nothing works:
1. Delete the credential from Google Cloud Console
2. Start over from Step 5

---

## Example Commands

```bash
# Download and rename in one step
mv ~/Downloads/client_secret_*.json google_drive_auth.json

# Verify structure
cat google_drive_auth.json

# Generate token (after credentials are ready)
node generate_drive_token.js
```

---

## What's Next?

Once you have `google_drive_auth.json`:

1. ✅ File is in correct location
2. ✅ File is valid JSON
3. ➡️ Run: `node generate_drive_token.js`
4. ➡️ Complete OAuth flow in browser
5. ➡️ Token saved to `token_drive.json`
6. ➡️ Run: `node quick-test.js`

---

## Summary Checklist

- [ ] Google Cloud project created/selected
- [ ] Google Drive API enabled
- [ ] OAuth consent screen configured
- [ ] Desktop app credentials created
- [ ] JSON file downloaded
- [ ] File renamed to `google_drive_auth.json`
- [ ] File placed in module folder
- [ ] File is valid JSON
- [ ] Ready to run `node generate_drive_token.js`

---

**Once you have `google_drive_auth.json`, you're 80% done!** 🎉

Next: `node generate_drive_token.js`
