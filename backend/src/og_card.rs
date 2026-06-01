//! Renders a GitHub-style social/Open Graph card (1200×630 PNG) for a protocol.
//!
//! The card SVG is assembled by hand (mirroring the approach in [`crate::ast_to_svg`])
//! and rasterized with `resvg`/`usvg`/`tiny-skia` — a pure-Rust pipeline with no system
//! dependencies. Fonts are baked into the binary via `include_bytes!`, so rendering is
//! deterministic in any container.

use std::fmt::Write as _;
use std::sync::{Arc, OnceLock};

use base64::Engine as _;
use resvg::{tiny_skia, usvg};

const INTER_REGULAR: &[u8] = include_bytes!("../assets/fonts/Inter-Regular.ttf");
const INTER_SEMIBOLD: &[u8] = include_bytes!("../assets/fonts/Inter-SemiBold.ttf");

const WIDTH: f32 = 1200.0;
const HEIGHT: f32 = 630.0;
const MARGIN: f32 = 72.0;
const CONTENT_W: f32 = WIDTH - MARGIN * 2.0;

/// Bump when the card layout changes so cached images refresh even for an
/// unchanged protocol version. Combined with the protocol version in the ETag.
pub const LAYOUT_VERSION: u32 = 1;

const MAX_CHIPS: usize = 6;

// Palette pulled from the frontend theme (`app/app.css`): woodsmoke + primary.
const BG: &str = "#0F0F12"; // woodsmoke-950
const PANEL: &str = "#1C1C22"; // woodsmoke-900
const BORDER: &str = "#2A2A33"; // woodsmoke-800
const ACCENT: &str = "#FF007F"; // primary-600
const TEXT: &str = "#F7F7F8"; // woodsmoke-50
const MUTED: &str = "#A8AAC1"; // woodsmoke-400

/// Everything the card needs about a protocol. Kept decoupled from the GraphQL
/// `Protocol` type so the schema module owns the extraction.
pub struct CardData {
    pub scope: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub tx_names: Vec<String>,
    /// Decoded PNG bytes of the protocol logo, when present.
    pub logo_png: Option<Vec<u8>>,
}

#[derive(Debug)]
pub enum RenderError {
    Parse(usvg::Error),
    Pixmap,
    Encode(String),
}

impl std::fmt::Display for RenderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RenderError::Parse(e) => write!(f, "svg parse error: {e}"),
            RenderError::Pixmap => write!(f, "failed to allocate pixmap"),
            RenderError::Encode(e) => write!(f, "png encode error: {e}"),
        }
    }
}

impl std::error::Error for RenderError {}

/// Render the card to PNG bytes.
pub fn render_card(data: &CardData) -> Result<Vec<u8>, RenderError> {
    let svg = build_card_svg(data);

    let opt = usvg::Options { fontdb: fontdb(), ..Default::default() };

    let tree = usvg::Tree::from_str(&svg, &opt).map_err(RenderError::Parse)?;

    let mut pixmap = tiny_skia::Pixmap::new(WIDTH as u32, HEIGHT as u32).ok_or(RenderError::Pixmap)?;
    resvg::render(&tree, tiny_skia::Transform::identity(), &mut pixmap.as_mut());

    pixmap.encode_png().map_err(|e| RenderError::Encode(e.to_string()))
}

/// Shared, lazily-built font database (Inter Regular + SemiBold).
fn fontdb() -> Arc<usvg::fontdb::Database> {
    static DB: OnceLock<Arc<usvg::fontdb::Database>> = OnceLock::new();
    DB.get_or_init(|| {
        let mut db = usvg::fontdb::Database::new();
        db.load_font_data(INTER_REGULAR.to_vec());
        db.load_font_data(INTER_SEMIBOLD.to_vec());
        Arc::new(db)
    })
    .clone()
}

// MARK: SVG assembly

