declare module "oidc-provider" {
  export default class Provider {
    public constructor(issuer: string, configuration: Record<string, unknown>);
    public callback(): (request: unknown, response: unknown, next?: unknown) => unknown;
  }
}