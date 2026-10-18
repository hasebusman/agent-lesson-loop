// Synthetic retrieval fixtures. These are not real developer corrections or
// evidence that agent coding outcomes improved.
export const mobile = [
  ['login', 'Preserve login layout', 'Keep the existing login screen while fixing auth.', 'redesign'],
  ['signup', 'Preserve signup flow', 'Keep the existing signup steps while fixing validation.', 'rebuild'],
  ['flatlist', 'Keep list virtualization', 'Use the existing virtualized list for long feeds.', 'replace'],
  ['safearea', 'Respect safe area', 'Keep content inside the safe area on notched devices.', 'fullscreen'],
  ['keyboard', 'Preserve keyboard handling', 'Keep form fields visible above the keyboard.', 'remove'],
  ['deeplink', 'Retain deep links', 'Preserve route handling when editing navigation.', 'disable'],
  ['offline', 'Keep offline states', 'Preserve cached data behavior during network changes.', 'online-only'],
  ['haptics', 'Honor reduced feedback', 'Respect the existing haptic preference.', 'always-on'],
  ['animation', 'Avoid motion regression', 'Keep transitions on the UI thread where possible.', 'static'],
  ['accessibility', 'Keep accessible labels', 'Preserve screen reader labels on controls.', 'remove'],
  ['camera', 'Preserve permission prompt', 'Keep camera permission timing tied to user action.', 'autostart'],
  ['upload', 'Keep retry state', 'Preserve queued uploads across temporary failures.', 'discard'],
  ['tabs', 'Keep tab identity', 'Preserve tab routes while changing screen internals.', 'reorganize'],
  ['theme', 'Keep theme preference', 'Respect the saved theme selection.', 'reset'],
  ['localization', 'Keep translated labels', 'Preserve existing translation keys.', 'english-only'],
] as const;

export const oldFacts = ['firebasev1', 'reanimatedv1', 'expov1', 'navigationv1', 'androidv1'] as const;
