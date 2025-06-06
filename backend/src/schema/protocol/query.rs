use async_graphql::{connection::Edge, types::connection::Connection, Context, Error, Object, ID};
use urlencoding::encode;

use crate::{oci, schema::pagination::AdditionalInfo};
use super::{Protocol, ProtocolSort};

#[derive(Default)]
pub struct ProtocolQuery;

#[Object]
impl ProtocolQuery {
    async fn protocols(
        &self,
        ctx: &Context<'_>,
        page_size: Option<i32>,
        offset: Option<i32>,
        search: Option<String>,
        sort_by: Option<ProtocolSort>,
    ) -> Result<Connection<usize, Protocol, AdditionalInfo>, Error> {
        let _offset = offset.unwrap_or(0);
        let _page_size = page_size.unwrap_or(15).min(30);
        let registry_api = oci::get_registry_api_url();
        let query_param = format!(r#"
            query GlobalSearch {{
                GlobalSearch(requestedPage: {{ limit: {}, offset: {}, sortBy: {} }}, query: "{}") {{
                    Page {{ TotalCount ItemCount }}
                    Repos {{
                        Name
                        NewestImage {{ Tag Vendor Title Source Description LastUpdated }}
                    }}
                }}
            }}
        "#, _page_size, _offset, sort_by.unwrap_or(ProtocolSort::AlphabeticAsc), search.unwrap_or_default());
        

        let encode_query = encode(&query_param);
        let url = format!("{}/_zot/ext/search?query={}", registry_api, encode_query);
        let response = reqwest::get(&url).await?.json::<oci::ZotResponse>().await?;

        if response.error.is_some() {
            println!("error: {:?}", response.error);
            return Ok(Connection::with_additional_fields(false, false, AdditionalInfo::empty()));
        }

        if response.data.is_some() {
            let data = response.data.unwrap();
        
            if data.global_search.is_some() {
                let info = data.global_search.unwrap();
                let offset_usize = _offset as usize;
                let page = info.page.unwrap_or(oci::PageInfo { total_count: 0, item_count: 0 });
                let mut connection = Connection::with_additional_fields(
                    _offset > 0,
                    (offset_usize + page.item_count as usize) < page.total_count as usize,
                    AdditionalInfo::new(page.total_count as usize, page.item_count as usize),
                );
                
                if let Some(repos) = info.repos {
                    for (idx, repo) in repos.iter().enumerate() {

                        let mut source = None;
                        if ctx.look_ahead().field("nodes").field("source").exists() {
                            let oci_image = oci::get_oci_image(&repo.name, &repo.newest_image.tag.clone().unwrap()).await?;
                            source = oci::get_protocol(&oci_image);
                        }

                        let published_date = if let Some(published_date) = &repo.newest_image.last_updated {
                            chrono::DateTime::parse_from_rfc3339(&published_date)
                                .unwrap()
                                .timestamp()
                        } else { 0 };

                        let protocol = Protocol {
                            id: ID::from(repo.name.clone()),
                            name: repo.newest_image.title.clone().unwrap_or_default(),
                            scope: repo.newest_image.vendor.clone().unwrap_or_default(),
                            version: repo.newest_image.tag.clone().unwrap_or_default(),
                            repository_url: repo.newest_image.source.clone(),
                            description: repo.newest_image.description.clone(),
                            published_date,
                            source,
                            readme: None,
                        };

                        connection.edges.push(Edge::new(offset_usize + idx, protocol));
                    }
                }
                
                return Ok::<_, Error>(connection)
            }
        }

        return Ok(Connection::with_additional_fields(false, false, AdditionalInfo::empty()));
    }

    async fn protocol(&self, scope: String, name: String) -> Result<Option<Protocol>, Error> {
        let repo = format!("{}/{}", scope, name);

        let registry_api = oci::get_registry_api_url();
        let query_param = format!(r#"
            query ExpandedRepoInfo {{
                ExpandedRepoInfo(repo: "{}") {{
                    Summary {{
                        Name
                        NewestImage {{ Tag Vendor Title Source Description LastUpdated }}
                    }}
                }}
            }}
        "#, repo);

        let encode_query = encode(&query_param);
        let url = format!("{}/_zot/ext/search?query={}", registry_api, encode_query);
        let response = reqwest::get(&url).await?.json::<oci::ZotResponse>().await?;

        if response.error.is_some() {
            println!("error: {:?}", response.error);
            return Ok(None);
        }

        if let Some(data) = response.data {
            if let Some(info) = data.expanded_repo_info {
                if let Some(summary) = info.summary {
                    let tag =  summary.newest_image.tag.unwrap_or_default();
                    let oci_image = Some(oci::get_oci_image(&repo, &tag).await?);

                    let readme = oci::get_readme(oci_image.as_ref().unwrap());
                    let source = oci::get_protocol(oci_image.as_ref().unwrap());

                    let published_date = if let Some(published_date) = summary.newest_image.last_updated {
                        chrono::DateTime::parse_from_rfc3339(&published_date)
                            .unwrap()
                            .timestamp()
                    } else { 0 };

                    let protocol = Protocol {
                        id: ID::from(summary.name.clone()),
                        version: tag,
                        name: summary.newest_image.title.unwrap_or_default(),
                        scope: summary.newest_image.vendor.unwrap_or_default(),
                        repository_url: summary.newest_image.source,
                        description: summary.newest_image.description,
                        published_date,
                        source,
                        readme,
                    };

                    return Ok(Some(protocol));
                }
            }
        }
        
        return Ok(None);
        
    }
}
