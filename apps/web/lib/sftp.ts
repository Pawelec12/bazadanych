export interface PolledFile {
  fileName: string;
  buffer: Buffer;
}

export async function pollSftpFiles(): Promise<PolledFile[]> {
  const host = process.env.SFTP_HOST;
  const user = process.env.SFTP_USER;
  const password = process.env.SFTP_PASS;
  const remotePath = process.env.SFTP_PATH ?? "/incoming";

  if (!host || !user || !password) {
    return [];
  }

  const SftpClient = (await import("ssh2-sftp-client")).default;
  const client = new SftpClient();

  try {
    await client.connect({ host, username: user, password });
    const fileList = await client.list(remotePath);
    const files: PolledFile[] = [];

    for (const entry of fileList) {
      if (entry.type !== "-") continue;
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xml")) {
        continue;
      }

      const remoteFile = `${remotePath}/${entry.name}`;
      const buffer = (await client.get(remoteFile)) as Buffer;
      files.push({ fileName: entry.name, buffer });
    }

    return files;
  } finally {
    await client.end();
  }
}
