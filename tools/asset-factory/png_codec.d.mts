export interface DecodedPngImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export function decodePngFile(filePath: string): DecodedPngImage;
export function encodePngFile(
  filePath: string,
  width: number,
  height: number,
  rgbaData: Uint8Array
): void;
