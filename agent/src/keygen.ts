// Writes a new private key to the given file (never printed) and prints only its address.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const file = process.argv[2];
if (!file) throw new Error("usage: keygen <file>");
if (existsSync(file)) throw new Error(`${file} exists; refusing to overwrite a key`);
mkdirSync(dirname(file), { recursive: true });
const k = generatePrivateKey();
writeFileSync(file, k, { mode: 0o600 });
console.log(privateKeyToAccount(k).address);
