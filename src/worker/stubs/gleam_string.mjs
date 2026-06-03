import { List } from "./gleam.mjs";

export function split(str, delimiter) {
  const parts = str.split(delimiter);
  return List.fromArray(parts);
}

export function trim(str) {
  return str.trim();
}
