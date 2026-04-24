import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class InMemoryTransport implements Transport {
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;

  private linkedTransport?: InMemoryTransport;

  constructor() {}

  static createPair(): [InMemoryTransport, InMemoryTransport] {
    const client = new InMemoryTransport();
    const server = new InMemoryTransport();
    client.linkedTransport = server;
    server.linkedTransport = client;
    return [client, server];
  }

  async start(): Promise<void> {
    // Nothing to initialize
  }

  async close(): Promise<void> {
    if (this.onclose) this.onclose();
    if (this.linkedTransport && this.linkedTransport.onclose) {
      this.linkedTransport.onclose();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Use Promise.resolve().then to simulate async delivery and prevent deep call stacks
    Promise.resolve().then(() => {
      if (this.linkedTransport && this.linkedTransport.onmessage) {
        this.linkedTransport.onmessage(message);
      }
    });
  }
}
