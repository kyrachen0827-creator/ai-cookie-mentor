/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloud Run 部署用：產出精簡的 standalone 輸出，容器體積小、啟動快
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
