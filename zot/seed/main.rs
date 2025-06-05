use std::fs;
use oci_client::{client::{Config, ImageLayer}, manifest, secrets::RegistryAuth, Client, Reference};
use serde::{Deserialize, Serialize};
use serde_json::Number;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct DataJson {
    pub protocols: Vec<ProtocolJson>
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ProtocolJson {
    pub name: String,
    pub scope: String,
    pub published_date: Number,
    pub repository_url: Option<String>,
    pub protocol_path: String,
    pub readme: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct Metadata {
    pub name: String,
    pub scope: String,
    pub published_date: i64,
    pub repository_url: Option<String>,
}

fn get_client() -> Client {
    let client_config = oci_client::client::ClientConfig {
        protocol: oci_client::client::ClientProtocol::Http,
        ..Default::default()
    };

    return Client::new(client_config);
}

const MARKDOWN_MEDIA_TYPE: &str = "text/markdown";
const PROTOCOL_MEDIA_TYPE: &str = "application/tx3";

async fn push(protocol: &ProtocolJson, protocol_file: String) -> Result<(), Box<dyn std::error::Error>> {

    let mut layers = vec![];

    layers.push(
        ImageLayer::new(
            protocol_file.as_bytes().to_vec(),
            PROTOCOL_MEDIA_TYPE.to_string(),
            None
        )
    );

    if protocol.readme.is_some() {
        layers.push(
            ImageLayer::new(
                protocol.readme.clone().unwrap().as_bytes().to_vec(),
                MARKDOWN_MEDIA_TYPE.to_string(),
                None
            )
        );
    }

    let config = Config {
        data: serde_json::to_vec(&Metadata {
            name: protocol.name.clone(),
            scope: protocol.scope.clone(),
            published_date: protocol.published_date.as_i64().unwrap_or_default(),
            repository_url: protocol.repository_url.clone()
        })?,
        media_type: manifest::IMAGE_CONFIG_MEDIA_TYPE.to_string(),
        annotations: None,
    };

    // Image manifest
    let image_manifest = manifest::OciImageManifest::build(
        &layers,
        &config,
        Some(std::collections::BTreeMap::from([
            (
                "org.opencontainers.image.created".to_string(),
                chrono::DateTime::from_timestamp(protocol.published_date.as_i64().unwrap_or_default(), 0)
                .unwrap()
                .to_rfc3339()
            ),
            ("org.opencontainers.image.vendor".to_string(), protocol.scope.clone()),
            ("org.opencontainers.image.title".to_string(), protocol.name.clone()),
            ("org.opencontainers.image.version".to_string(), "1.0.0".to_string()),
            ("org.opencontainers.image.source".to_string(), protocol.repository_url.clone().unwrap_or_default()),
        ]))
    );

    let reference = Reference::try_from(format!("localhost:3000/{}/{}:1.0.0", protocol.scope, protocol.name))?;

    let client = get_client();

    let auth = RegistryAuth::Anonymous;

    let digest =  client.push(&reference, &layers, config, &auth, Some(image_manifest)).await?;

    println!("Config URL: {}", digest.config_url);
    println!("Manifest URL: {}", digest.manifest_url);

    Ok(())
}

async fn pull(repo: &str, version: &str) -> Result<(), Box<dyn std::error::Error>> {

    let reference = Reference::try_from(format!("localhost:3000/{}:{}", repo, version))?;

    let client = get_client();

    let auth = RegistryAuth::Anonymous;

    let content = client.pull(&reference, &auth, vec![MARKDOWN_MEDIA_TYPE, PROTOCOL_MEDIA_TYPE]).await?;

    println!("Config Metadata: {:?}", content.config.data);

    content.layers.iter().for_each(|layer| {
        println!("Layer: {:?}", layer.media_type);
        println!("Layer data: {:?}", layer.data);
    });

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let json = fs::read_to_string("../../data/data.json").expect("Unable to read file");
    let data: DataJson = serde_json::from_str(&json).expect("Unable to parse");

    for protocol in data.protocols.iter() {
        let protocol_file = fs::read_to_string(format!("../../data/{}", protocol.protocol_path)).expect("Unable to read file");
        push(protocol, protocol_file).await?;
    }

    // pull("txpipe/asteria", "1.0.0").await?;

    Ok(())
}