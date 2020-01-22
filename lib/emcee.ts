import _ from 'lodash';
import axios from 'axios';
import { exec } from 'child_process';
import { promises as fsp } from 'fs';

interface ModInfo {
	modid: string;
	name: string;
	description: string;
	version: string;
	mcversion: string;
	url: string;
	authorList: Array<string>;
	logoFile: string;
}

export default class Emcee {
	private curse = axios.create({
		baseURL: 'https://addons-ecs.forgesvc.net/api/v2',
	});

	constructor(private version: string) {}

	strip(file: string) {
		return file
			.replace(/[0-9]/g, '')
			.replace(/_/g, '-')
		;
	}

	findMatch(results: Array<any>, file: string) {
		const stripped = this.strip(file);
		return results.find((result) => {
			const match = result.gameVersionLatestFiles.find(({ gameVersion }) => gameVersion === this.version);
			return match && this.strip(match.projectFileName) === stripped;
		});
	}

	async getFiles() {
		return (await fsp.readdir('.'))
			.filter((file) => file.endsWith('.jar'));
	}

	exec<T>(cmd: string): Promise<T> {
		return new Promise((resolve, reject) => {
			let chunks = '';
			exec(cmd).stdout
				.on('data', (data) => chunks += data)
				.on('close', (code: number) => {
					if (code) reject(code);
					resolve(JSON.parse(chunks)[0]);
				})
				.on('error', reject)
			;
		});
	}

	async process(file: string) {
		console.log('updating', file);

		// get mod info
		const mod: ModInfo = await this.exec(`unzip -p ${file} mcmod.info`);

		// search API
		const res = await this.curse.get('/addon/search', {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			params: {
				categoryId: 0,
				gameId: 432,
				gameVersion: this.version,
				index: 0,
				pageSize: 25,
				searchFilter: mod.name,
				sort: 0,
			}
		});

		const results = res.data.map((result: any) => {
			return _.pick(
				result,
				[
					'id',
					'name',
					'summary',
					'latestFiles',
					'slug',
					'gameVersionLatestFiles',
				]
			);
		});

		// find filename match (after stripping remote data as well)
		const match = this.findMatch(results, file);
		if (!match) throw new Error(`No match found for ${file}`);

		console.log(match);

		// TODO: get download url for latest file of given (read: hardcoded) version

		// TODO: download to mods dir

		// TODO: remove old mod
	}

	async run() {
		const files = await this.getFiles();

		for (const file of files) {
			try {
				await this.process(file);
			} catch (ex) {
				console.error(''+ex);
				throw ex;
			}
			return;
		}
	}
}
