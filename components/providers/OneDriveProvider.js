"use strict";

const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;
const axios = require("axios");
const BaseProvider = require("./BaseProvider");

/**
 * Sleep helper function
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * OneDrive Provider for MMM-CloudPhotos
 * Uses Microsoft Graph API to access OneDrive photos
 * @extends BaseProvider
 */
class OneDriveProvider extends BaseProvider {
  /**
   * @param {Object} config - Provider configuration
   * @param {string} config.clientId - Azure App Client ID
   * @param {string} config.clientSecret - Azure App Client Secret
   * @param {string} config.tokenPath - Path to token file
   * @param {Array} config.folders - Folders to scan [{id: "folder_id", depth: -1}]
   * @param {Function} logger - Logging function
   */
  constructor(config, logger) {
    super(config, logger);
    this.apiBase = "https://graph.microsoft.com/v1.0";
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.db = null;
  }

  /**
   * Set database reference (needed for incremental sync)
   * @param {Object} db - PhotoDatabase instance
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * Initialize OneDrive API with OAuth2 authentication
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.log("[ONEDRIVE] Initializing OneDrive API...");

      // Load token from file
      const tokenPath = this.config.tokenPath || "./token_onedrive.json";
      const tokenFilePath = path.isAbsolute(tokenPath)
        ? tokenPath
        : path.resolve(__dirname, "../..", tokenPath);

      const tokenData = JSON.parse(
        await fs.promises.readFile(tokenFilePath, "utf8")
      );

      this.accessToken = tokenData.access_token;
      this.refreshToken = tokenData.refresh_token;
      this.tokenExpiry = tokenData.expiry_date || (Date.now() + 3600000);

      // Refresh token if expired or about to expire
      if (Date.now() >= this.tokenExpiry - 300000) {
        await this.refreshAccessToken();
      }

      // Test the connection
      await this.makeRequest("/me/drive");

      this.log("[ONEDRIVE] Successfully authenticated with OneDrive API");
    } catch (error) {
      this.log("[ONEDRIVE] Authentication failed:", error.message);
      throw new Error(`OneDrive authentication failed: ${error.message}`);
    }
  }

  /**
   * Refresh the access token using refresh token
   * @returns {Promise<void>}
   */
  async refreshAccessToken() {
    try {
      this.log("[ONEDRIVE] Refreshing access token...");

      const response = await axios.post(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.refreshToken,
          grant_type: "refresh_token",
          scope: "Files.Read offline_access"
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token || this.refreshToken;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

      // Save updated token
      const tokenPath = this.config.tokenPath || "./token_onedrive.json";
      const tokenFilePath = path.isAbsolute(tokenPath)
        ? tokenPath
        : path.resolve(__dirname, "../..", tokenPath);

      await fs.promises.writeFile(
        tokenFilePath,
        JSON.stringify({
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          expiry_date: this.tokenExpiry
        }, null, 2)
      );

      this.log("[ONEDRIVE] Access token refreshed");
    } catch (error) {
      this.log("[ONEDRIVE] Token refresh failed:", error.message);
      throw error;
    }
  }

  /**
   * Check if device is online
   * @returns {Promise<boolean>}
   */
  async isOnline() {
    try {
      await dns.resolve("microsoft.com");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Make authenticated request to Microsoft Graph API with retry logic
   * @param {string} endpoint - API endpoint (e.g., "/me/drive")
   * @param {Object} options - Axios options
   * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
   * @returns {Promise<Object>} Response data
   */
  async makeRequest(endpoint, options = {}, maxRetries = 3) {
    // Check if online before attempting request
    if (!(await this.isOnline())) {
      this.log("[ONEDRIVE] Device is offline, skipping request");
      throw new Error("Device is offline");
    }

    // Refresh token if needed
    if (Date.now() >= this.tokenExpiry - 300000) {
      await this.refreshAccessToken();
    }

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await axios({
          method: options.method || "GET",
          url: `${this.apiBase}${endpoint}`,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...options.headers
          },
          ...options
        });

        return response.data;
      } catch (error) {
        attempt++;

        // Determine if error is retryable
        const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code);
        const isServerError = error.response?.status >= 500 && error.response?.status < 600;
        const isRateLimited = error.response?.status === 429;
        const shouldRetry = (isNetworkError || isServerError || isRateLimited) && attempt < maxRetries;

        if (!shouldRetry) {
          this.log(`[ONEDRIVE] API request failed (attempt ${attempt}/${maxRetries}): ${endpoint}`, error.message);
          throw error;
        }

        // Exponential backoff: 2s, 4s, 8s... (max 60s)
        const delay = Math.min(1000 * Math.pow(2, attempt), 60000);
        this.log(`[ONEDRIVE] Request failed (${error.code || error.response?.status}), retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await sleep(delay);
      }
    }
  }

  /**
   * Scan a folder for photos with depth control
   * @param {string|null} folderId - Folder ID (null for root)
   * @param {number} maxDepth - Maximum depth (-1 = infinite, 0 = folder only)
   * @param {number} currentDepth - Current depth in recursion
   * @param {Set<string>} visitedFolders - Set of visited folder IDs
   * @returns {Promise<Array>} Array of photo metadata
   */
  async scanFolder(folderId, maxDepth = -1, currentDepth = 0, visitedFolders = new Set()) {
    try {
      const photos = [];

      // Prevent circular references
      if (folderId && visitedFolders.has(folderId)) {
        this.log(`[ONEDRIVE] Skipping circular reference: ${folderId}`);
        return photos;
      }

      if (folderId) {
        visitedFolders.add(folderId);
      }

      this.log(`[ONEDRIVE] Scanning folder (depth ${currentDepth}/${maxDepth})...`);

      // Build endpoint for folder items
      const endpoint = folderId
        ? `/me/drive/items/${folderId}/children`
        : "/me/drive/root/children";

      // Paginated results
      let nextLink = null;
      do {
        const data = nextLink
          ? await this.makeRequest(nextLink.replace(this.apiBase, ""))
          : await this.makeRequest(endpoint);

        for (const item of data.value || []) {
          // Check if it's an image file
          if (item.file && item.image) {
            // Convert to standard format
            const photo = {
              id: item.id,
              name: item.name,
              parents: [folderId || "root"],
              createdTime: item.createdDateTime,
              imageMediaMetadata: {
                width: item.image.width,
                height: item.image.height
              }
            };
            photos.push(photo);
          }

          // Recursively scan subfolders
          if (item.folder && (maxDepth === -1 || currentDepth < maxDepth)) {
            const subPhotos = await this.scanFolder(
              item.id,
              maxDepth,
              currentDepth + 1,
              visitedFolders
            );
            photos.push(...subPhotos);
          }
        }

        nextLink = data["@odata.nextLink"];

        // Small delay between pagination requests to avoid rate limiting
        if (nextLink) {
          await sleep(500);
        }
      } while (nextLink);

      this.log(`[ONEDRIVE] Folder scan complete. Total photos: ${photos.length}`);
      return photos;

    } catch (error) {
      this.log(`[ONEDRIVE] Error scanning folder ${folderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Perform full scan of all configured folders
   * @returns {Promise<Array>} Array of all photo metadata
   */
  async fullScan() {
    try {
      this.log("[ONEDRIVE] Starting full scan of all configured folders...");
      const allPhotos = [];
      const folders = this.config.folders || [];

      if (folders.length === 0) {
        this.log("[ONEDRIVE] Warning: No folders configured");
        return allPhotos;
      }

      for (const folderConfig of folders) {
        const folderId = folderConfig.id || null;
        const depth = folderConfig.depth !== undefined ? folderConfig.depth : -1;

        this.log(`[ONEDRIVE] Scanning folder: ${folderId || 'root'} (depth: ${depth})`);

        const photos = await this.scanFolder(folderId, depth);
        allPhotos.push(...photos);
      }

      // Remove duplicates
      const uniquePhotos = Array.from(
        new Map(allPhotos.map(photo => [photo.id, photo])).values()
      );

      this.log(`[ONEDRIVE] Full scan complete. Found ${uniquePhotos.length} unique photos`);
      return uniquePhotos;

    } catch (error) {
      this.log("[ONEDRIVE] Full scan failed:", error.message);
      throw error;
    }
  }

  /**
   * Download a photo from OneDrive
   * @param {string} photoId - Photo file ID
   * @param {Object} options - Download options
   * @returns {Promise<Stream>} Readable stream of photo data
   */
  async downloadPhoto(photoId, options = {}) {
    try {
      // Refresh token if needed
      if (Date.now() >= this.tokenExpiry - 300000) {
        await this.refreshAccessToken();
      }

      const timeout = options.timeout || 30000;

      const response = await axios({
        method: "GET",
        url: `${this.apiBase}/me/drive/items/${photoId}/content`,
        headers: {
          Authorization: `Bearer ${this.accessToken}`
        },
        responseType: "stream",
        timeout: timeout
      });

      return response.data;

    } catch (error) {
      this.log(`[ONEDRIVE] Failed to download photo ${photoId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get changes since a given token (for incremental sync)
   * Uses Microsoft Graph Delta API
   * @param {string} deltaToken - Token from previous sync
   * @returns {Promise<Object>} Object with photos, deletedIds, nextToken
   */
  async getChanges(deltaToken) {
    try {
      if (!this.db) {
        throw new Error("Database not set. Call setDatabase() before using incremental sync.");
      }

      this.log("[ONEDRIVE] Getting changes since last sync...");

      const changedPhotos = [];
      const deletedIds = [];
      let changeCount = 0;
      let nextDeltaToken = deltaToken;

      // Use delta link or start fresh
      const endpoint = deltaToken || "/me/drive/root/delta";

      let nextLink = endpoint;
      do {
        const data = await this.makeRequest(nextLink.replace(this.apiBase, ""));

        for (const item of data.value || []) {
          changeCount++;

          // Handle deletions
          if (item.deleted) {
            this.log(`[ONEDRIVE] Photo deleted: ${item.id}`);
            deletedIds.push(item.id);
            continue;
          }

          // Only process image files
          if (item.file && item.image) {
            // Check if in monitored folders
            if (await this.isPhotoInMonitoredFolders(item)) {
              this.log(`[ONEDRIVE] Photo changed: ${item.name}`);
              changedPhotos.push({
                id: item.id,
                name: item.name,
                parents: item.parentReference ? [item.parentReference.id] : ["root"],
                createdTime: item.createdDateTime,
                imageMediaMetadata: {
                  width: item.image.width,
                  height: item.image.height
                }
              });
            }
          }
        }

        // Get next link or delta link
        nextLink = data["@odata.nextLink"];
        if (data["@odata.deltaLink"]) {
          nextDeltaToken = data["@odata.deltaLink"];
          break;
        }

        // Small delay between pagination requests to avoid rate limiting
        if (nextLink) {
          await sleep(500);
        }

      } while (nextLink);

      this.log(`[ONEDRIVE] Incremental sync complete. Processed ${changeCount} changes, found ${changedPhotos.length} photos, ${deletedIds.length} deleted`);

      return {
        photos: changedPhotos,
        deletedIds: deletedIds,
        nextToken: nextDeltaToken
      };

    } catch (error) {
      this.log("[ONEDRIVE] Failed to get changes:", error.message);
      throw error;
    }
  }

  /**
   * Get a start delta token for incremental sync
   * @returns {Promise<string>} Delta token
   */
  async getStartPageToken() {
    try {
      const data = await this.makeRequest("/me/drive/root/delta");

      // Get the delta link for next time
      let deltaLink = data["@odata.deltaLink"];

      // If no delta link yet, follow pagination to get it
      let nextLink = data["@odata.nextLink"];
      while (nextLink && !deltaLink) {
        await sleep(500); // Delay between pagination requests
        const pageData = await this.makeRequest(nextLink.replace(this.apiBase, ""));
        deltaLink = pageData["@odata.deltaLink"];
        nextLink = pageData["@odata.nextLink"];
      }

      this.log(`[ONEDRIVE] Got start delta token`);
      return deltaLink;
    } catch (error) {
      this.log("[ONEDRIVE] Failed to get start delta token:", error.message);
      throw error;
    }
  }

  /**
   * Check if a photo is in one of the monitored folders
   * @param {Object} item - File item from OneDrive API
   * @returns {Promise<boolean>}
   */
  async isPhotoInMonitoredFolders(item) {
    try {
      const folders = this.config.folders || [];

      if (folders.length === 0) {
        return true; // If no folders configured, accept all
      }

      // Get parent folder ID
      const parentId = item.parentReference ? item.parentReference.id : null;

      if (!parentId) {
        return false;
      }

      // Check if parent matches any monitored folder
      for (const folderConfig of folders) {
        const monitoredFolderId = folderConfig.id;

        if (parentId === monitoredFolderId) {
          return true;
        }

        // Check if parent is a descendant of monitored folder
        if (await this.isDescendantOf(parentId, monitoredFolderId)) {
          return true;
        }
      }

      return false;

    } catch (error) {
      this.log("[ONEDRIVE] Error checking folder membership:", error.message);
      return true; // Be conservative on error
    }
  }

  /**
   * Check if a folder is a descendant of another folder
   * @param {string} folderId - Folder to check
   * @param {string} ancestorId - Potential ancestor folder
   * @returns {Promise<boolean>}
   */
  async isDescendantOf(folderId, ancestorId) {
    try {
      let currentId = folderId;
      const visited = new Set();
      const maxDepth = 20;
      let depth = 0;

      while (currentId && depth < maxDepth) {
        if (visited.has(currentId)) {
          return false; // Circular reference
        }
        visited.add(currentId);

        if (currentId === ancestorId) {
          return true;
        }

        // Get parent folder
        const item = await this.makeRequest(`/me/drive/items/${currentId}`);

        if (!item.parentReference || !item.parentReference.id) {
          return false; // Reached root
        }

        currentId = item.parentReference.id;
        depth++;
      }

      return false;

    } catch (error) {
      this.log("[ONEDRIVE] Error checking folder ancestry:", error.message);
      return false;
    }
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getProviderName() {
    return "OneDrive";
  }
}

module.exports = OneDriveProvider;
