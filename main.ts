#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import Parser from "rss-parser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".config", "resume-news-mcp");
mkdirSync(CONFIG_DIR, { recursive: true });
const SOURCES_FILE = join(CONFIG_DIR, "sources.json");

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface NewsSource {
  name: string;
  rssUrl: string;
  addedAt: string;
}

// ─── Persistencia ────────────────────────────────────────────────────────────

function loadSources(): NewsSource[] {
  if (!existsSync(SOURCES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SOURCES_FILE, "utf-8")) as NewsSource[];
  } catch {
    return [];
  }
}

function saveSources(sources: NewsSource[]): void {
  writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2), "utf-8");
}

// ─── Servidor MCP ────────────────────────────────────────────────────────────

const rssParser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "resume-news-mcp/1.0.0" },
});

const server = new McpServer({
  name: "resume_news",
  version: "1.0.0",
});

// ─── Herramienta: Añadir fuente ───────────────────────────────────────────────

server.registerTool(
  "add_news_source",
  {
    description:
      "Añade un diario o fuente de noticias usando su URL de RSS. Permite personalizar de qué medios se quieren obtener noticias.",
    inputSchema: {
      name: z
        .string()
        .describe(
          "Nombre del diario o medio (ej: 'El País', 'BBC News', 'The Guardian')"
        ),
      rss_url: z
        .string()
        .url()
        .describe(
          "URL del feed RSS del medio (ej: https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada)"
        ),
    },
  },
  async ({ name, rss_url }) => {
    const sources = loadSources();

    const alreadyExists = sources.some(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );
    if (alreadyExists) {
      return {
        content: [
          {
            type: "text",
            text: `⚠️ El medio "${name}" ya está en la lista. Usa remove_news_source para eliminarlo primero si quieres cambiarlo.`,
          },
        ],
      };
    }

    // Validar que el RSS es accesible antes de guardar
    try {
      await rssParser.parseURL(rss_url);
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `❌ No se pudo acceder al RSS de "${name}". Verifica que la URL sea correcta: ${rss_url}`,
          },
        ],
      };
    }

    sources.push({ name, rssUrl: rss_url, addedAt: new Date().toISOString() });
    saveSources(sources);

    return {
      content: [
        {
          type: "text",
          text: `✅ Fuente "${name}" añadida correctamente.\nRSS: ${rss_url}\nTotal de fuentes configuradas: ${sources.length}`,
        },
      ],
    };
  }
);

// ─── Herramienta: Eliminar fuente ────────────────────────────────────────────

server.registerTool(
  "remove_news_source",
  {
    description:
      "Elimina un diario o fuente de noticias de la lista por su nombre.",
    inputSchema: {
      name: z
        .string()
        .describe("Nombre del medio que quieres eliminar (ej: 'El País')"),
    },
  },
  async ({ name }) => {
    const sources = loadSources();

    const index = sources.findIndex(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );

    if (index === -1) {
      const available =
        sources.length > 0
          ? sources.map((s) => `• ${s.name}`).join("\n")
          : "No hay fuentes configuradas.";
      return {
        content: [
          {
            type: "text",
            text: `❌ No se encontró el medio "${name}".\n\nFuentes disponibles:\n${available}`,
          },
        ],
      };
    }

    const removed = sources.splice(index, 1)[0];
    saveSources(sources);

    return {
      content: [
        {
          type: "text",
          text: `✅ Fuente "${removed.name}" eliminada correctamente.\nFuentes restantes: ${sources.length}`,
        },
      ],
    };
  }
);

// ─── Herramienta: Listar fuentes ─────────────────────────────────────────────

