use oci_client::{client::ImageData, secrets::RegistryAuth, Client, Reference};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

const MARKDOWN_MEDIA_TYPE: &str = "text/markdown";
const PROTOCOL_MEDIA_TYPE: &str = "application/tx3";
const TII_MEDIA_TYPE: &str = "application/tii+json";
const LOGO_PNG_MEDIA_TYPE: &str = "image/png";

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZotResponse {
    pub error: Option<Value>,
    pub data: Option<Data>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    #[serde(rename = "GlobalSearch")]
    pub global_search: Option<GlobalSearchResult>,
    #[serde(rename = "ExpandedRepoInfo")]
    pub expanded_repo_info: Option<RepoInfo>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchResult {
    #[serde(rename = "Page")]
    pub page: Option<PageInfo>,
    #[serde(rename = "Repos")]
    pub repos: Option<Vec<RepoSummary>>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    #[serde(rename = "TotalCount")]
    pub total_count: i64,
    #[serde(rename = "ItemCount")]
    pub item_count: i64,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSummary {
    #[serde(rename = "Name")]
    pub name: String,
    #[serde(rename = "NewestImage")]
    pub newest_image: Option<ImageSummary>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSummary {
    #[serde(rename = "Tag")]
    pub tag: Option<String>,
    #[serde(rename = "Vendor")]
    pub vendor: Option<String>,
    #[serde(rename = "Title")]
    pub title: Option<String>,
    #[serde(rename = "Source")]
    pub source: Option<String>,
    #[serde(rename = "Description")]
    pub description: Option<String>,
    #[serde(rename = "LastUpdated")]
    pub last_updated: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    #[serde(rename = "Summary")]
    pub summary: Option<RepoSummary>,
    #[serde(rename = "Images")]
    pub images: Option<Vec<ImageSummary>>,
}

// MARK: Custom functions
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct ProtocolJson {
    pub name: String,
    pub scope: String,
    pub repository_url: Option<String>,
    pub published_date: Number,
}

pub fn get_registry_api_url() -> String {
    let registry_host = std::env::var("REGISTRY_HOST").unwrap_or_default();
    let registry_protocol = std::env::var("REGISTRY_PROTOCOL").unwrap_or_default();
    
    return format!("{}://{}/v2", registry_protocol, registry_host);
}

fn get_client() -> Client {
    let registry_protocol = std::env::var("REGISTRY_PROTOCOL").unwrap_or_default();

    let client_config = oci_client::client::ClientConfig {
        protocol: if registry_protocol == "http" {
            oci_client::client::ClientProtocol::Http
        } else {
            oci_client::client::ClientProtocol::Https
        },
        ..Default::default()
    };

    return Client::new(client_config);
}

/// Resolve the newest tag for a `<scope>/<name>` repo via the zot search API.
/// Returns `None` when the repo does not exist or has no images.
pub async fn newest_tag(repo: &str) -> Result<Option<String>, Box<dyn std::error::Error + Send + Sync>> {
    let registry_api = get_registry_api_url();
    let query = format!(
        r#"query ExpandedRepoInfo {{ ExpandedRepoInfo(repo: "{}") {{ Summary {{ Name NewestImage {{ Tag }} }} Images {{ Tag }} }} }}"#,
        repo
    );
    let url = format!("{}/_zot/ext/search?query={}", registry_api, urlencoding::encode(&query));
    let response = reqwest::get(&url).await?.json::<ZotResponse>().await?;

    let Some(data) = response.data else { return Ok(None) };
    let Some(info) = data.expanded_repo_info else { return Ok(None) };

    if let Some(summary) = info.summary {
        if let Some(image) = summary.newest_image {
            if image.tag.is_some() {
                return Ok(image.tag);
            }
        }
    }
    if let Some(images) = info.images {
        if let Some(first) = images.into_iter().next() {
            return Ok(first.tag);
        }
    }
    Ok(None)
}

pub async fn get_oci_image(repo: &str, tag: &str) -> Result<ImageData, Box<dyn std::error::Error + Send + Sync>> {
    let registry_host = std::env::var("REGISTRY_HOST").unwrap_or_default();
    let reference = Reference::try_from(format!("{}/{}:{}", registry_host, repo, tag))?;
    let client = get_client();
    let auth = RegistryAuth::Anonymous;

    let content = client.pull(
        &reference,
        &auth,
        vec![MARKDOWN_MEDIA_TYPE, PROTOCOL_MEDIA_TYPE, TII_MEDIA_TYPE, LOGO_PNG_MEDIA_TYPE]
    ).await?;

    Ok(content)
}

pub fn get_readme(image: &ImageData) -> Option<String> {
    let readme = image.layers.iter().find(|l| l.media_type == MARKDOWN_MEDIA_TYPE);

    if let Some(readme) = readme {
        return Some(String::from_utf8_lossy(&readme.data).to_string());
    }

    return None;
}

pub fn get_protocol(image: &ImageData) -> Option<String> {
    let protocol = image.layers.iter().find(|l| l.media_type == PROTOCOL_MEDIA_TYPE);

    if let Some(protocol) = protocol {
        return Some(String::from_utf8_lossy(&protocol.data).to_string());
    }

    return None;
}

pub fn get_logo_png(image: &ImageData) -> Option<Vec<u8>> {
    image
        .layers
        .iter()
        .find(|l| l.media_type == LOGO_PNG_MEDIA_TYPE)
        .map(|l| l.data.clone())
}

pub fn get_tii(image: &ImageData) -> Option<String> {
    let tii = image.layers.iter().find(|l| l.media_type == TII_MEDIA_TYPE);

    if let Some(tii) = tii {
        return Some(String::from_utf8_lossy(&tii.data).to_string());
    }

    return None;
}