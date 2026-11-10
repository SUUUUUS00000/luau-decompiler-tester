import luau_compile from "luau-web";

export function compileLuau(source) {
  const [success, result] = luau_compile(source);
  if (!success) {
    throw new Error(result || "Luau compilation failed");
  }
  return Buffer.from(result.buffer).toString("base64");
}

export function isCompilable(source) {
  try {
    const [success] = luau_compile(source);
    return success;
  } catch (e) {
    return false;
  }
}
