import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareTextFile(filename: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.write(content);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: `Share ${filename}`,
  });
}
