import { DBClient } from './db';
export interface Task {
    id: string;
    devices_count: number;
    params: string;
    status: "new" | "ongoing" | "succeeded" | "failed";
    model_url?: string;
    chunck_url?: string;
}

export class TaskRepository {
    private dbClient: DBClient = new DBClient();
}