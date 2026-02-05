import simplifile
import gleam/io

const filepath = "./remote_example.gleam"

pub fn main() {
  let assert Ok(result) = simplifile.read(from: filepath)

  io.println(result) 
}
