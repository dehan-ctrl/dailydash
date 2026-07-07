// Camera barcode scanning via vendored ZXing UMD (global ZXing).
// Uses facingMode constraints instead of device enumeration: on iOS,
// enumerateDevices() returns blank labels before permission is granted,
// which used to pick the wrong (front/telephoto) camera. High-resolution
// ideals + retail-format hints are needed for EAN-13 to resolve on phones.
let reader = null;

export async function startScan(video, onCode) {
  if (!window.ZXing) throw new Error('Scanner library not loaded.');
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access.');
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
    ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ZXing.BarcodeFormat.CODE_128,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  reader = new ZXing.BrowserMultiFormatReader(hints);
  await reader.decodeFromConstraints({
    audio: false,
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 }, height: { ideal: 1080 },
    },
  }, video, (result) => {
    if (result) onCode(result.getText());
  });
}

export function scanErrorMessage(e) {
  if (e?.name === 'NotAllowedError') {
    return 'Camera permission was denied. Allow camera access for MacroCoach in Settings and try again.';
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
    return 'No usable camera was found on this device.';
  }
  if (e?.name === 'NotReadableError') {
    return 'The camera is in use by another app.';
  }
  return e?.message || 'Camera unavailable.';
}

export function stopScan() {
  reader?.reset();
  reader = null;
}
