import gleam/io

pub fn main() {
  io.println("Hello from remote Gleam script!")
  io.println("This script was fetched and executed via URL")
  io.println("Just like 'deno run' but for Gleam!")
}