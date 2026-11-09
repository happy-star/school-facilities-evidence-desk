"use strict";

const fs = require("node:fs");

const sentinel = process.env.SENTINEL_PDF_PATH;
if (sentinel) {
  function touches(value) {
    return typeof value === "string" && (value === sentinel || value.includes(sentinel));
  }

  function inspect(args) {
    for (const arg of args) {
      if (touches(arg)) return true;
      if (arg && typeof arg === "object") {
        if (touches(arg.path)) return true;
        if (touches(arg.file)) return true;
      }
    }
    return false;
  }

  function wrap(target, name) {
    const original = target[name];
    if (typeof original !== "function") return;
    target[name] = function patched(...args) {
      if (inspect(args)) {
        process.stderr.write(`SENTINEL_OPENED ${name}\n`);
        process.exit(97);
      }
      return original.apply(this, args);
    };
  }

  for (const name of [
    "open",
    "openSync",
    "readFile",
    "readFileSync",
    "stat",
    "statSync",
    "lstat",
    "lstatSync",
    "access",
    "accessSync",
    "readlink",
    "readlinkSync",
    "createReadStream",
    "readdir",
    "readdirSync",
  ]) {
    wrap(fs, name);
  }

  for (const name of ["open", "readFile", "stat", "lstat", "access", "readlink", "readdir"]) {
    wrap(fs.promises, name);
  }
}
