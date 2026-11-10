import { luau_compile } from "luau-web";

function toBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Buffer.from(bytes).toString("base64");
}

export function compileLuau(source) {
  const [success, result] = luau_compile(source);
  if (!success) {
    throw new Error(typeof result === "string" ? result : "Luau compilation failed");
  }
  return toBase64(result.buffer);
}

export function isCompilable(source) {
  try {
    const [success] = luau_compile(source);
    return !!success;
  } catch (e) {
    return false;
  }
}
