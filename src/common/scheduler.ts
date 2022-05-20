import { Singleton } from './Singleton';
import { DBClient } from './db';

@Singleton
export class scheduler
{
	constructor()
	{
		this.start = this.start.bind(this);
	}
	start()
	{
		console.log('scheduler started');
		setInterval(() =>
		{
			console.log('scheduler tick');
		}, 1000);
	}
}