/** Runs once after the user completes delivery/pickup setup in the order modal. */
type PostSetupAction = () => void;

let pending: PostSetupAction | null = null;

export function deferUntilOrderSetup(action: PostSetupAction) {
  pending = action;
}

export function clearDeferredOrderSetup() {
  pending = null;
}

export function runDeferredOrderSetupAction() {
  const action = pending;
  pending = null;
  action?.();
}
