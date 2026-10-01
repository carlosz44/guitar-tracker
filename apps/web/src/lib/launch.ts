let launched = false;

export function isLaunching() {
  return !launched;
}

export function markLaunched() {
  launched = true;
}

export function resetLaunchForTests() {
  launched = false;
}
