const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

let cache = null;
let writeQueue = Promise.resolve();

function load() {
  if (!cache) {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    cache = JSON.parse(raw);
  }
  return cache;
}

function save() {
  const data = JSON.stringify(cache, null, 2);
  // Sérialise les écritures pour éviter les corruptions en cas d'accès concurrent
  writeQueue = writeQueue.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_PATH, data, "utf8", (err) => (err ? reject(err) : resolve()));
      })
  );
  return writeQueue;
}

module.exports = { load, save };
