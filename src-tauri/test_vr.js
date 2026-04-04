const fs = require('fs');

async function testVR() {
  const url = `https://youtubei.googleapis.com/youtubei/v1/player?alt=json&key=AIzaSyAO_FJ2nm_8u6qU`;

  const vd = "CgtfTU5nVEo0MElHbyj2vrDOBjIKCgJSVRIEGgAgJw%3D%3D";
  const body = {
    context: {
      client: {
        hl: 'en',
        gl: 'US',
        clientName: 'ANDROID_VR',
        clientVersion: '1.65.10',
        androidSdkVersion: 32,
        osName: 'Android'
      }
    },
    videoId: "jfKfPfyJRdk", 
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
      'User-Agent': 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
    },
    body: JSON.stringify(body)
  });

  const json = await res.json().catch(e => null);
  
  if (json && json.streamingData) {
      if (json.streamingData.adaptiveFormats) {
          const audioFormats = json.streamingData.adaptiveFormats.filter(f => f.mimeType.startsWith('audio/'));
          console.log(`SUCCESS: Found ${audioFormats.length} audio formats!`);
          if (audioFormats.length > 0) {
              console.log(`First audio URL length: ${audioFormats[0].url ? audioFormats[0].url.length : 'NO URL, Cipher?'}`);
              if (audioFormats[0].signatureCipher) console.log('Uses cipher :(');
          }
      } else {
          console.log('No adaptive formats');
      }
  } else {
      console.log('No streaming data found');
  }
}

testVR();