server.registerTool(
  "list_news_sources",
  {
    description:
      "Muestra todos los diarios y fuentes de noticias configurados actualmente.",
    inputSchema: {},
  },
  async () => {
    const sources = loadSources();

    if (sources.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📭 No hay fuentes configuradas todavía.\nUsa add_news_source para añadir diarios.",
          },
        ],
      };
    }

    const list = sources
      .map(
        (s, i) =>
          `${i + 1}. **${s.name}**\n   RSS: ${s.rssUrl}\n   Añadido: ${new Date(s.addedAt).toLocaleDateString("es-ES")}`
      )
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `📰 Fuentes de noticias configuradas (${sources.length}):\n\n${list}`,
        },
      ],
    };
  }
);

// ─── Herramienta: Obtener resumen diario ─────────────────────────────────────

server.registerTool(
  "get_daily_news",
  {
    description:
      "Obtiene el resumen de noticias del día de todas las fuentes configuradas o de las indicadas. Devuelve los titulares y un breve resumen de cada artículo.",
    inputSchema: {
      sources: z
        .array(z.string())
        .optional()
        .describe(
          "Lista de nombres de medios de los que obtener noticias. Si no se indica, se usan todos los configurados."
        ),
      max_articles: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .describe(
          "Número máximo de artículos por fuente (por defecto 5, máximo 20)."
        ),
      only_today: z
        .boolean()
        .optional()
        .describe(
          "Si es true, solo muestra artículos publicados hoy. Por defecto false (muestra los más recientes)."
        ),
    },
  },
  async ({ sources: requestedSources, max_articles = 5, only_today = false }) => {
    const allSources = loadSources();

    if (allSources.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "📭 No hay fuentes configuradas. Añade diarios con add_news_source primero.",
          },
        ],
      };
    }

    // Filtrar por fuentes solicitadas si se indica
    let targetSources = allSources;
    if (requestedSources && requestedSources.length > 0) {
      targetSources = allSources.filter((s) =>
        requestedSources.some(
          (r) => r.toLowerCase() === s.name.toLowerCase()
        )
      );

      if (targetSources.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `❌ No se encontraron las fuentes indicadas: ${requestedSources.join(", ")}\n\nFuentes disponibles: ${allSources.map((s) => s.name).join(", ")}`,
            },
          ],
        };
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sections: string[] = [];
    const errors: string[] = [];

    for (const source of targetSources) {
      try {
        const feed = await rssParser.parseURL(source.rssUrl);

        let items = feed.items;

        // Filtrar por hoy si se solicita
        if (only_today) {
          items = items.filter((item) => {
            if (!item.pubDate && !item.isoDate) return false;
            const pubDate = new Date(item.pubDate ?? item.isoDate ?? "");
            return !isNaN(pubDate.getTime()) && pubDate >= todayStart;
          });
        }

        // Limitar al máximo de artículos
        items = items.slice(0, max_articles);

        if (items.length === 0) {
          sections.push(
            `## 📰 ${source.name}\n_No se encontraron artículos${only_today ? " de hoy" : ""}._`
          );
          continue;
        }

        const articleLines = items.map((item) => {
          const title = item.title ?? "Sin título";
          const summary =
            item.contentSnippet ??
            item.summary ??
            item.content?.replace(/<[^>]+>/g, "").slice(0, 200) ??
            "Sin resumen disponible";
          const date = item.pubDate ?? item.isoDate;
          const dateStr = date
            ? new Date(date).toLocaleDateString("es-ES", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          const link = item.link ? `\n  🔗 ${item.link}` : "";

          return `### ${title}\n${dateStr ? `📅 ${dateStr}  ` : ""}${summary.trim()}${link}`;
        });

        sections.push(`## 📰 ${source.name}\n\n${articleLines.join("\n\n---\n\n")}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        errors.push(`• **${source.name}**: ${message}`);
      }
    }

    const date = new Date().toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let result = `# 🗞️ Resumen de noticias — ${date}\n\n`;

    if (sections.length > 0) {
      result += sections.join("\n\n---\n\n");
    }

    if (errors.length > 0) {
      result += `\n\n---\n\n## ⚠️ Errores al obtener noticias\n${errors.join("\n")}`;
    }

    return {
      content: [{ type: "text", text: result }],
    };
  }
);

// ─── Iniciar servidor ─────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
