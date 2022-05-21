import { DBClient } from './db';
import { WebSocket } from 'ws';
import { Singleton } from "./Singleton";
import { createClient, RedisClientType } from 'redis'
import neo4j from 'neo4j-driver';

type DeviceStatus = "disconnected" | "idle" | "busy";

interface Device
{
	id: string;
	address: string;
	status: DeviceStatus;
	last_login: Date;
}


@Singleton
export class DeviceRepository
{
	private client: RedisClientType;
	private dbClient: DBClient;
	private socketStore: Map<string, WebSocket | null>;
	public devices: Device[];

	constructor(url: string | undefined)
	{
		this.client = createClient({ url });
		this.socketStore = new Map<string, WebSocket | null>();
		this.dbClient = new DBClient();
		this.devices = [];
		this.client.on('error', (err) =>
		{
			console.error("Redis Client Error: ", err);
		});

		this._connect();
	}

	private async _connect()
	{
		try
		{
			await this.client.connect();
		} catch (err)
		{
			console.error("Couldn't connect to redis: ", err);
		}
	}

	private _makeEditString(object: Object, varName: string): string
	{
		return Object.entries(object)
			.filter(([ k, v ]) => k !== 'id' && v !== undefined)
			.reduce((acc, [ k, _ ], i, a) =>
			{
				if (acc === '') acc += 'SET ';
				acc += `${varName}.${k} = $${k}${(i < a.length - 1) ? ',' : ''} `;
				return acc;
			}, '');
	}

	public async createDevice(device: Device)
	{
		const session = this.dbClient.getSession();
		try
		{
			await session.writeTransaction(tx =>
				tx.run(
					"CREATE (newDevice:DEVICE) SET newDevice.id = $id, newDevice.address = $address, newDevice.status = $status, newDevice.last_login = $last_login",
					{
						...device,
						last_login: neo4j.types.DateTime.fromStandardDate(device.last_login),
					}
				)
			);
			this.devices.push(device);
		} catch (err)
		{
			console.error("Neo4J store error", err);
		} finally
		{
			session.close();
		}
	}

	public async updateDevice(device: Partial<Device>)
	{
		const session = this.dbClient.getSession();
		const lastLoginDate = device.last_login ?? new Date();
		try
		{
			const res = await session.writeTransaction(tx =>
				tx.run(`MATCH (d:DEVICE {id: $id}) ${this._makeEditString(device, 'd')} RETURN d`, { ...device, last_login: neo4j.types.DateTime.fromStandardDate(lastLoginDate) })
			);
			console.log(`Found ${res.records.length}`);
			console.log("Device status and login updated");
		} catch (err)
		{
			console.error(`Neo4j Update Error: `, err);
		} finally
		{
			session.close();
		}
	}

	public async setStatus(key: string, value: DeviceStatus)
	{
		try
		{

			await this.client.set(`${key}`, `${value}`);
		} catch (err)
		{
			console.error(`Couldn't set value of ${key} to redis: `, err);
		}
	}

	public async getStatus(key: string): Promise<DeviceStatus | null>
	{
		try
		{
			return await this.client.get(key) as DeviceStatus;
		} catch (err)
		{
			console.error(`Couldn't get value of ${key} from redis: `, err);
			return null
		}
	}

    public async getNIdleDevices(n: number): Promise<Device[]> {
        const session = this.dbClient.getSession();
        let devices: Device[] = [];

        try {
            const res = await session.readTransaction(tx => 
                tx.run("MATCH (d:DEVICE) WHERE d.status = \"idle\" RETURN d LIMIT $n", { n })    
            );

            devices = res.records.map(record => ({
                ...record.get('d').properties,
            }))
        } catch (err) {
            console.error("Neo4j Read error: ", err);
        }

        return devices;
    }

    public setSocket(id: string, socket: WebSocket | null): void
	{
		this.socketStore.set(id, socket);
	}

	public getSocket(id: string): WebSocket | null | undefined
	{
		return this.socketStore.get(id);
	}

    public disconnectDevice(deviceId: string) {
        this.updateDevice({
            id: deviceId,
            status: "disconnected",
        });
        this.setStatus(deviceId, "disconnected");
        this.setSocket(deviceId, null);
    }
}