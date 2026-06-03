//! Renders transaction diagrams for a Tx3 protocol to standalone SVG files,
//! mirroring the AST path of the GraphQL `Tx.svg` resolver.
//!
//! Usage: cargo run --example render_svg -- <main.tx3> <out_dir>

use std::path::Path;

use tx3_registry_backend::ast_to_svg;

fn main() {
    let mut args = std::env::args().skip(1);
    let source_path = args.next().expect("usage: render_svg <main.tx3> <out_dir>");
    let out_dir = args.next().expect("usage: render_svg <main.tx3> <out_dir>");

    let source = std::fs::read_to_string(&source_path).expect("read source");
    let ast = tx3_lang::parsing::parse_string(&source).expect("parse tx3");

    std::fs::create_dir_all(&out_dir).expect("create out dir");

    for tx in &ast.txs {
        // The diagram's center box shows the params explicitly declared in the
        // `tx` block — the same set the resolver now passes (env vars and party
        // references are deliberately excluded).
        let param_names: Vec<String> = tx
            .parameters
            .parameters
            .iter()
            .map(|p| p.name.value.clone())
            .collect();

        let svg = ast_to_svg::tx_to_svg(&ast, tx, param_names);

        let out = Path::new(&out_dir).join(format!("{}.svg", tx.name.value));
        std::fs::write(&out, &svg).expect("write svg");
        println!("wrote {}", out.display());
    }
}
