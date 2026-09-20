import type Redis from "ioredis";

const grantableModels = new Set([
  "AccessToken",
  "AuthorizationCode",
  "RefreshToken",
  "DeviceCode",
  "BackchannelAuthenticationRequest",
  "PreAuthorizedCode"
]);

export class RedisAdapter {
  public constructor(
    private readonly model: string,
    private readonly redis: Redis
  ) {}

  private key(id: string): string {
    return `oidc:${this.model}:${id}`;
  }

  private indexKey(type: string, value: string): string {
    return `oidc:index:${type}:${value}`;
  }

  public async upsert(id: string, payload: Record<string, unknown>, expiresIn: number): Promise<void> {
    const key = this.key(id);
    const serialized = JSON.stringify(payload);
    const ttl = Math.max(1, expiresIn);
    const pipeline = this.redis.multi().set(key, serialized, "EX", ttl);

    if (this.model === "Session" && typeof payload.uid === "string") {
      pipeline.set(this.indexKey("sessionUid", payload.uid), id, "EX", ttl);
    }
    if (typeof payload.userCode === "string") {
      pipeline.set(this.indexKey("userCode", payload.userCode), id, "EX", ttl);
    }
    if (grantableModels.has(this.model) && typeof payload.grantId === "string") {
      pipeline.sadd(this.indexKey("grant", payload.grantId), key);
      pipeline.expire(this.indexKey("grant", payload.grantId), ttl);
    }
    await pipeline.exec();
  }

  public async find(id: string): Promise<Record<string, unknown> | undefined> {
    const value = await this.redis.get(this.key(id));
    return value ? JSON.parse(value) as Record<string, unknown> : undefined;
  }

  public async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
    const id = await this.redis.get(this.indexKey("sessionUid", uid));
    return id ? this.find(id) : undefined;
  }

  public async findByUserCode(userCode: string): Promise<Record<string, unknown> | undefined> {
    const id = await this.redis.get(this.indexKey("userCode", userCode));
    return id ? this.find(id) : undefined;
  }

  public async consume(id: string): Promise<void> {
    const key = this.key(id);
    const payload = await this.find(id);
    if (payload) {
      await this.redis.set(key, JSON.stringify({ ...payload, consumed: Math.floor(Date.now() / 1000) }), "KEEPTTL");
    }
  }

  public async destroy(id: string): Promise<void> {
    const key = this.key(id);
    const payload = await this.find(id);
    const pipeline = this.redis.multi().del(key);
    if (payload && typeof payload.uid === "string") pipeline.del(this.indexKey("sessionUid", payload.uid));
    if (payload && typeof payload.userCode === "string") pipeline.del(this.indexKey("userCode", payload.userCode));
    if (payload && typeof payload.grantId === "string") pipeline.srem(this.indexKey("grant", payload.grantId), key);
    await pipeline.exec();
  }

  public async revokeByGrantId(grantId: string): Promise<void> {
    const grantKey = this.indexKey("grant", grantId);
    const keys = await this.redis.smembers(grantKey);
    if (keys.length > 0) await this.redis.del(...keys);
    await this.redis.del(grantKey);
  }
}