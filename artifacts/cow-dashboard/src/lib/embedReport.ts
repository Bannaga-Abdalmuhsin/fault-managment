/**
 * Power BI report embedding module.
 *
 * Reads configuration from window globals set before the app boots:
 *   window.EMBED_ACCESS_TOKEN
 *   window.EMBED_URL
 *   window.REPORT_ID
 *   window.TOKEN_TYPE  — "Aad" | "Embed" (default: "Embed")
 *
 * Falls back to VITE_ environment variables if window globals are absent.
 */

declare global {
  interface Window {
    EMBED_ACCESS_TOKEN?: string;
    EMBED_URL?: string;
    REPORT_ID?: string;
    TOKEN_TYPE?: string;
    powerbi?: any;
  }
}

/** models.TokenType enum values used by powerbi-client */
const TOKEN_TYPE_AAD = 1;
const TOKEN_TYPE_EMBED = 0;

function getConfig() {
  const accessToken =
    window.EMBED_ACCESS_TOKEN ??
    (import.meta as any).env?.VITE_POWERBI_ACCESS_TOKEN ??
    "";
  const embedUrl =
    window.EMBED_URL ??
    (import.meta as any).env?.VITE_POWERBI_EMBED_URL ??
    "";
  const reportId =
    window.REPORT_ID ??
    (import.meta as any).env?.VITE_POWERBI_REPORT_ID ??
    "";
  const tokenTypeRaw =
    window.TOKEN_TYPE ??
    (import.meta as any).env?.VITE_POWERBI_TOKEN_TYPE ??
    "Embed";

  return { accessToken, embedUrl, reportId, tokenTypeRaw };
}

/**
 * Embeds a Power BI report into the element with id="embedContainer".
 * Resolves after both "loaded" and "rendered" events fire.
 * Rejects with the full error detail on any embedding error.
 */
export async function embedReport(): Promise<void> {
  const container = document.getElementById("embedContainer");
  if (!container) {
    console.error("[PowerBI] embedContainer element not found in DOM");
    return;
  }

  const pbi = window.powerbi;
  if (!pbi) {
    console.error("[PowerBI] powerbi-client library not loaded (window.powerbi is undefined)");
    return;
  }

  const { accessToken, embedUrl, reportId, tokenTypeRaw } = getConfig();

  if (!accessToken || !embedUrl || !reportId) {
    console.warn(
      "[PowerBI] Missing configuration — set window.EMBED_ACCESS_TOKEN, " +
        "window.EMBED_URL and window.REPORT_ID before calling embedReport()."
    );
    return;
  }

  const tokenType = tokenTypeRaw === "Aad" ? TOKEN_TYPE_AAD : TOKEN_TYPE_EMBED;

  const embedConfig = {
    type: "report",
    id: reportId,
    embedUrl,
    accessToken,
    tokenType,
    settings: {
      panes: {
        filters: { visible: false },
        pageNavigation: { visible: true },
      },
      background: 0, // models.BackgroundType.Transparent
    },
  };

  let report: any;

  try {
    report = pbi.embed(container, embedConfig);
  } catch (err) {
    console.error("[PowerBI] pbi.embed() threw an error:", err);
    throw err;
  }

  // Wait for "loaded"
  await new Promise<void>((resolve, reject) => {
    report.on("loaded", () => {
      console.log("Report loaded");
      resolve();
    });
    report.on("error", (event: any) => {
      const detail = event?.detail ?? event;
      console.error("[PowerBI] Error during load:", detail);
      reject(detail);
    });
  });

  // Wait for "rendered"
  await new Promise<void>((resolve, reject) => {
    report.on("rendered", () => {
      console.log("Report rendered");
      // Placeholder: add filter/interaction logic here
      // Example: await report.setFilters([...]);
      resolve();
    });
    report.on("error", (event: any) => {
      const detail = event?.detail ?? event;
      console.error("[PowerBI] Error during render:", detail);
      reject(detail);
    });
  });
}