fn build_card_svg(data: &CardData) -> String {
    let mut s = String::with_capacity(4096);

    let _ = write!(
        s,
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w}" height="{h}" viewBox="0 0 {w} {h}">"#,
        w = WIDTH,
        h = HEIGHT,
    );

    // Background + subtle accent rule along the top.
    let _ = write!(s, r#"<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" fill="{BG}"/>"#);
    let _ = write!(s, r#"<rect x="0" y="0" width="{WIDTH}" height="8" fill="{ACCENT}"/>"#);

    // Header: logo tile with the protocol name on the first line and the
    // scope + version on the second line beside it.
    let logo_size = 120.0;
    let header_y = 80.0;
    emit_logo(&mut s, MARGIN, header_y, logo_size, data);

    let title_x = MARGIN + logo_size + 32.0;
    let title_w = CONTENT_W - logo_size - 32.0;

    let name = truncate_to_width(&data.name, title_w, 58.0, true);
    let _ = write!(
        s,
        r#"<text x="{title_x}" y="152" font-family="Inter" font-weight="600" font-size="58" fill="{TEXT}">{t}</text>"#,
        t = escape(&name),
    );

    let version = data.version.trim().trim_start_matches('v');
    let subtitle = if version.is_empty() {
        data.scope.clone()
    } else {
        format!("{}  ·  v{}", data.scope, version)
    };
    let _ = write!(
        s,
        r#"<text x="{title_x}" y="200" font-family="Inter" font-weight="400" font-size="30" fill="{MUTED}">{t}</text>"#,
        t = escape(&truncate_to_width(&subtitle, title_w, 30.0, false)),
    );

    // Description, wrapped to at most two lines.
    if let Some(desc) = data.description.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
        let lines = wrap_to_lines(desc, CONTENT_W, 34.0, 2);
        let mut dy = 300.0;
        for line in lines {
            let _ = write!(
                s,
                r#"<text x="{MARGIN}" y="{dy}" font-family="Inter" font-weight="400" font-size="34" fill="{MUTED}">{t}</text>"#,
                t = escape(&line),
            );
            dy += 46.0;
        }
    }

    // Transaction chips.
    emit_tx_chips(&mut s, &data.tx_names);

    s.push_str("</svg>");
    s
}

/// Logo tile: the protocol's PNG when available, otherwise a monogram fallback.
fn emit_logo(s: &mut String, x: f32, y: f32, size: f32, data: &CardData) {
    let r = 20.0;
    let clip_id = "logoClip";
    let _ = write!(
        s,
        r#"<clipPath id="{clip_id}"><rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r}" ry="{r}"/></clipPath>"#,
    );

    if let Some(png) = data.logo_png.as_deref().filter(|b| !b.is_empty()) {
        let b64 = base64::engine::general_purpose::STANDARD.encode(png);
        let _ = write!(
            s,
            r#"<image x="{x}" y="{y}" width="{size}" height="{size}" clip-path="url(#{clip_id})" preserveAspectRatio="xMidYMid slice" xlink:href="data:image/png;base64,{b64}"/>"#,
        );
    } else {
        // Monogram fallback: accent tile with the first letter of the name.
        let letter = data
            .name
            .chars()
            .find(|c| c.is_alphanumeric())
            .map(|c| c.to_uppercase().to_string())
            .unwrap_or_else(|| "?".to_string());
        let _ = write!(
            s,
            r#"<rect x="{x}" y="{y}" width="{size}" height="{size}" rx="{r}" ry="{r}" fill="{PANEL}" stroke="{BORDER}" stroke-width="2"/>"#,
        );
        let _ = write!(
            s,
            r#"<text x="{cx}" y="{cy}" font-family="Inter" font-weight="600" font-size="52" fill="{ACCENT}" text-anchor="middle">{l}</text>"#,
            cx = x + size / 2.0,
            cy = y + size / 2.0 + 18.0,
            l = escape(&letter),
        );
    }
}

/// Lay out up to [`MAX_CHIPS`] transaction-name chips across two rows, with a
/// trailing `+N more` chip when the list overflows. All chips share one style.
fn emit_tx_chips(s: &mut String, tx_names: &[String]) {
    if tx_names.is_empty() {
        return;
    }

    let font = 26.0;
    let pad_x = 22.0;
    let chip_h = 52.0;
    let gap = 16.0;
    let row_gap = 18.0;
    let top = 430.0;
    let max_rows = 2;

    let shown = tx_names.len().min(MAX_CHIPS);
    let overflow = tx_names.len() - shown;

    let mut labels: Vec<String> = tx_names
        .iter()
        .take(shown)
        .map(|n| truncate_to_width(n, 320.0, font, false))
        .collect();
    if overflow > 0 {
        labels.push(format!("+{overflow} more"));
    }

    let mut x = MARGIN;
    let mut row = 0usize;
    let mut y = top;

    for label in &labels {
        let w = text_width(label, font, false) + pad_x * 2.0;
        if x + w > MARGIN + CONTENT_W && x > MARGIN {
            row += 1;
            if row >= max_rows {
                break;
            }
            x = MARGIN;
            y += chip_h + row_gap;
        }
        let _ = write!(
            s,
            r#"<rect x="{x}" y="{y}" width="{w}" height="{chip_h}" rx="14" ry="14" fill="{PANEL}" stroke="{BORDER}" stroke-width="2"/>"#,
        );
        let _ = write!(
            s,
            r#"<text x="{tx}" y="{ty}" font-family="Inter" font-weight="400" font-size="{font}" fill="{TEXT}">{t}</text>"#,
            tx = x + pad_x,
            ty = y + chip_h / 2.0 + font / 3.0,
            t = escape(label),
        );
        x += w + gap;
    }
}

