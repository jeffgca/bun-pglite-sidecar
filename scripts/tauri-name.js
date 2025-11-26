import { execSync } from "child_process";

const BUILD_NAME = "sidecar";
const rustInfo = execSync("rustc -vV");
const targetTriple = /host: (\S+)/g.exec(rustInfo)[1];

console.log(`${BUILD_NAME}-${targetTriple}`);
