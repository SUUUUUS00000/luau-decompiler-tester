import VM from "@nrbx/luau-vm";

export function compileLuau(source) {
  return VM.compile(source);
}

export function isCompilable(source) {
  try {
    VM.compile(source);
    return true;
  } catch (e) {
    return false;
  }
}
