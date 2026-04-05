const fs = require('fs');
const path = require('path');

const version = "1.1.2";
const sigPath = path.join('src-tauri', 'target', 'release', 'bundle', 'msi', `RE-Music_${version}_x64_en-US.msi.sig`);

if (!fs.existsSync(sigPath)) {
    console.error('Signature file not found. build first.');
    process.exit(1);
}

// Get the FULL ASCII block (Base64 of the entire armored block)
const sigBase64Decoded = fs.readFileSync(sigPath, 'utf8').trim();
const block = Buffer.from(sigBase64Decoded, 'base64').toString('utf8').trim();

const platformDefault = {
    signature: block,
    url: `https://github.com/RE-Music/Re-Music/releases/download/v${version}/RE-Music_${version}_x64_en-US.msi`
};

const updateJson = {
    version: version,
    notes: `Release v${version}: Fixed YouTube auth window (premature closure) + updater signature verification.`,
    pub_date: new Date().toISOString(),
    platforms: {
        "windows-x86_64": platformDefault,
        "windows-x86_64-msi": platformDefault,
        "windows-x64": platformDefault,
        "windows-x64-msi": platformDefault
    }
};

fs.writeFileSync('update.json', JSON.stringify(updateJson, null, 2));
console.log(`Successfully generated v${version} update.json with FULL BLOCK signature.`);
console.log('Signature preview: ' + block.substring(0, 50) + '...');
