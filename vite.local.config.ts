// Configuração usada SÓ pela versão local (npm run dev:local).
// O app online continua usando vite.config.ts, sem nenhuma mudança.
//
// Diferença: aqui o endereço e a chave do Supabase vêm do arquivo .env,
// para a cópia local usar um banco de dados próprio, separado do Residuum online.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const env = loadEnv("development", process.cwd(), "");
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key || key.includes("COLE_AQUI")) {
  throw new Error(
    "Versão local: preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env (veja COMO-RODAR-NO-COMPUTADOR.md).",
  );
}
if (url.includes("guhvptbgtezsoyndcwbc")) {
  throw new Error(
    "Versão local: o .env aponta para o banco do Residuum online. Use o endereço do seu projeto Supabase de testes.",
  );
}

export default defineConfig({
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
