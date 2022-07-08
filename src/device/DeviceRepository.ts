import { DBClient } from '../common/db';
import { WebSocket } from 'ws';
import { Singleton } from "../common/Singleton";
import { createClient, RedisClientType } from 'redis'
import neo4j from 'neo4j-driver';
import { DeviceStatus, DISCONNECTED } from './DeviceStatus';

interface Device {
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
		const session = (new DBClient()).getSession();
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

	public async getAllDevices()
	{
		const session = (new DBClient()).getSession();
		let devices: Device[] = [];

		try
		{
			const res = await session.readTransaction(tx => 
                tx.run("MATCH (d:DEVICE)  RETURN d ")    
            );
            devices = res.records.map(record => ({
                ...record.get('d').properties,
            }))
		} catch (err)
		{
			console.error(`Neo4j GET devices Error: `, err);
		} finally
		{
			session.close();
		}
		return devices;
	}

	public async updateDevice(device: Partial<Device>)
	{
		const session = (new DBClient()).getSession();
		const lastLoginDate = device.last_login ?? new Date();
		try
		{
			const editString = this._makeEditString(device, 'd');
			const editObject = { ...device, last_login: neo4j.types.DateTime.fromStandardDate(lastLoginDate) };
			const res = await session.writeTransaction(tx =>
				tx.run(`MATCH (d:DEVICE {id: $id}) ${editString} RETURN d`, editObject)
			);
			console.log("Device status and login updated: ", editObject);
		} catch (err)
		{
			console.error(`Neo4j Update Error: `, err);
		} finally
		{
			console.log(`Device updated ${device.id}`);
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
        const session = (new DBClient()).getSession();
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

	public async connectDeviceToTask(deviceId: string, taskId: string, number: number) {
		const session = (new DBClient()).getSession();
		try {
		  await session.writeTransaction((tx) =>
			tx.run(`MATCH (d:DEVICE {id: $deviceId}), (t:TASK {id: $taskId}) CREATE (d)-[r:WORKS_ON {number: $number}]->(t)`, { deviceId, taskId, number })
		  );
		} catch (err) {
		  console.error("Neo4j connect error", err);
		} finally {
		  session.close();
		}
	}
	
	public async disconnectDeviceFromTask(deviceId: string, taskId: string) {
		const session = (new DBClient()).getSession();
		try {
			await session.writeTransaction((tx) => tx.run(`MATCH (d:DEVICE {id: $deviceId})-[r:WORKS_ON]->(t:TASK {id: $taskId}) DELETE r`, { deviceId, taskId }));
		} catch (err) {
			console.error("Neo4j disconnect error", err);
		} finally {
			session.close();
		}
	}
	
	public async makeDevicesMesh(sourceId: string, otherDevicesId: string[], taskId: string) {
		
		try {
			otherDevicesId.forEach(async (deviceId) => {
				const session = (new DBClient()).getSession();
			await session.writeTransaction((tx) =>
				tx.run(
				`MATCH (source:DEVICE {id: $sourceId}), (destination:DEVICE {id: $deviceId}) CREATE (source)-[r:WORKS_WITH {taskId: $taskId}]->(destination)`,
				{
					sourceId,
					deviceId,
					taskId,
				}
				)
			);
			await session.close();
			});
		} catch (err) {
			console.error("Neo4j mesh error", err);
		} finally {
			//session.close();
		}
	}
	

	public async resetAllDevicesStatus() {
		const session = (new DBClient()).getSession();
		try
		{
			const res = await session.writeTransaction(tx =>
				tx.run(`MATCH (d:DEVICE) SET d.status="${DISCONNECTED}" RETURN d`)
			);
			console.log("All devices are diconnected");
		} catch (err)
		{
			console.error(`Neo4j Update Error: `, err);
		} finally
		{
			session.close();
		}
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