// MARK: text helpers

/// Escape text for inclusion in an SVG text node / attribute.
fn escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Approximate the advance width of `text` at `font_size`. SVG has no layout
/// engine we can query before rasterizing, so we estimate from per-glyph factors
/// tuned for Inter. `bold` widens the estimate slightly.
fn text_width(text: &str, font_size: f32, bold: bool) -> f32 {
    let mut units = 0.0f32;
    for c in text.chars() {
        units += match c {
            'i' | 'l' | 'j' | 'I' | '.' | ',' | '\'' | '|' | '!' | ':' | ';' | '(' | ')' | '[' | ']' => 0.30,
            'f' | 't' | 'r' | ' ' => 0.34,
            'm' | 'M' | 'w' | 'W' => 0.88,
            'A'..='Z' => 0.68,
            _ => 0.54,
        };
    }
    units * font_size * if bold { 1.04 } else { 1.0 }
}

/// Truncate `text` so it fits within `max_w` at `font_size`, appending an
/// ellipsis when clipped.
fn truncate_to_width(text: &str, max_w: f32, font_size: f32, bold: bool) -> String {
    if text_width(text, font_size, bold) <= max_w {
        return text.to_string();
    }
    let ellipsis = "…";
    let ell_w = text_width(ellipsis, font_size, bold);
    let mut out = String::new();
    for c in text.chars() {
        let mut probe = out.clone();
        probe.push(c);
        if text_width(&probe, font_size, bold) + ell_w > max_w {
            break;
        }
        out.push(c);
    }
    let out = out.trim_end().to_string();
    format!("{out}{ellipsis}")
}

/// Greedily word-wrap `text` into at most `max_lines` lines fitting `max_w`,
/// ellipsizing the final line when content remains.
fn wrap_to_lines(text: &str, max_w: f32, font_size: f32, max_lines: usize) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut words = text.split_whitespace().peekable();

    while let Some(word) = words.next() {
        let candidate = if current.is_empty() {
            word.to_string()
        } else {
            format!("{current} {word}")
        };

        if text_width(&candidate, font_size, false) <= max_w {
            current = candidate;
        } else {
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
            }
            // The lone word itself may overflow; let truncation handle it later.
            current = word.to_string();
        }

        if lines.len() == max_lines - 1 && words.peek().is_some() {
            // Last allowed line — pack the rest in and ellipsize.
            let mut rest = current.clone();
            for w in words.by_ref() {
                rest.push(' ');
                rest.push_str(w);
            }
            lines.push(truncate_to_width(&rest, max_w, font_size, false));
            return lines;
        }
    }

    if !current.is_empty() {
        lines.push(truncate_to_width(&current, max_w, font_size, false));
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(tx_count: usize) -> CardData {
        CardData {
            scope: "txpipe".into(),
            name: "Vesting Faucet".into(),
            version: "1.2.0".into(),
            description: Some(
                "A machine-readable spec for a token vesting and faucet protocol. \
                 Generate typed clients in TypeScript, Rust, Go, or Python from a single source."
                    .into(),
            ),
            tx_names: (0..tx_count).map(|i| format!("transaction_{i}")).collect(),
            logo_png: None,
        }
    }

    #[test]
    fn renders_valid_png() {
        let png = render_card(&sample(9)).expect("render");
        assert!(png.len() > 1000, "png suspiciously small: {}", png.len());
        // PNG magic bytes.
        assert_eq!(&png[..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        // Dump for manual inspection when TX3_OG_DUMP is set.
        if std::env::var("TX3_OG_DUMP").is_ok() {
            std::fs::write("/tmp/og_card_sample.png", &png).unwrap();
            std::fs::write("/tmp/og_card_no_logo.svg", build_card_svg(&sample(9))).unwrap();
        }
    }

    #[test]
    fn renders_without_description_or_txs() {
        let mut data = sample(0);
        data.description = None;
        let png = render_card(&data).expect("render minimal");
        assert!(png.len() > 1000);
    }

    #[test]
    fn wraps_and_truncates_description() {
        let lines = wrap_to_lines(
            "one two three four five six seven eight nine ten eleven twelve thirteen fourteen",
            400.0,
            32.0,
            2,
        );
        assert!(lines.len() <= 2);
        assert!(lines.last().unwrap().ends_with('…'));
    }
}
