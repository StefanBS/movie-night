import React from "react";

/**
 * Poster — TMDB image when `uri` is given; otherwise a hue-per-title tile.
 * At h >= 104 the fallback shows the title in Newsreader (upright, medium).
 */
export function Poster({ uri, title = "—", year, hue = 30, w = 56, h = 84, style }) {
  const [failed, setFailed] = React.useState(false);
  const showImage = !!uri && !failed;
  return (
    <div style={{ position: "relative", width: w, height: h, flex: "none", borderRadius: "var(--radius-sm)", overflow: "hidden", background: "linear-gradient(160deg, hsl(" + hue + " 30% 26%), hsl(" + hue + " 34% 12%))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)", ...style }}>
      {showImage ? (
        <img src={uri} alt={title} onError={() => setFailed(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : h >= 104 ? (
        <div style={{ position: "absolute", left: 10, right: 10, bottom: 10 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontWeight: 500, fontSize: 16, lineHeight: 1.1, color: "#EDE8E0" }}>{title}</div>
          {year ? <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "rgba(237,232,224,0.6)", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{year}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
