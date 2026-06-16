import fs from "node:fs";
import path from "node:path";

const workerIndex = path.join(".vercel/output/static/_worker.js/index.js");
const broken =
  '"/":{type:"override",path:"/favicon.ico",headers:{"content-type":"image/x-icon"}}';
const fixed =
  '"/":{type:"function",entrypoint:"__next-on-pages-dist__/functions/index.func.js"}';

if (!fs.existsSync(workerIndex)) {
  console.error(`Missing worker bundle: ${workerIndex}`);
  process.exit(1);
}

let content = fs.readFileSync(workerIndex, "utf8");

if (content.includes(fixed)) {
  console.log("Pages root route already fixed.");
  process.exit(0);
}

if (!content.includes(broken)) {
  console.error("Could not find broken / -> favicon.ico route mapping to patch.");
  process.exit(1);
}

content = content.replace(broken, fixed);
fs.writeFileSync(workerIndex, content);
console.log("Fixed Cloudflare Pages root route (/ now uses index.func.js).");
