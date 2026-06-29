function readArg(name, shortName = "") {
  const candidates = shortName ? [name, shortName] : [name];
  for (const candidate of candidates) {
    const index = process.argv.indexOf(candidate);
    if (index !== -1) return process.argv[index + 1] || "";
  }
  return "";
}

const username = readArg("--username", "-u");
const password = readArg("--password", "-p");
const siteUrl = readArg("--site-url") || process.env.PSM_SITE_URL || "http://localhost:8888";
const adminToken = readArg("--admin-token") || process.env.PSM_ADMIN_TOKEN || process.env.ADMIN_TOKEN || "";
const force = process.argv.includes("--force");

if (String(username).trim().length < 2) {
  console.error("Pseudo invalide. Exemple: npm run add-user -- --username playSURE --password MonPassword123 --site-url https://ton-site.netlify.app --admin-token XXX");
  process.exit(1);
}

if (String(password).length < 6) {
  console.error("Password invalide: minimum 6 caractères.");
  process.exit(1);
}

if (!adminToken) {
  console.error("ADMIN_TOKEN absent. Passe --admin-token XXX ou définis PSM_ADMIN_TOKEN.");
  process.exit(1);
}

const endpoint = new URL("/.netlify/functions/admin-user", siteUrl.replace(/\/+$/, ""));

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-admin-token": adminToken
  },
  body: JSON.stringify({ username, password, force })
});

const text = await response.text();
let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = text;
}

if (!response.ok) {
  const message = payload && typeof payload === "object" && "error" in payload ? payload.error : text || response.statusText;
  console.error(`Erreur création utilisateur: ${message}`);
  process.exit(1);
}

console.log(payload.created ? "Utilisateur créé." : "Utilisateur mis à jour.");
console.log(`Blob user: ${payload.blobs.sessionUser}`);
console.log(`Blob stats: ${payload.blobs.statsUser}`);
