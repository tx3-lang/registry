use std::fmt;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use async_graphql::{ComplexObject, Enum, SimpleObject, ID};

mod query;
pub use query::ProtocolQuery;

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
}

#[derive(SimpleObject, Deserialize, Serialize, Clone)]
pub struct Tx {
    tir: String,
    name: String,
    parameters: HashMap<String, String>,
}

#[ComplexObject]
impl Protocol {
    async fn transactions(&self) -> Vec<Tx> {
        let mut txs = vec![];
        let protocol = tx3_lang::Protocol::from_string(self.source.clone().unwrap()).load().unwrap();
        for tx in protocol.txs() {
            let prototx = protocol.new_tx(tx.name.as_str()).unwrap();
            let mut parameters: HashMap<String, String> = HashMap::new();
            for param in prototx.find_params() {
                parameters.insert(param.0.clone(), format!("{:?}", param.1));
            }
            txs.push(Tx {
                tir: hex::encode(prototx.ir_bytes()),
                name: tx.name.clone(),
                parameters,
            });
        }
        txs
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