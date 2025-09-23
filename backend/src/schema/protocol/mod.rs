use std::fmt;
// use serde::{Deserialize, Serialize};
use async_graphql::{ComplexObject, Enum, SimpleObject, ID};

mod query;
pub use query::ProtocolQuery;

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
        let protocol = tx3_lang::Protocol::from_string(self.source.clone().unwrap()).load().unwrap();
        for tx in protocol.txs() {
            let prototx = protocol.new_tx(&tx.name.value).unwrap();
            let mut parameters: Vec<TxParam> = Vec::new();
            for param in prototx.find_params() {
                parameters.push(TxParam {
                    name: param.0.clone(),
                    r#type: format!("{:?}", param.1),
                    // TODO: Add description when supported in tx3-lang
                    description: None,
                });
            }
            parameters.sort_by_key(|p| p.name.clone());
            txs.push(Tx {
                name: tx.name.value.clone(),
                // TODO: Add description when supported in tx3-lang
                description: None,
                parameters,
                tir: hex::encode(prototx.ir_bytes()),
                tir_version: tx3_lang::ir::IR_VERSION.to_string(),
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
            let protocol = tx3_lang::Protocol::from_string(source.clone()).load().unwrap();
            let ast= protocol.ast();
            let tx_def = protocol.txs().find(|t| t.name.value == self.name)?;
            Some(ast_to_svg::tx_to_svg(ast, tx_def, self.parameters.iter().map(|p| p.name.clone()).collect()))
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