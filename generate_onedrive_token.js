#!/usr/bin/env node

"use strict";

/**
 * OneDrive OAuth2 Token Generator
 *
 * This script helps you generate an OAuth2 token for OneDrive/Microsoft Graph API.
 *
 * Prerequisites:
 * 1. Register an application in Azure Portal (https://portal.azure.com)
 * 2. Go to "Azure Active Directory" → "App registrations" → "New registration"
 * 3. Set redirect URI to: http://localhost:3000/callback
 * 4. Generate a client secret under "Certificates & secrets"
 * 5. Grant permissions: Files.Read (under Microsoft Graph)
 */

const http = require("http");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  console.log("=" .repeat(60));
  console.log("OneDrive OAuth2 Token Generator");
  console.log("=" .repeat(60));
  console.log();

  // Get client credentials
  console.log("First, you need to register an app in Azure Portal:");
  console.log("1. Go to https://portal.azure.com");
  console.log("2. Navigate to 'Azure Active Directory' → 'App registrations'");
  console.log("3. Click 'New registration'");
  console.log("4. Name: 'MMM-CloudPhotos'");
  console.log("5. Redirect URI: http://localhost:3000/callback (Web)");
  console.log("6. After creation, go to 'Certificates & secrets' → 'New client secret'");
  console.log("7. Go to 'API permissions' → 'Add permission' → 'Microsoft Graph'");
  console.log("   → 'Delegated permissions' → Add 'Files.Read' and 'offline_access'");
  console.log();

  const clientId = await question("Enter your Client ID (Application ID): ");
  const clientSecret = await question("Enter your Client Secret (Value): ");

  console.log();
  console.log("Starting OAuth2 flow...");
  console.log();

  // OAuth2 parameters
  const redirectUri = "http://localhost:3000/callback";
  const scope = "Files.Read offline_access";
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
    `client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_mode=query`;

  console.log("=" .repeat(60));
  console.log("STEP 1: Authorize the application");
  console.log("=" .repeat(60));
  console.log();
  console.log("Open this URL in your browser:");
  console.log();
  console.log(authUrl);
  console.log();
  console.log("After authorizing, you'll be redirected to localhost.");
  console.log("The script will automatically capture the authorization code.");
  console.log();

  // Start local server to receive callback
  const authCode = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${error}</p><p>You can close this window.</p>`);
          reject(new Error(`Authorization failed: ${error}`));
          server.close();
          return;
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <h1>Success!</h1>
            <p>Authorization successful. You can close this window and return to the terminal.</p>
          `);
          resolve(code);
          server.close();
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(3000, () => {
      console.log("Waiting for authorization...");
      console.log("(Local server started on http://localhost:3000)");
      console.log();
    });

    server.on("error", (err) => {
      reject(new Error(`Server error: ${err.message}`));
    });
  });

  console.log("✅ Authorization code received!");
  console.log();

  // Exchange code for tokens
  console.log("=" .repeat(60));
  console.log("STEP 2: Exchanging code for access token");
  console.log("=" .repeat(60));
  console.log();

  try {
    const tokenResponse = await axios.post(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authCode,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: scope
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }
    );

    const tokenData = {
      access_token: tokenResponse.data.access_token,
      refresh_token: tokenResponse.data.refresh_token,
      expiry_date: Date.now() + (tokenResponse.data.expires_in * 1000),
      client_id: clientId,
      client_secret: clientSecret
    };

    // Save token
    const tokenPath = path.resolve(__dirname, "token_onedrive.json");
    await fs.promises.writeFile(
      tokenPath,
      JSON.stringify(tokenData, null, 2)
    );

    console.log("✅ Token successfully generated!");
    console.log();
    console.log(`Token saved to: ${tokenPath}`);
    console.log();
    console.log("=" .repeat(60));
    console.log("NEXT STEPS");
    console.log("=" .repeat(60));
    console.log();
    console.log("1. Add OneDrive configuration to your MagicMirror config:");
    console.log();
    console.log("   {");
    console.log("     module: \"MMM-CloudPhotos\",");
    console.log("     position: \"fullscreen_below\",");
    console.log("     config: {");
    console.log("       provider: \"onedrive\",");
    console.log("       providerConfig: {");
    console.log(`         clientId: "${clientId}",`);
    console.log("         clientSecret: \"YOUR_CLIENT_SECRET\",");
    console.log("         tokenPath: \"./token_onedrive.json\",");
    console.log("         folders: [");
    console.log("           { id: \"YOUR_FOLDER_ID\", depth: -1 }");
    console.log("         ]");
    console.log("       },");
    console.log("       updateInterval: 60000,");
    console.log("       showWidth: 1920,");
    console.log("       showHeight: 1080");
    console.log("     }");
    console.log("   }");
    console.log();
    console.log("2. To get folder IDs:");
    console.log("   - Go to OneDrive web interface");
    console.log("   - Navigate to the folder");
    console.log("   - Check the URL: ...?id=%2Fdrive%2Froot%3A%2Fyourfolder");
    console.log("   - The folder ID is the part after 'id='");
    console.log("   - Or use null for root folder");
    console.log();
    console.log("3. Restart MagicMirror");
    console.log();
    console.log("=" .repeat(60));

  } catch (error) {
    console.error("❌ Token exchange failed:", error.message);
    if (error.response) {
      console.error("Response:", error.response.data);
    }
    process.exit(1);
  }

  rl.close();
}

main().catch(error => {
  console.error("❌ Error:", error.message);
  rl.close();
  process.exit(1);
});
