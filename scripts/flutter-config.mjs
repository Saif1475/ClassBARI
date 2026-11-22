// Run: npm run flutter:config -- <server address>        e.g.  npm run flutter:config -- http://192.168.0.105:3000
// Writes flutter/config.local.json (never saved in Git) for the Flutter apps: the ClassBARI server's address and the
// two PUBLIC Supabase values from .env.local (the same two the website already sends to every browser).
// Nothing secret is copied, and no value is printed.
import { readFileSync, writeFileSync } from "node:fs";

const api = (process.argv[2] || "http://localhost:3000").replace(/\/+$/, "");
if (!/^https?:\/\/[^\s/]+/.test(api)) throw new Error(`"${api}" is not a web address (it must start with http:// or https://)`);
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .map((line) => line.match(/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL, key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error(".env.local needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
// A secret key must never go into an app: anyone can take an app apart and read what is inside.
if (key.startsWith("sb_secret_") || /service_role/.test(Buffer.from(key.split(".")[1] ?? "", "base64").toString())) throw new Error("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a SECRET key. Put the publishable key there.");
writeFileSync(new URL("../flutter/config.local.json", import.meta.url), JSON.stringify({ API_URL: api, SUPABASE_URL: url, SUPABASE_KEY: key }, null, 2) + "\n");
console.log(`flutter/config.local.json written: server ${api}, Supabase address and publishable key copied (${key.length} characters, not shown)`);
