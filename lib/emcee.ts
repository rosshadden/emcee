import _ from 'lodash';
import axios from 'axios';
import fs, { promises as fsp } from 'fs';
import { exec } from 'child_process';

interface ModLatestFile {
	id: number;
	displayName: string;
	fileName: string;
	downloadUrl: string;
}

interface ModFile {
	gameVersion: string;
	projectFileId: number;
	projectFileName: string;
	fileType: number;
	gameVersionFlavor: string;
}

interface Mod {
	id: number;
	name: string;
	summary: string;
	slug: string;
	latestFiles: Array<ModLatestFile>;
	gameVersionLatestFiles: Array<ModFile>;
}

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

	findMatch(results: Array<Mod>, file: string): Mod {
		const stripped = this.strip(file);
		return results.find((result) => {
			const match = this.getModFile(result);
			return match && this.strip(match.projectFileName) === stripped;
		});
	}

	async getFiles() {
		console.log('getting mod files');
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
					try {
						let data = JSON.parse(chunks);
						if (!Array.isArray(data)) data = data.modList;
						resolve(data[0]);
					} catch (ex) {
						reject(ex);
					}
				})
				.on('error', reject)
			;
		});
	}

	async process(file: string) {
		console.log(`processing ${file}`);

		console.log('\tgetting mod info');
		let modInfo: ModInfo;
		try {
			modInfo = await this.exec(`unzip -p ${file} mcmod.info`);
		} catch (ex) {
			return console.error(`\tno manifest found in ${file}`);
		}

		console.log(`\tsearching for ${modInfo.name}`);
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
				searchFilter: modInfo.name,
				sort: 0,
			}
		});

		const results: Array<Mod> = res.data.map((result: any) => {
			return _.pick(
				result,
				[
					'id',
					'name',
					'summary',
					'slug',
					'latestFiles',
					'gameVersionLatestFiles',
				]
			);
		});

		console.log('\tfinding filename match');
		const mod = this.findMatch(results, file);
		if (!mod) return console.error(`\tno match found for ${file}`);

		const modFile = this.getModFile(mod);
		if (modFile.projectFileName === file) {
			return console.log(`\tskipping already updated file ${file}`);
		}

		// download mod
		await this.downloadMod(mod, modFile);

		// remove old mod
		console.log(`\tdeleting old mod ${file}`);
		await fsp.unlink(file);
	}

	async downloadMod(mod: Mod, modFile: ModFile): Promise<void> {
		const url = await this.getUrl(mod, modFile);

		console.log(`\tdownloading ${url}`);
		const writer = fs.createWriteStream(modFile.projectFileName);
		const download = await axios.get(url, { responseType: 'stream' });

		console.log(`\tsaving to ${modFile.projectFileName}`);
		download.data.pipe(writer);

		return new Promise((resolve, reject) => {
			writer
				.on('finish', resolve)
				.on('error', reject);
		});
	}

	getModFile(mod: Mod): ModFile {
		return mod.gameVersionLatestFiles.find(({ gameVersion }) => gameVersion === this.version);
	}

	async getUrl(mod: Mod, modFile: ModFile): Promise<string> {
		console.log('\tgetting mod file url');
		const res = await this.curse.get(`/addon/${mod.id}/file/${modFile.projectFileId}`);
		return res.data.downloadUrl;
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
		}
	}
}
