import { createSerwistRoute } from "@serwist/turbopack";

// New revision per build: the offline page is precached fresh on each deploy.
const revision = crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "app/sw.ts",
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    useNativeEsbuild: true,
  });
