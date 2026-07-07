// Camera barcode scanning via vendored ZXing UMD (global ZXing).
let reader = null;

export async function startScan(video, onCode) {
  if (!window.ZXing) throw new Error('Scanner library not loaded.');
  reader = new ZXing.BrowserMultiFormatReader();
  const devices = await reader.listVideoInputDevices();
  const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices.at(-1);
  await reader.decodeFromVideoDevice(back?.deviceId ?? null, video, (result) => {
    if (result) onCode(result.getText());
  });
}

export function stopScan() {
  reader?.reset();
  reader = null;
}
