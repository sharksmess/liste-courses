import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Le globalSetup de l'usine recree et migre la base de test, puis construit
    // et demarre le serveur applicatif sur cette base : aucun serveur a lancer
    // a la main. Le build Next depasse largement un delai de hook ordinaire.
    globalSetup: ["./tests/_factory/global-setup.ts"],
    testTimeout: 20000,
    hookTimeout: 180000,
    // Les tests partagent UNE base Postgres reelle, jamais mockee, et chaque
    // fichier appelle resetDatabase() (TRUNCATE) dans son beforeAll : des
    // fichiers en parallele se videraient la base mutuellement. Les tests d'un
    // meme fichier restent sequentiels.
    fileParallelism: false,
  },
});
