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

// Compatibilite :
// - ADMIN_SECRET prioritaire
// - --admin-secret accepte
// - --admin-token accepte pour rester compatible avec ton add-user.ps1
// - ADMIN_TOKEN / PSM_ADMIN_TOKEN acceptes si encore utilises
const adminSecret =
  readArg("--admin-secret") ||
  readArg("--admin-token") ||
  process.env.ADMIN_SECRET ||
  process.env.ADMIN_TOKEN ||
  process.env.PSM_ADMIN_TOKEN ||
  "";

const force = process.argv.includes("--force");

if (String(username).trim().length < 2) {
  console.error(
    "Pseudo invalide. Exemple: node scripts/add-user.mjs --username playSURE --password MonPassword123 --site-url https://ton-site.netlify.app --admin-secret XXX"
  );
  process.exit(1);
}

if (String(password).length < 6) {
  console.error("Password invalide: minimum 6 caracteres.");
  process.exit(1);
}

if (!adminSecret) {
  console.error("ADMIN_SECRET absent. Passe --admin-secret XXX, --admin-token XXX, ou definis ADMIN_SECRET.");
  process.exit(1);
}

const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
const endpoint = new URL("/.netlify/functions/admin-user", normalizedSiteUrl);

let response;

try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": adminSecret,
      "x-admin-secret": adminSecret
    },
    body: JSON.stringify({
      username,
      password,
      force
    })
  });
} catch (error) {
  console.error(`Erreur reseau vers ${endpoint.href}: ${error.message}`);
  process.exit(1);
}

const text = await response.text();

let payload = null;
try {
  payload = text ? JSON.parse(text) : null;
} catch {
  payload = text;
}

if (!response.ok) {
  const message =
    payload && typeof payload === "object" && "error" in payload
      ? payload.error
      : text || response.statusText;

  console.error(`Erreur creation utilisateur: ${message}`);
  process.exit(1);
}

console.log(payload?.created ? "Utilisateur cree." : "Utilisateur mis a jour.");

if (payload?.blobs?.sessionUser) {
  console.log(`Blob session: ${payload.blobs.sessionUser}`);
}

if (payload?.blobs?.statsUser) {
  console.log(`Blob stats: ${payload.blobs.statsUser}`);
}
