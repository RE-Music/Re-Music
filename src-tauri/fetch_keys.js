const fs = require('fs');
fetch('https://raw.githubusercontent.com/LuanRT/YouTube.js/main/src/utils/Constants.ts')
  .then(r => r.text())
  .then(text => {
    fs.writeFileSync('C:\\Users\\User\\Nmis\\src-tauri\\constants.ts', text, 'utf8');
    console.log("File saved to constants.ts");
  })
  .catch(console.error);
