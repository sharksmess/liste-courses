import type { NextConfig } from "next";
import { parseServerEnv } from "./src/lib/env";

// Refus de demarrer sur un environnement invalide (noms de variables seulement
// dans le message) : `next dev`, `next build` et `next start` chargent ce fichier.
parseServerEnv(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Paquet de l'espace de travail livre en TypeScript (schema Drizzle).
  transpilePackages: ["@lc/db"],
};

export default nextConfig;
