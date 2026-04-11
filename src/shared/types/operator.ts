export interface TableOperator {
  searchRecords(tableId: string, filter?: any): Promise<any>;
  createRecord(tableId: string, fields: any): Promise<any>;
  updateRecordByCustomId(tableId: string, customId: string, fields: any): Promise<any>;
  deleteRecordByCustomId(tableId: string, customId: string): Promise<any>;
}

export interface TableConfig {
  appId: string;
  appSecret: string;
  appToken: string; // The base token or workspace ID
  tableIds: {
    L1: string;
    L2: string;
    L3: string;
  };
}