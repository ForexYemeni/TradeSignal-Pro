'use client';

/**
 * Haptic feedback utility — vibration patterns for mobile devices.
 * Call haptic() after important actions (signal, TP hit, SL hit, success, error).
 * Falls back silently on desktop or unsupported browsers.
 */
export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'tap') {
  try {
    if (!('vibrate' in navigator)) return;
    switch (type) {
      case 'light':
        navigator.vibrate(8);
        break;
      case 'medium':
        navigator.vibrate(18);
        break;
      case 'heavy':
        navigator.vibrate(35);
        break;
      case 'success':
        navigator.vibrate([10, 50, 10]); // double tap
        break;
      case 'error':
        navigator.vibrate([50, 30, 50, 30, 50]); // triple buzz
        break;
      case 'tap':
        navigator.vibrate(5);
        break;
    }
  } catch {
    // Not supported
  }
}
