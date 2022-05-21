import { DBClient } from './db';
import { Singleton } from './Singleton';
export interface Task {
    id: string;
    devices_count: number;
    params: string;
    status: "new" | "ongoing" | "succeeded" | "failed";
    chunck_url?: string;
    data_type: string;
    data_type_params: string;
}

@Singleton
export class TaskRepository {
    private dbClient: DBClient = new DBClient();

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