import { useEffect, useState } from "react";
import { embedReport } from "@/lib/embedReport";

type EmbedState = "idle" | "loading" | "loaded" | "error" | "unconfigured";

const STC_PURPLE = "#6B1FA2";
const STC_GREY_BG = "#F5F0FA";

export default function PowerBIEmbed() {
  const [state, setState] = useState<EmbedState>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    // Check if tokens are configured at all
    const hasConfig =
      window.EMBED_ACCESS_TOKEN ||
      (import.meta as any).env?.VITE_POWERBI_ACCESS_TOKEN;

    if (!hasConfig) {
      setState("unconfigured");
      return;
    }

    setState("loading");
    embedReport()
      .then(() => setState("loaded"))
      .catch((err) => {
        const msg =
          typeof err === "string"
            ? err
            : err?.message ?? JSON.stringify(err) ?? "Unknown error";
        setErrorMsg(msg);
        setState("error");
      });
  }, []);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        border: `1px solid #E5E0EE`,
        overflow: "hidden",
      }}
    >
      {/* Section header */}
      <div
        style={{
          background: STC_PURPLE,
          color: "white",
          fontSize: 9,
          fontWeight: 700,
          padding: "4px 8px",
          letterSpacing: "0.04em",
          flexShrink: 0,
        }}
      >
        Power BI Analytics Report
      </div>

      {/* Relative wrapper so the overlay sits exactly over the embed target */}
      <div style={{ position: "relative", width: "100%", height: 600 }}>

        {/* The actual embed target — always in DOM so powerbi.embed() writes into it */}
        <div
          id="embedContainer"
          style={{ width: "100%", height: "100%", background: STC_GREY_BG }}
        />

        {/* Overlay — shown until the report has loaded */}
        {state !== "loaded" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: STC_GREY_BG,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              zIndex: 2,
            }}
          >
            {state === "loading" && (
              <>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    border: `3px solid ${STC_PURPLE}`,
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
                <span style={{ fontSize: 11, color: STC_PURPLE, fontWeight: 600 }}>
                  Loading Power BI report…
                </span>
              </>
            )}
            {state === "unconfigured" && (
              <span style={{ fontSize: 11, color: "#888", textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                Power BI report not configured.
                <br />
                Set{" "}
                <code style={{ background: "#eee", padding: "1px 4px", borderRadius: 3 }}>
                  window.EMBED_ACCESS_TOKEN
                </code>
                ,{" "}
                <code style={{ background: "#eee", padding: "1px 4px", borderRadius: 3 }}>
                  window.EMBED_URL
                </code>{" "}
                and{" "}
                <code style={{ background: "#eee", padding: "1px 4px", borderRadius: 3 }}>
                  window.REPORT_ID
                </code>{" "}
                before the app loads to enable embedding.
              </span>
            )}
            {state === "error" && (
              <span style={{ fontSize: 11, color: "#D32F2F", textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                Failed to load Power BI report.
                <br />
                <code style={{ fontSize: 9.5, background: "#fdf", padding: "2px 6px", borderRadius: 3 }}>
                  {errorMsg}
                </code>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
