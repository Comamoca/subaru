export function println(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function print(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function print_error(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function console_log(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function console_error(msg) {
  self.postMessage({ type: "output", line: String(msg) });
}

export function debug(value) {
  self.postMessage({ type: "output", line: String(value) });
  return value;
}
