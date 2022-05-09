import { Singleton } from "./Singleton";
import { createClient, RedisClientType } from 'redis'


@Singleton
export class MemoryStorage {
    private client: RedisClientType;
    
    constructor(url: string | undefined) {
        this.client = createClient({ url });

        this.client.on('error', (err) => {
            console.error("Redis Error: ", err);
        });

        this._connect();
    }

    private async _connect() {
        try {
            await this.client.connect();
        } catch (err) {
            console.error("Couldn't connect to redis: ", err);
        }
    }

    public async set(key: string, value: string  | null) {
        try {
            
            await this.client.set(`${key}`, `${value}`);
        } catch (err) {
            console.error(`Couldn't set value of ${key} to redis: `, err);
        }
    }

    public async get(key: string): Promise<string | null | undefined> {
        try {
            const val = await this.client.get(key);
            return val;
        } catch (err) {
            console.error(`Couldn't get value of ${key} from redis: `, err);
        }
    }
}