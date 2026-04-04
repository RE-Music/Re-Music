const axios = require('axios');
const fs = require('fs');

async function debugWave() {
    const auth = JSON.parse(fs.readFileSync('C:\\Users\\User\\AppData\\Roaming\\com.nanomus.app\\auth.json', 'utf8'));
    const token = auth.yandex;
    
    if (!token) {
        console.error('Yandex token not found');
        return;
    }

    const headers = {
        'Authorization': `OAuth ${token}`,
        'X-Yandex-Music-Client': 'YandexMusicAndroid/2023.12.1',
        'User-Agent': 'YandexMusic/2023.12.1 (Android 13; Pixel 7)'
    };

    console.log('Testing dashboard...');
    try {
        const resp = await axios.get('https://api.music.yandex.net/rotor/stations/dashboard', { headers });
        console.log('Dashboard response structure:', JSON.stringify(resp.data, null, 2).substring(0, 1000));
    } catch (e) {
        console.error('Dashboard failed:', e.message);
    }

    console.log('\nTesting onyourwave...');
    try {
        const resp = await axios.get('https://api.music.yandex.net/rotor/station/user:onyourwave/tracks', { headers });
        console.log('Onyourwave response structure:', JSON.stringify(resp.data, null, 2).substring(0, 1000));
    } catch (e) {
        console.error('Onyourwave failed:', e.message);
    }
}

debugWave();
