// Build-time data access. The pipeline writes these files; the site reads them once at build.
import fs from "node:fs";
import path from "node:path";
import type { CompanyDoc, Meta } from "./types";

const DATA = path.join(process.cwd(), "public", "data");

export function getMeta(): Meta {
  return JSON.parse(fs.readFileSync(path.join(DATA, "meta.json"), "utf8"));
}

export function getCompany(slug: string): CompanyDoc {
  return JSON.parse(fs.readFileSync(path.join(DATA, "companies", `${slug}.json`), "utf8"));
}

export function getSql(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), "..", "sql", "analysis", file), "utf8");
}
