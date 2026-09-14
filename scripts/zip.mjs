// 把 dist/ 打成可直接"加载已解压的扩展程序"的 zip，供 GitHub Release 分发。
// 用系统自带的压缩命令，不引依赖。
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { platform } from "node:os";

const OUT = "deepseek-reading-companion.zip";
if (!existsSync("dist")) {
  console.error("dist/ 不存在，先跑 npm run build");
  process.exit(1);
}
if (existsSync(OUT)) rmSync(OUT);

if (platform() === "win32") {
  execFileSync(
    "powershell",
    ["-NoProfile", "-Command", `Compress-Archive -Path dist/* -DestinationPath ${OUT}`],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", `../${OUT}`, "."], { cwd: "dist", stdio: "inherit" });
}
console.log(`\n打包完成：${OUT}`);
