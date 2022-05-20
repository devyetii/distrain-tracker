import { DBClient } from './db';
import { Singleton } from './Singleton';
export interface Task
{
	id: string;
	devices_count: number;
	params: string;
	status: "new" | "ongoing" | "succeeded" | "failed";
}

@Singleton
export class TaskRepository
{
	private dbClient: DBClient;

	constructor()
	{
		this.dbClient = new DBClient();
	}

	public async addTask(task: Task)
	{
		const session = this.dbClient.getSession();
		try
		{
			await session.writeTransaction(tx => tx.run("CREATE (newTask:TASK) SET newTask.id = $id, newTask.devices_count = $devices_count, newTask.params = $params, newTask.status = $status", task));
		} catch (err)
		{
			console.error("Neo4J store error", err);
		} finally
		{
			console.log("task stored successfully");
			session.close();
		}
	}

	public async updateTask(task: Task)
	{
		const session = this.dbClient.getSession();
		try
		{
			await session.writeTransaction(tx => tx.run("MATCH (t:TASK {id: $id}) SET t.status = $status", task));
		} catch (err)
		{
			console.error("Neo4J store error", err);
		} finally
		{
			console.log("task updated successfully");
			session.close();
		}
	}
}