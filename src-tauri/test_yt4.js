const fs = require('fs');

async function testYouTubePayload(clientObj) {
  const url = `https://youtubei.googleapis.com/youtubei/v1/player?alt=json&key=AIzaSyAO_FJ2nm_8u6qU`;

  const vd = "CgtfTU5nVEo0MElHbyj2vrDOBjIKCgJSVRIEGgAgJw%3D%3D";
  const body = {
    context: {
      client: {
        hl: 'en',
        gl: 'US',
        ...clientObj.payload
      }
    },
    videoId: "jfKfPfyJRdk", // specific music track
    playbackContext: {
        contentPlaybackContext: {
            signatureTimestamp: 19876
        }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Visitor-Id': vd,
      'User-Agent': clientObj.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    body: JSON.stringify(body)
  }).catch(e => null);

  if (!res) return console.log(`${clientObj.name}: FETCH FAILED`);

  const json = await res.json().catch(e => null);
  
  if (json && json.playabilityStatus) {
    console.log(`${clientObj.name}: ${res.status} | Playability: ${json.playabilityStatus.status} | Reason: ${json.playabilityStatus.reason || ''}`);
  } else if (json && json.error) {
    console.log(`${clientObj.name}: ${res.status} | Error: ${json.error.message}`);
  } else {
    console.log(`${clientObj.name}: ${res.status} | Unknown response`);
  }
}

(async () => {
    const clients = [
        { name: 'TVHTML5', payload: { clientName: 'TVHTML5', clientVersion: '7.20230404.09.00', osName: 'Windows', osVersion: '10.0' }, ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' },
        { name: 'TVHTML5_2', payload: { clientName: 'TVHTML5', clientVersion: '7.20260311.12.00', osName: 'Windows', osVersion: '10.0' }, ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version' },
        { name: 'TVHTML5_SIMPLY', payload: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0' } },
        { name: 'WEB_REMIX', payload: { clientName: 'WEB_REMIX', clientVersion: '1.20240214.01.00' } },
        { name: 'MWEB', payload: { clientName: 'MWEB', clientVersion: '2.20260205.04.01' } },
        { name: 'IOS', payload: { clientName: 'IOS', clientVersion: '19.45.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iOS', osVersion: '18.1.0.22B83' }, ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X; en_US)' },
        { name: 'ANDROID_VR', payload: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', androidSdkVersion: 32, osName: 'Android' }, ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' }
    ];
    
    for (let c of clients) {
        await testYouTubePayload(c);
        // also test on music.youtube.com
        const url2 = `https://music.youtube.com/youtubei/v1/player?alt=json&key=AIzaSyAO_FJ2nm_8u6qU`;
        const res2 = await fetch(url2, { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({context:{client:{...c.payload,hl:'en',gl:'US'}},videoId:"jfKfPfyJRdk"}) }).catch(e=>null);
        if (res2) {
            const j2 = await res2.json().catch(e=>null);
            if (j2 && j2.playabilityStatus) console.log(`${c.name} (music.): ${res2.status} | Playability: ${j2.playabilityStatus.status}`);
            else if (j2 && j2.error) console.log(`${c.name} (music.): ${res2.status} | Error: ${j2.error.message}`);
        }
    }
})();
