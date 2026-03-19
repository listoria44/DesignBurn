import fs from 'fs';
fs.writeFileSync('env-dump.json', JSON.stringify(process.env, null, 2));
console.log("Dumped env to env-dump.json");
