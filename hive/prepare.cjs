"use strict";
const { execFileSync } = require("node:child_process");
const { dirname, join, resolve } = require("node:path");
const { readFileSync, writeFileSync } = require("node:fs");
const root = resolve(__dirname, "..");
const cli = join(dirname(require.resolve("bare-stow/package")), "bin.js");
for (const args of [
  [
    "pack",
    "--target",
    "react-native",
    "--out",
    "hive/generated",
    "hive/worker.cjs",
  ],
  [
    "link",
    "--target",
    "bare-kit",
    "--language",
    "kotlin",
    "--language-option",
    "package=com.harleytg.pupconnect.hive",
    "--out",
    "android/hive-resources",
    "hive/worker.cjs",
  ],
])
  execFileSync(process.execPath, [cli, ...args], {
    cwd: root,
    stdio: "inherit",
  });
// Pin the published Bare Kit artifact; don't let builds silently pick a new native runtime.
const resources = join(root, "android/hive-resources/build.gradle");
writeFileSync(
  resources,
  readFileSync(resources, "utf8").replace("v0.2.+", "v0.2.6")
);
// react-native-bare-kit 0.17.1 ships compileSdk 34 and the old React Maven alias.
// Keep its native source unchanged while aligning Gradle metadata with this RN app.
const gradle = join(
  dirname(require.resolve("react-native-bare-kit/package.json")),
  "android/build.gradle"
);
writeFileSync(
  gradle,
  readFileSync(gradle, "utf8")
    .replace('    classpath "com.android.tools.build:gradle:+"', "")
    .replace("compileSdk 34", "compileSdk rootProject.ext.compileSdkVersion")
    .replace(
      'implementation "com.facebook.react:react-native:+"',
      'implementation "com.facebook.react:react-android"'
    )
);
