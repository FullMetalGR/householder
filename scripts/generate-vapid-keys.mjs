// scripts/generate-vapid-keys.mjs
// Generates the VAPID key pair in the JWK-pair format the push function
// imports, plus the base64url application server key for the client env.
// Run once per environment: node scripts/generate-vapid-keys.mjs
const pair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);
const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
const raw = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey));

console.log("VAPID_KEYS_JSON (Edge Function secret, single line):");
console.log(JSON.stringify({ publicKey, privateKey }));
console.log("");
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY (Vercel env):");
console.log(raw.toString("base64url"));
