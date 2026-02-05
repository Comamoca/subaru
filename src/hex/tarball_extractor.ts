/**
 * Hex.pm tarball extractor
 *
 * Hex tarballs have a nested structure:
 * - Outer tar containing: VERSION, metadata.config, contents.tar.gz
 * - contents.tar.gz contains the actual package files including src/ directory
 */

import { UntarStream } from "jsr:@std/tar@0.1/untar-stream";

export interface ExtractedFile {
  path: string;
  content: string;
  isFFI?: boolean; // True if this is a JavaScript FFI file
}

export interface ExtractResult {
  files: ExtractedFile[];
  metadata?: Record<string, unknown>;
}

/**
 * Read all bytes from a ReadableStream
 */
async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Decompress gzip data using DecompressionStream
 */
async function decompressGzip(compressedData: Uint8Array): Promise<Uint8Array> {
  // Create a stream from the data
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(compressedData);
      controller.close();
    },
  });

  const decompressedStream = inputStream.pipeThrough(new DecompressionStream("gzip"));
  return await readAllBytes(decompressedStream);
}

/**
 * Extract files from a tar archive
 */
async function extractTar(
  tarData: Uint8Array,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(tarData);
      controller.close();
    },
  });

  const untarStream = stream.pipeThrough(new UntarStream());
  const reader = untarStream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const entry = value;
    if (entry.header.typeflag === "file" || entry.header.typeflag === "0") {
      if (entry.readable) {
        const content = await readAllBytes(entry.readable);
        files.set(entry.header.name, content);
      }
    } else {
      // Consume the stream for non-file entries
      await entry.readable?.cancel();
    }
  }

  return files;
}

/**
 * Extract Gleam source files from a Hex.pm tarball
 *
 * @param tarballData - The raw tarball data from Hex.pm
 * @returns Extracted Gleam source files
 */
export async function extractHexTarball(tarballData: Uint8Array): Promise<ExtractResult> {
  const result: ExtractResult = {
    files: [],
  };

  // Step 1: Extract outer tar
  const outerFiles = await extractTar(tarballData);

  // Step 2: Find and extract contents.tar.gz
  const contentsTarGz = outerFiles.get("contents.tar.gz");
  if (!contentsTarGz) {
    throw new Error("contents.tar.gz not found in Hex tarball");
  }

  // Step 3: Decompress contents.tar.gz
  const contentsTar = await decompressGzip(contentsTarGz);

  // Step 4: Extract contents tar
  const contentsFiles = await extractTar(contentsTar);

  // Step 5: Filter and collect Gleam source files and FFI JavaScript files
  const textDecoder = new TextDecoder();

  for (const [path, content] of contentsFiles) {
    // Include .gleam files and JavaScript FFI files (.mjs, .js) from src/ directory
    if (path.startsWith("src/")) {
      const isGleam = path.endsWith(".gleam");
      const isFFI = path.endsWith(".mjs") || path.endsWith(".js");

      if (isGleam || isFFI) {
        result.files.push({
          path: path,
          content: textDecoder.decode(content),
          isFFI: isFFI,
        });
      }
    }
  }

  // Optionally parse metadata.config if present
  const metadataConfig = outerFiles.get("metadata.config");
  if (metadataConfig) {
    try {
      // Hex metadata is in Erlang term format, but we'll skip parsing for now
      // Could be added later if needed
    } catch {
      // Ignore metadata parsing errors
    }
  }

  return result;
}

/**
 * Get module name from file path
 *
 * Examples:
 * - "src/gleam/io.gleam" -> "gleam/io"
 * - "src/dinostore.gleam" -> "dinostore"
 */
export function getModuleNameFromPath(filePath: string): string {
  return filePath
    .replace(/^src\//, "") // Remove src/ prefix
    .replace(/\.gleam$/, ""); // Remove .gleam extension
}
