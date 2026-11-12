/**
 * Static export: the whole site is plain files.
 * On GitHub Pages the site lives under /earshot, so the deploy workflow sets PAGES_BASE_PATH.
 */
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath,
};
export default nextConfig;
