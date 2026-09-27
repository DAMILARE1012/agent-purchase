import QRCode from "qrcode";

// QR codes are always dark on white, whatever the page theme, so any camera can read them.
const QR_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  margin: 1,
  color: { dark: "#161a26", light: "#ffffff" },
};

export function qrSvg(value: string): Promise<string> {
  return QRCode.toString(value, { ...QR_OPTIONS, type: "svg" });
}

export async function qrCanvas(value: string, width: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, value, { ...QR_OPTIONS, width });
  return canvas;
}
