const fs = require('fs');
const path = require('path');

function searchFiles(dir, filterRegex) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            searchFiles(fullPath, filterRegex);
        } else if (fullPath.endsWith('.cs')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (filterRegex.test(lines[i])) {
                    console.log(`\n// File: ${file} (Line ${i+1})`);
                    console.log(lines.slice(Math.max(0, i-2), i+3).join('\n'));
                }
            }
        }
    }
}

searchFiles(process.env.TEMP + '/MyLikesDownloader', /(api|soundcloud|client_id|auth|token|like|favorite)/i);
