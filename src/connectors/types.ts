
export interface DocMetadata {
  id: string;
  title: string;
  url: string;
  type: 'feishu' | 'notion' | 'local';
  lastModified?: number;
  owner?: string;
}

export interface DocContent {
  metadata: DocMetadata;
  markdown: string; // The parsed content in markdown format
  raw?: any; // Original raw data (optional)
}

export interface DocConnector {
  /**
   * Fetch and parse a document by its ID or URL
   */
  fetch(docIdOrUrl: string): Promise<DocContent>;
  
  /**
   * Validate if the connector can handle this URL/ID
   */
  canHandle(docIdOrUrl: string): boolean;
}
