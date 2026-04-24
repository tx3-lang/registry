use std::collections::HashMap;
use std::fmt;
use async_graphql::{ComplexObject, Enum, SimpleObject, ID};
use serde::Deserialize;

mod query;
pub use query::ProtocolQuery;
use tx3_tir::reduce::Apply;

use crate::ast_to_svg;

/// Minimal TII structs for deserializing the TII layer from OCI.
/// Mirrors the spec from tx3-sdk without pulling in the full SDK dependency.
#[derive(Debug, Clone, Deserialize)]
pub struct TiiFile {
    pub transactions: HashMap<String, TiiTransaction>,
    #[serde(default)]
    pub parties: HashMap<String, TiiParty>,
    #[serde(default)]
    pub profiles: HashMap<String, TiiProfile>,
    pub environment: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TiiTransaction {
    pub tir: TiiTirEnvelope,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TiiTirEnvelope {
    pub content: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TiiParty {
    pub description: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TiiProfile {
    pub description: Option<String>,
    #[serde(default)]
    pub environment: serde_json::Value,
    #[serde(default)]
    pub parties: HashMap<String, String>,
}

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

    #[graphql(skip)]
    pub(super) tii: Option<TiiFile>,
}

#[derive(SimpleObject, Clone)]
pub struct Party {
    name: String,
    description: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct EnvironmentParam {
    name: String,
    description: Option<String>,
    r#type: String,
}

#[derive(SimpleObject, Clone)]
pub struct ProfileParty {
    name: String,
    address: String,
}

#[derive(SimpleObject, Clone)]
pub struct Profile {
    name: String,
    description: Option<String>,
    environment: Option<String>,
    parties: Vec<ProfileParty>,
}

#[derive(SimpleObject, Clone)]
pub struct TxParam {
    name: String,
    r#type: String,
    description: Option<String>,
}

#[derive(SimpleObject, Clone)]
pub struct TxInput {
    name: String,
    party: Option<String>,
    has_redeemer: bool,
}

#[derive(SimpleObject, Clone)]
pub struct TxOutput {
    party: Option<String>,
    has_datum: bool,
    optional: bool,
}

#[derive(SimpleObject, Clone)]
#[graphql(complex)]
pub struct Tx {
    name: String,
    description: Option<String>,
    parameters: Vec<TxParam>,
    inputs: Vec<TxInput>,
    outputs: Vec<TxOutput>,
    tir: String,
    tir_version: String,

    #[graphql(skip)]
    protocol_source: Option<String>,
}

#[ComplexObject]
impl Protocol {
    async fn transactions(&self) -> Vec<Tx> {
        if let Some(tii) = &self.tii {
            return self.transactions_from_tii(tii);
        }

        self.transactions_from_source()
    }

    async fn parties(&self) -> Vec<Party> {
        let Some(tii) = &self.tii else { return vec![] };

        tii.parties.iter().map(|(name, party)| Party {
            name: name.clone(),
            description: party.description.clone(),
        }).collect()
    }

    async fn profiles(&self) -> Vec<Profile> {
        let Some(tii) = &self.tii else { return vec![] };

        const KNOWN_ORDER: &[&str] = &["local", "preview", "preprod", "mainnet"];

        let mut profiles: Vec<Profile> = tii.profiles.iter().map(|(name, profile)| Profile {
            name: name.clone(),
            description: profile.description.clone(),
            environment: if profile.environment.is_null() {
                None
            } else {
                Some(profile.environment.to_string())
            },
            parties: profile.parties.iter().map(|(name, address)| ProfileParty {
                name: name.clone(),
                address: address.clone(),
            }).collect(),
        }).collect();

        profiles.sort_by(|a, b| {
            let pos_a = KNOWN_ORDER.iter().position(|&k| k == a.name);
            let pos_b = KNOWN_ORDER.iter().position(|&k| k == b.name);

            match (pos_a, pos_b) {
                (Some(i), Some(j)) => i.cmp(&j),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.name.cmp(&b.name),
            }
        });

        profiles
    }

    async fn environment(&self) -> Vec<EnvironmentParam> {
        let Some(tii) = &self.tii else { return vec![] };
        let Some(env) = &tii.environment else { return vec![] };
        let Some(props) = env.get("properties").and_then(|p| p.as_object()) else { return vec![] };

        props.iter().map(|(name, schema)| {
            let r#type = schema.get("type")
                .and_then(|t| t.as_str())
                .map(String::from)
                .or_else(|| {
                    schema.get("$ref")
                        .and_then(|r| r.as_str())
                        .and_then(|r| r.rsplit_once('#'))
                        .map(|(_, fragment)| fragment.to_string())
                })
                .unwrap_or_else(|| "unknown".to_string());

            EnvironmentParam {
                name: name.clone(),
                description: None,
                r#type,
            }
        }).collect()
    }
}

impl Protocol {
    fn parse_protocol(&self) -> Option<tx3_lang::ast::Program> {
        let code = self.source.as_ref()?;
        let mut protocol = tx3_lang::parsing::parse_string(code).ok()?;
        tx3_lang::analyzing::analyze(&mut protocol);
        Some(protocol)
    }

    fn extract_params(protocol: &tx3_lang::ast::Program, tx_name: &str) -> Vec<TxParam> {
        let mut parameters = vec![];

        if let Ok(tx_tir) = tx3_lang::lowering::lower(protocol, tx_name) {
            for (name, ty) in tx_tir.params() {
                parameters.push(TxParam {
                    name: name.clone(),
                    r#type: format!("{:?}", ty.clone()),
                    description: None,
                });
            }
            parameters.sort_by_key(|p| p.name.clone());
        }

        parameters
    }

    fn transactions_from_tii(&self, tii_file: &TiiFile) -> Vec<Tx> {
        tii_file.transactions.iter().map(|(name, tx)| {
            let parameters = Self::extract_params_from_tir(&tx.tir);
            let inputs = Self::extract_inputs_from_tir(&tx.tir);
            let outputs = Self::extract_outputs_from_tir(&tx.tir);

            Tx {
                name: name.clone(),
                description: tx.description.clone(),
                parameters,
                inputs,
                outputs,
                tir: tx.tir.content.clone(),
                tir_version: tx.tir.version.clone(),
                protocol_source: self.source.clone(),
            }
        }).collect()
    }

    fn decode_tir(tir: &TiiTirEnvelope) -> Option<tx3_tir::encoding::AnyTir> {
        let bytes = hex::decode(&tir.content).ok()?;
        let version = tx3_tir::encoding::TirVersion::try_from(tir.version.as_str()).ok()?;
        tx3_tir::encoding::from_bytes(&bytes, version).ok()
    }

    fn extract_params_from_tir(tir: &TiiTirEnvelope) -> Vec<TxParam> {
        let Some(any_tir) = Self::decode_tir(tir) else { return vec![] };

        let mut parameters: Vec<TxParam> = any_tir
            .params()
            .into_iter()
            .map(|(name, ty)| TxParam {
                name,
                r#type: format!("{:?}", ty),
                description: None,
            })
            .collect();

        parameters.sort_by_key(|p| p.name.clone());
        parameters
    }

    fn extract_inputs_from_tir(tir: &TiiTirEnvelope) -> Vec<TxInput> {
        let Some(tx3_tir::encoding::AnyTir::V1Beta0(tx)) = Self::decode_tir(tir) else { return vec![] };

        tx.inputs.iter().map(|input| {
            let party = ast_to_svg::extract_party_from_expr(&input.utxos);
            let has_redeemer = !input.redeemer.is_none();

            TxInput {
                name: input.name.clone(),
                party,
                has_redeemer,
            }
        }).collect()
    }

    fn extract_outputs_from_tir(tir: &TiiTirEnvelope) -> Vec<TxOutput> {
        let Some(tx3_tir::encoding::AnyTir::V1Beta0(tx)) = Self::decode_tir(tir) else { return vec![] };

        tx.outputs.iter().map(|output| {
            let party = ast_to_svg::extract_party_from_expr(&output.address);
            let has_datum = !output.datum.is_none();

            TxOutput {
                party,
                has_datum,
                optional: output.optional,
            }
        }).collect()
    }

    fn transactions_from_source(&self) -> Vec<Tx> {
        let protocol = match self.parse_protocol() {
            Some(p) => p,
            None => return vec![],
        };

        protocol.txs.iter().map(|tx| {
            let parameters = Self::extract_params(&protocol, &tx.name.value);
            let tx_tir = tx3_lang::lowering::lower(&protocol, &tx.name.value).unwrap();
            let (tx_bytes, version) = tx3_tir::encoding::to_bytes(&tx_tir);

            let tir_envelope = TiiTirEnvelope {
                content: hex::encode(&tx_bytes),
                version: version.to_string(),
            };
            let inputs = Self::extract_inputs_from_tir(&tir_envelope);
            let outputs = Self::extract_outputs_from_tir(&tir_envelope);

            Tx {
                name: tx.name.value.clone(),
                description: None,
                parameters,
                inputs,
                outputs,
                tir: tir_envelope.content,
                tir_version: tir_envelope.version,
                protocol_source: self.source.clone(),
            }
        }).collect()
    }
}

#[ComplexObject]
impl Tx {
    async fn svg(&self) -> Option<String> {
        let param_names: Vec<String> = self.parameters.iter().map(|p| p.name.clone()).collect();

        let tir_envelope = TiiTirEnvelope {
            content: self.tir.clone(),
            version: self.tir_version.clone(),
        };
        if let Some(tx3_tir::encoding::AnyTir::V1Beta0(tx)) = Protocol::decode_tir(&tir_envelope) {
            return Some(ast_to_svg::tir_to_svg(&self.name, &tx, param_names));
        }

        let source = self.protocol_source.as_ref()?;
        let ast = tx3_lang::parsing::parse_string(source).ok()?;
        let tx_def = ast.txs.iter().find(|t| t.name.value == self.name)?;
        Some(ast_to_svg::tx_to_svg(&ast, tx_def, param_names))
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