use std::fmt;
// use serde::{Deserialize, Serialize};
use async_graphql::{ComplexObject, Enum, SimpleObject, ID};

mod query;
pub use query::ProtocolQuery;
use tx3_tir::reduce::Apply;

use crate::ast_to_svg;

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct Protocol {
    id: ID,
    name: String,
    scope: String,
    repository_url: Option<String>,
    published_date: i64,
    version: String,
    readme: Option<String>,
    source: Option<String>,
    description: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct TxParam {
    name: String,
    r#type: String,
    description: Option<String>,
}

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct Tx {
    name: String,
    description: Option<String>,
    parameters: Vec<TxParam>,
    tir: String,
    tir_version: String,

    #[graphql(skip)]
    protocol_source: Option<String>,
}

#[ComplexObject]
impl Protocol {
    async fn transactions(&self) -> Vec<Tx> {
        let mut txs = vec![];
        let code = self.source.clone().unwrap();
        let mut protocol = tx3_lang::parsing::parse_string(&code).unwrap();
        tx3_lang::analyzing::analyze(&mut protocol);
        for tx in &protocol.txs {
            let tx_tir = tx3_lang::lowering::lower(&protocol, &tx.name.value.clone()).unwrap();
            let mut parameters: Vec<TxParam> = Vec::new();
            for (name, ty) in tx_tir.params() {
                parameters.push(TxParam {
                    name: name.clone(),
                    r#type: format!("{:?}", ty.clone()),
                    // TODO: Add description when supported in tx3-lang
                    description: None,
                });
            }
            parameters.sort_by_key(|p| p.name.clone());
            let tx_tir = tx3_lang::lowering::lower(&protocol, &tx.name.value.clone()).unwrap();

            let (tx_bytes, version) = tx3_tir::encoding::to_bytes(&tx_tir);

            txs.push(Tx {
                name: tx.name.value.clone(),
                // TODO: Add description when supported in tx3-lang
                description: None,
                parameters,
                tir: hex::encode(tx_bytes),
                tir_version: version.to_string(),
                protocol_source: self.source.clone(),
            });
        }
        txs
    }
}

#[ComplexObject]
impl Tx {
    async fn svg(&self) -> Option<String> {
        if let Some(source) = &self.protocol_source {
            let ast = tx3_lang::parsing::parse_string(source).unwrap();
            let tx_def = ast.txs.iter().find(|t| t.name.value == self.name)?;
            Some(ast_to_svg::tx_to_svg(&ast, tx_def, self.parameters.iter().map(|p| p.name.clone()).collect()))
        } else {
            None
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum ProtocolSort {
    AlphabeticAsc,
    AlphabeticDsc,
    UpdateTime,
    Relevance,
    Downloads,
}

impl fmt::Display for ProtocolSort {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ProtocolSort::AlphabeticAsc => write!(f, "ALPHABETIC_ASC"),
            ProtocolSort::AlphabeticDsc => write!(f, "ALPHABETIC_DSC"),
            ProtocolSort::Relevance => write!(f, "RELEVANCE"),
            ProtocolSort::UpdateTime => write!(f, "UPDATE_TIME"),
            ProtocolSort::Downloads => write!(f, "DOWNLOADS"),
        }
    }
}