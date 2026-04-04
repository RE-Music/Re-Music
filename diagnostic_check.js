
const fs = require('fs');
const path = require('path');

// Mock Logger
const Logger = { 
  info: console.log, 
  error: console.error, 
  warn: console.warn,
  init: () => {}
};

async function testFetch() {
  console.log('--- DIAGNOSTIC: Provider Connectivity Test ---');
  
  // Try to find any existing tokens to check auth status
  const authPath = path.join(process.env.APPDATA, 'NanoMus', 'auth_config.json');
  console.log('Auth check:', authPath);
  if (fs.existsSync(authPath)) {
    console.log('Auth config exists.');
  } else {
    console.log('Auth config NOT found in APPDATA.');
  }

  // We can't easily run the full Electron environment here, 
  // but we can check if the providers are correctly trying to use the proxy.
  
  const spotifyProvPath = 'c:/Users/User/Nmis/src/main/plugins/spotify/SpotifyProvider.ts';
  if (fs.existsSync(spotifyProvPath)) {
    const content = fs.readFileSync(spotifyProvPath, 'utf8');
    if (content.includes('httpClient')) {
      console.log('SpotifyProvider uses HttpClient.');
    }
  }
}

testFetch().catch(console.error);
