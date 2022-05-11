import { Singleton } from "./Singleton";
import neo4j, { Driver, Session } from 'neo4j-driver';

@Singleton
export class DBClient {
    private client: Driver;
    
    constructor() {
        this.client = neo4j.driver(
            <string>process.env.DB_HOST, neo4j.auth.basic(<string>process.env.DB_USERNAME, <string>process.env.DB_PASSWORD));
        this._connect();

    }

    private async _connect() {
        try {
            await this.client.verifyConnectivity()
            console.log('Driver created')
        } catch (error) {
            console.log(`connectivity verification failed. ${error}`)
        }
    }

    public getSession(): Session {
        return this.client.session();
    }

    public async closeConnection() {
        await this.client.close();
    }
}