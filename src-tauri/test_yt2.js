const fs = require('fs');

async function testYouTubePayload(clientName, key, endpoint = 'player') {
  let url = `https://music.youtube.com/youtubei/v1/${endpoint}?alt=json`;
  if (key) url += `&key=${key}`;

  const vd = "CgtfTU5nVEo0MElHbyj2vrDOBjIKCgJSVRIEGgAgJw%3D%3D";
  
  const body = {
    context: {
      client: {
        clientName: clientName,
        clientVersion: clientName === 'IOS' ? '19.45.4' : '1.20240214.01.00',
        hl: 'en',
        gl: 'US'
      }
    },
    videoId: "jfKfPfyJRdk"
  };
  
  if (clientName === 'IOS') {
      body.context.client.deviceMake = "Apple";
      body.context.client.deviceModel = "iPhone16,2";
      body.context.client.osName = "iOS";
      body.context.client.osVersion = "18.1.0.22B83";
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

  const json = await res.json().catch(e => null);
  console.log(`\n=== Test: ${clientName} | Key: ${key ? 'YES' : 'NO'} ===`);
  console.log(`Status: ${res.status}`);
  if (json && json.playabilityStatus) {
    console.log(`Playability: ${json.playabilityStatus.status} | Reason: ${json.playabilityStatus.reason || ''}`);
  } else if (json && json.error) {
    console.log(`Error: ${json.error.message}`);
  }
}

(async () => {
    const CURRENT_KEY = "AIzaSyAO_FJ2nm_8u6qU";
    await testYouTubePayload('IOS', CURRENT_KEY);
    await testYouTubePayload('IOS', null);
    await testYouTubePayload('WEB_REMIX', CURRENT_KEY);
    
    // Let's test clientName = '5' and clientVersion = '19.45.4'
    await testYouTubePayload('5', CURRENT_KEY);
})();
