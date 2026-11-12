/** Static export: the whole site is plain files, served by Firebase Hosting. */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
