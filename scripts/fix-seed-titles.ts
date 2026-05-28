import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const filePath = join(import.meta.dir, "data/resources.ts");
const content = readFileSync(filePath, "utf-8");

let count = 0;
const fixed = content.replace(
  /(title:\s*")([^"]+)\.(pdf|jpg|jpeg|png)(")/gi,
  (_, prefix, name, _ext, suffix) => {
    count++;
    return `${prefix}${name}${suffix}`;
  }
);

writeFileSync(filePath, fixed, "utf-8");
console.log(`✓ ${count} títulos actualizados en scripts/data/resources.ts`);
