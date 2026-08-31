import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pkb/db", "@pkb/ingest", "@pkb/search", "@pkb/enrich", "@pkb/refresh", "@pkb/jobs"],
  serverExternalPackages: ["ssh2", "ssh2-sftp-client", "cpu-features"],
};

export default nextConfig;
