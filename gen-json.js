const fs = require('fs');
const path = require('path');

const version = "1.1.1";
const sigPath = path.join('src-tauri', 'target', 'release', 'bundle', 'msi', 'RE-Music_1.1.1_x64_en-US.msi.sig');
// Get the decoded ASCII armor string
const sigBase64 = fs.readFileSync(sigPath, 'utf8').trim();
const sigContent = Buffer.from(sigBase64, 'base64').toString('utf8').trim();

const platformDefault = {
    signature: sigContent,
    url: `https://github.com/RE-Music/Re-Music/releases/download/v${version}/RE-Music_${version}_x64_en-US.msi`
};

const updateJson = {
    version: version,
    notes: `Release v${version}: Fix Yandex/YouTube Auth, optimized startup and UI stability.`,
    pub_date: new Date().toISOString(),
    platforms: {
        "windows-x86_64": platformDefault,
        "windows-x86_64-msi": platformDefault,
        "windows-x64": platformDefault,
        "windows-x64-msi": platformDefault
    }
};

fs.writeFileSync('update.json', JSON.stringify(updateJson, null, 2));
console.log('Successfully generated RAW ASCII ARMOR update.json');
