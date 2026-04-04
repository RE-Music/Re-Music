const fs = require('fs');

async function testYouTubePayload(clientName, key, endpoint = 'player') {
  let url = `https://music.youtube.com/youtubei/v1/${endpoint}?alt=json`;
  if (key) url += `&key=${key}`;

  const vd = "CgtfTU5nVEo0MElHbyj2vrDOBjIKCgJSVRIEGgAgJw%3D%3D"; // From user's log
  
  const body = {
    context: {
      client: {
        clientName: clientName,
        clientVersion: clientName === 'IOS' ? '19.45.4' : '1.20240214.01.00',
        hl: 'en',
        gl: 'US'
      }
    },
    videoId: "jfKfPfyJRdk", // some video id
    racyCheckOk: true,
    contentCheckOk: true
  };
  
  if (clientName === 'IOS') {
      body.context.client.deviceMake = "Apple";
      body.context.client.deviceModel = "iPhone16,2";
      body.context.client.osName = "iOS";
      body.context.client.osVersion = "18.1.0.22B83";
  } else {
      body.playbackContext = { contentPlaybackContext: { signatureTimestamp: 19876 } };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Visitor-Id': vd,
      'User-Agent': clientName === 'IOS' 
        ? 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; en_US)'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  console.log(`\n=== Test: ${clientName} | Key: ${key ? key.substring(0, 10)+'...' : 'NONE'} ===`);
  console.log(`Status: ${res.status}`);
  console.log(`Response: ${text.substring(0, 200)}`);
}

(async () => {
    // Current key used in Rust
    const CURRENT_KEY = "AIzaSyAO_FJ2nm_8u6qU";
    // Key from youtubei.js WEB
    const WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
    
    await testYouTubePayload('IOS', CURRENT_KEY);
    await testYouTubePayload('IOS', WEB_KEY);
    await testYouTubePayload('IOS', null);
    
    await testYouTubePayload('WEB_REMIX', CURRENT_KEY);
    await testYouTubePayload('WEB_REMIX', WEB_KEY);
    await testYouTubePayload('WEB_REMIX', null);
    
    await testYouTubePayload('TVHTML5_SIMPLY_EMBEDDED_PLAYER', CURRENT_KEY);
})();
