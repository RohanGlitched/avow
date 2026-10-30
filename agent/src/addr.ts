// Prints the address of a key file (never the key).
import { readFileSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
console.log(privateKeyToAccount(readFileSync(process.argv[2], "utf8").trim() as `0x${string}`).address);
