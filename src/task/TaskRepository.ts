import { DBClient } from '../common/db';
import { Singleton } from '../common/Singleton';
export interface Task {
    id: string;
    devices_count: number;
    params: string;
    status: "new" | "ongoing" | "succeeded" | "failed";
	multipleFiles: boolean;
    chunkUrl?: string;
    dataType: string;
    dataTypeParams: string;
}

@Singleton
export class TaskRepository {
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

    public async getMinTask() {
        const session = this.dbClient.getSession();
        let task: Task | null = null;
        try {
            const res = await session.readTransaction(tx => 
                tx.run(`MATCH (t:TASK) RETURN t ORDER BY t.devices_count LIMIT 1`)
            );
            const rec = res.records[0].get('t');
            task = { ...rec.properties }
        } catch (err) {
            console.error(err)
        }

        return task;
    }
}