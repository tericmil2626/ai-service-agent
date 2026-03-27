declare module '@signalwire/compatibility-api' {
  export class RestClient {
    constructor(projectId: string, token: string, options?: { signalwireSpaceUrl?: string });
    messages: {
      create(params: { body: string; from: string; to: string }): Promise<{ sid: string }>;
    };
    calls: {
      create(params: { url: string; to: string; from: string }): Promise<{ sid: string }>;
    };
  }
}
