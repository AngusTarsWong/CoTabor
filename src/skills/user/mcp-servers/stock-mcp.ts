import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// 创建 MCP Server 实例
const server = new Server(
  {
    name: "stock-market-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 注册可用的 Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_stock_price",
        description: "Get the current stock price and basic info for a given ticker symbol.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "The stock ticker symbol (e.g., AAPL, TSLA, MSFT)",
            },
          },
          required: ["symbol"],
        },
      },
      {
        name: "get_market_news",
        description: "Get recent news headlines for a given stock symbol.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "The stock ticker symbol",
            },
          },
          required: ["symbol"],
        },
      }
    ],
  };
});

// 处理 Tool 调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_stock_price") {
    const symbol = String(args?.symbol || "UNKNOWN").toUpperCase();
    
    // Mock 数据
    const mockData: Record<string, any> = {
      AAPL: { price: 175.50, change: "+1.2%", company: "Apple Inc." },
      TSLA: { price: 202.10, change: "-0.5%", company: "Tesla Inc." },
      MSFT: { price: 415.30, change: "+0.8%", company: "Microsoft Corp." },
    };

    const data = mockData[symbol] || { price: 100.00, change: "0.0%", company: `${symbol} Corp.` };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  if (name === "get_market_news") {
    const symbol = String(args?.symbol || "UNKNOWN").toUpperCase();
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            symbol,
            news: [
              `[Breaking] ${symbol} announces new AI product line!`,
              `[Market] Analysts upgrade ${symbol} to 'Strong Buy'.`,
              `[Finance] ${symbol} Q3 earnings beat expectations.`
            ]
          }, null, 2),
        },
      ],
    };
  }

  throw new Error(`Tool not found: ${name}`);
});

// 启动服务器
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Stock Market MCP Server running on stdio");
}

run().catch(console.error);